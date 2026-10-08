#!/usr/bin/env python3
"""Merge source-backed common and pygmy hippo imports deterministically."""

from __future__ import annotations

from copy import deepcopy
import hashlib
import json
import argparse
import re
import sys
from pathlib import Path
from typing import Any


SUPPORTED_TAXA = {"Hippopotamus amphibius", "Choeropsis liberiensis"}
COLLECTIONS = ("animals", "claims", "relationships", "events", "institutions", "media", "sources")
SOURCE_TIERS = {"A", "B", "C", "D", "discovery_only"}


def _normalized(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold().strip())


def _unique_extend(target: list[Any], values: list[Any]) -> list[Any]:
    """Append values while preserving first-seen order and stable JSON identity."""
    seen = {json.dumps(value, sort_keys=True, ensure_ascii=False) for value in target}
    for value in values:
        marker = json.dumps(value, sort_keys=True, ensure_ascii=False)
        if marker not in seen:
            target.append(deepcopy(value))
            seen.add(marker)
    return target


def _tier_for(source: dict[str, Any]) -> str:
    declared = source.get("tier")
    if declared in SOURCE_TIERS:
        return declared
    source_type = re.sub(r"[\s-]+", "_", str(source.get("source_type", "")).casefold()).strip("_")
    if "discovery" in source_type:
        return "discovery_only"
    if source_type.startswith(("open_dataset", "open_studbook", "reusable_primary_dataset")):
        return "A"
    if source_type.startswith(("official_zoo", "official_institution", "institution_record", "public_zoo", "zoo_association", "specialist_group", "conservation_org", "zoo_society")):
        return "B"
    if source_type.startswith(("peer_reviewed", "journal", "research_publication")):
        return "C"
    if source_type.startswith(("community", "user_contributed", "redpanda_finder")):
        return "D"
    # Unknown source classes are not promoted to a stronger evidence tier.
    return "discovery_only"


def _merge_by_id(
    target: list[dict[str, Any]],
    incoming: list[dict[str, Any]],
    id_field: str,
    collection: str,
    *,
    merge_source_ids: bool = False,
) -> None:
    index = {record[id_field]: record for record in target}
    for record in incoming:
        key = record[id_field]
        if key not in index:
            copy = deepcopy(record)
            target.append(copy)
            index[key] = copy
            continue
        current = index[key]
        if merge_source_ids:
            if {k: v for k, v in current.items() if k != "source_ids"} != {k: v for k, v in record.items() if k != "source_ids"}:
                raise ValueError(f"conflicting {collection} record ID {key!r}")
            _unique_extend(current.setdefault("source_ids", []), record.get("source_ids", []))
        elif current != record:
            raise ValueError(f"conflicting {collection} record ID {key!r}")


def _source_payload(source: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(source)
    result["tier"] = _tier_for(result)
    return result


def _institution_key(institution: dict[str, Any]) -> tuple[str, str]:
    names = institution.get("names", [])
    name = next((item.get("value") for item in names if item.get("language") == "en"), names[0].get("value", "") if names else "")
    return _normalized(str(name)), str(institution.get("country_code") or "").upper()


def _combine_coverage(canonical: dict[str, Any], imports: list[dict[str, Any]]) -> dict[str, Any]:
    by_taxon: dict[str, dict[str, Any]] = {}
    for item in imports:
        bundle = item.get("bundle", {})
        coverage = bundle.get("coverage")
        taxa = {animal.get("taxon") for animal in bundle.get("animals", [])}
        if isinstance(coverage, dict):
            by_taxon.setdefault(coverage.get("taxon"), coverage)
        elif len(taxa) == 1:
            taxon = next(iter(taxa))
            by_taxon.setdefault(taxon, {})
    by_taxon.setdefault("Hippopotamus amphibius", canonical.get("coverage", {}))
    ordered_taxa = [taxon for taxon in ("Hippopotamus amphibius", "Choeropsis liberiensis") if taxon in by_taxon]
    scopes: list[str] = []
    source_categories: list[str] = []
    translations: dict[str, dict[str, Any]] = {"ja": {"scope": "", "limitations": []}, "ru": {"scope": "", "limitations": []}}
    for taxon in ordered_taxa:
        coverage = by_taxon[taxon]
        fallback_scope = "Selected source-backed records for " + taxon + "."
        scopes.append(str(coverage.get("scope") or fallback_scope))
        group_limits = coverage.get("limitations")
        if not isinstance(group_limits, list) or not group_limits:
            group_limits = ["This is a selected public-source subset, not a complete census or studbook."]
        source_categories.extend(str(value) for value in coverage.get("source_categories", []) if isinstance(value, str))
        localized = coverage.get("translations", {})
        for locale, fallback in (("ja", f"{taxon}の公開資料に基づく選定データです。"), ("ru", f"Выборка по публичным источникам для {taxon}.")):
            block = localized.get(locale, {}) if isinstance(localized, dict) else {}
            current_scope = translations[locale]["scope"]
            translated_scope = str(block.get("scope") or fallback)
            translations[locale]["scope"] = "; ".join(part for part in (current_scope, translated_scope) if part)
            translated_limits = block.get("limitations") if isinstance(block, dict) else None
            if not isinstance(translated_limits, list) or len(translated_limits) != len(group_limits):
                translated_limits = [fallback for _ in group_limits]
            translations[locale]["limitations"].extend(str(value) for value in translated_limits)
    # Deduplicate with a shared positional projection so every locale retains
    # one limitation per canonical English limitation.
    limitation_rows: list[tuple[str, str, str]] = []
    for taxon in ordered_taxa:
        coverage = by_taxon[taxon]
        english = coverage.get("limitations") or ["This is a selected public-source subset, not a complete census or studbook."]
        localized = coverage.get("translations", {})
        ja = (localized.get("ja", {}).get("limitations", []) if isinstance(localized, dict) else [])
        ru = (localized.get("ru", {}).get("limitations", []) if isinstance(localized, dict) else [])
        for index, text in enumerate(english):
            fallback_ja = f"{taxon}の公開資料に基づく選定データです。"
            fallback_ru = f"Выборка по публичным источникам для {taxon}."
            limitation_rows.append((
                str(text),
                str(ja[index]) if len(ja) == len(english) else fallback_ja,
                str(ru[index]) if len(ru) == len(english) else fallback_ru,
            ))
    # Preserve duplicate English meanings only once and keep their translations aligned.
    unique_rows: list[tuple[str, str, str]] = []
    seen_english: set[str] = set()
    for row in limitation_rows:
        if row[0] not in seen_english:
            unique_rows.append(row)
            seen_english.add(row[0])
    limitations = [row[0] for row in unique_rows]
    translations = {
        "ja": {"scope": translations["ja"]["scope"], "limitations": [row[1] for row in unique_rows]},
        "ru": {"scope": translations["ru"]["scope"], "limitations": [row[2] for row in unique_rows]},
    }
    dates = [coverage.get("last_reviewed") for coverage in by_taxon.values() if coverage.get("last_reviewed")]
    result = deepcopy(canonical.get("coverage", {}))
    result.update({
        "taxon": " and ".join(ordered_taxa),
        "scope": " ".join(scopes),
        "limitations": limitations,
        "last_reviewed": max(dates) if dates else canonical.get("coverage", {}).get("last_reviewed"),
        "source_categories": sorted(set(source_categories)),
        "translations": translations,
    })
    return result


def _append_conflict_claim(
    claims: list[dict[str, Any]], animal: dict[str, Any], field: str, alternate: Any,
    source_ids: list[str], import_id: str,
) -> None:
    if not source_ids:
        return
    claim_id = f"claim:import-alternate:{hashlib.sha256(f'{import_id}\0{animal['id']}\0{field}\0{json.dumps(alternate, sort_keys=True)}'.encode()).hexdigest()[:20]}"
    if any(claim.get("id") == claim_id for claim in claims):
        return
    claims.append({
        "id": claim_id,
        "subject": animal["id"],
        "claim_type": f"import_alternate_{field}",
        "value": deepcopy(alternate),
        "status": "disputed",
        "source_ids": sorted(set(source_ids)),
        "review": {
            "status": "needs_review",
            "reviewed_on": "2026-10-08",
            "notes": f"An imported source record ({import_id}) gives a different {field}; the curated canonical value is retained pending identity and source review.",
        },
    })


def merge_hippopotamus(
    canonical: dict[str, Any], imports: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Merge import bundles using explicit identity maps and strict taxon checks.

    Every import item contains ``bundle`` and may include ``animal_id_map`` and
    ``institution_id_map`` dictionaries. No animal identity is inferred from a
    name. Deterministic generated conflict IDs and sorted output make reruns stable.
    """
    atlas = deepcopy(canonical)
    report: dict[str, Any] = {
        "report_version": "1.0.0",
        "id_mappings": {},
        "animal_identity_crosswalk": [],
        "claim_id_mappings": {},
        "relationship_id_mappings": {},
        "event_id_mappings": {},
        "institution_id_mappings": {},
        "conflicts": [],
        "exclusions": [],
        "imports": [],
        "counts": {},
        "canonical_before_counts": {collection: len(canonical.get(collection, [])) for collection in COLLECTIONS},
    }
    for collection in COLLECTIONS:
        atlas.setdefault(collection, [])

    # Existing evidence is also explicitly assigned to the documented tier model.
    for source in atlas["sources"]:
        source["tier"] = _tier_for(source)

    all_animal_taxa = {record.get("taxon") for record in atlas["animals"]}
    if not all_animal_taxa.issubset(SUPPORTED_TAXA):
        raise ValueError("canonical hippopotamus atlas contains an unsupported taxon")

    animal_index = {record["id"]: record for record in atlas["animals"]}
    for import_number, item in enumerate(imports):
        bundle = deepcopy(item["bundle"])
        animal_id_map = dict(item.get("animal_id_map", {}))
        institution_id_map = dict(item.get("institution_id_map", {}))
        prefix = str(item.get("import_id", f"import-{import_number + 1}"))
        incoming_animals = bundle.get("animals", [])

        bundle_taxa = {animal.get("taxon") for animal in incoming_animals}
        if not bundle_taxa.issubset(SUPPORTED_TAXA):
            raise ValueError(f"{prefix}: unsupported hippopotamus taxon")

        report["imports"].append({
            "import_id": prefix,
            "bundle_path": item.get("bundle_path"),
            "bundle_sha256": item.get("bundle_sha256"),
            "taxa": sorted(taxon for taxon in bundle_taxa if taxon is not None),
            "counts": {collection: len(bundle.get(collection, [])) for collection in COLLECTIONS},
            "animal_id_map_entries": len(animal_id_map),
        })

        for source in bundle.get("sources", []):
            source["tier"] = _tier_for(source)
        _merge_by_id(atlas["sources"], bundle.get("sources", []), "id", "source")
        source_ids = {source["id"] for source in atlas["sources"]}

        # Exact institution name and country can safely reuse one facility record;
        # animal identity still requires an explicit crosswalk.
        current_institutions = {_institution_key(record): record["id"] for record in atlas["institutions"]}
        for institution in bundle.get("institutions", []):
            old_id = institution["id"]
            key = _institution_key(institution)
            mapped = institution_id_map.get(old_id) or current_institutions.get(key)
            if mapped:
                if mapped not in {record["id"] for record in atlas["institutions"]}:
                    raise ValueError(f"{prefix}: institution crosswalk target {mapped!r} does not exist")
                institution_id_map[old_id] = mapped
                report["institution_id_mappings"][old_id] = mapped
            else:
                _merge_by_id(atlas["institutions"], [institution], "id", "institution")
                current_institutions[key] = old_id

        for incoming in incoming_animals:
            old_id = incoming["id"]
            new_id = animal_id_map.get(old_id, old_id)
            animal_id_map[old_id] = new_id
            report["id_mappings"][old_id] = new_id
            incoming["id"] = new_id
            existing = animal_index.get(new_id)
            if existing is None:
                atlas["animals"].append(incoming)
                animal_index[new_id] = incoming
                continue
            report["animal_identity_crosswalk"].append({
                "import_id": prefix,
                "bundle_animal_id": old_id,
                "canonical_animal_id": new_id,
            })
            if existing.get("taxon") != incoming.get("taxon"):
                raise ValueError(f"{prefix}: cross-taxon animal identity mapping for {old_id!r}")
            for field in ("sex", "status"):
                current_value = existing.get(field)
                import_value = incoming.get(field)
                if current_value not in (None, "unknown") and import_value not in (None, "unknown", current_value):
                    _append_conflict_claim(atlas["claims"], existing, field, import_value, incoming.get("name", {}).get("source_ids", []), prefix)
                    report["conflicts"].append({"animal_id": new_id, "field": field, "canonical": current_value, "alternate": import_value, "source_ids": sorted(set(incoming.get("name", {}).get("source_ids", [])))})
                elif current_value in (None, "unknown") and import_value not in (None, "unknown"):
                    existing[field] = import_value
            _unique_extend(existing.setdefault("name", {}).setdefault("source_ids", []), incoming.get("name", {}).get("source_ids", []))
            _unique_extend(existing["name"].setdefault("localized", []), incoming.get("name", {}).get("localized", []))
            _unique_extend(existing.setdefault("aliases", []), incoming.get("aliases", []))
            _unique_extend(existing.setdefault("external_ids", []), incoming.get("external_ids", []))
            if existing.get("name", {}).get("canonical") != incoming.get("name", {}).get("canonical"):
                _append_conflict_claim(atlas["claims"], existing, "name", incoming["name"]["canonical"], incoming["name"].get("source_ids", []), prefix)
                report["conflicts"].append({"animal_id": new_id, "field": "name", "canonical": existing["name"]["canonical"], "alternate": incoming["name"]["canonical"], "source_ids": sorted(set(incoming["name"].get("source_ids", [])))})

        animal_ids = set(animal_id_map.values())
        for relation in bundle.get("relationships", []):
            relation["subject"] = animal_id_map.get(relation.get("subject"), relation.get("subject"))
            relation["object"] = animal_id_map.get(relation.get("object"), relation.get("object"))
            subject, obj = animal_index.get(relation["subject"]), animal_index.get(relation["object"])
            if subject is None or obj is None:
                raise ValueError(f"{prefix}: relationship endpoint is missing")
            if subject["taxon"] != obj["taxon"]:
                raise ValueError(f"{prefix}: cross-taxon relationship is prohibited")
            if relation["subject"] == relation["object"]:
                raise ValueError(f"{prefix}: self relationship is prohibited")

        for claim in bundle.get("claims", []):
            claim["subject"] = animal_id_map.get(claim.get("subject"), claim.get("subject"))
            if isinstance(claim.get("value"), str):
                claim["value"] = animal_id_map.get(claim["value"], claim["value"])
        for event in bundle.get("events", []):
            if event.get("animal_id") is not None:
                event["animal_id"] = animal_id_map.get(event["animal_id"], event["animal_id"])
            if isinstance(event.get("related_animal_ids"), list):
                event["related_animal_ids"] = [animal_id_map.get(value, value) for value in event["related_animal_ids"]]
            for field in ("institution_id", "from_institution_id", "to_institution_id"):
                if event.get(field) is not None:
                    event[field] = institution_id_map.get(event[field], event[field])
        for media in bundle.get("media", []):
            media["animal_id"] = animal_id_map.get(media.get("animal_id"), media.get("animal_id"))

        # Map semantically identical evidence rows to one canonical row while
        # retaining every citation. Animal identity itself is never inferred.
        for collection, id_field, mapping_name, signature in (
            ("relationships", "id", "relationship_id_mappings", lambda r: (r.get("subject"), r.get("object"), r.get("type"))),
            ("claims", "id", "claim_id_mappings", lambda r: (r.get("subject"), r.get("claim_type"), json.dumps(r.get("value"), sort_keys=True, ensure_ascii=False))),
            ("events", "id", "event_id_mappings", lambda r: (r.get("animal_id"), tuple(r.get("related_animal_ids") or []), r.get("type"), json.dumps(r.get("date"), sort_keys=True), r.get("institution_id"), r.get("from_institution_id"), r.get("to_institution_id"), r.get("outcome_count"))),
        ):
            existing_by_signature = {signature(record): record for record in atlas[collection]}
            for record in bundle.get(collection, []):
                same = existing_by_signature.get(signature(record))
                if same is not None:
                    if collection == "events" and record.get("notes") and record.get("notes") != same.get("notes"):
                        notes = [note for note in (same.get("notes", ""), record.get("notes", "")) if note]
                        same["notes"] = "\n".join(dict.fromkeys(notes))
                    _unique_extend(same.setdefault("source_ids", []), record.get("source_ids", []))
                    report[mapping_name][record[id_field]] = same[id_field]
                    continue
                _merge_by_id(atlas[collection], [record], id_field, collection)
                existing_by_signature[signature(record)] = record
                report[mapping_name][record[id_field]] = record[id_field]
        _merge_by_id(atlas["media"], bundle.get("media", []), "media_id", "media")

    atlas["coverage"] = _combine_coverage(canonical, imports)
    release_dates = [atlas.get("release", {}).get("build_date", "")]
    release_dates.extend(item.get("bundle", {}).get("release", {}).get("build_date", "") for item in imports)
    release_date = max(value for value in release_dates if value)
    atlas.setdefault("release", {}).update({
        "data_version": release_date.replace("-", ".") + "-phase2",
        "build_date": release_date,
        "provenance": "Unified common and pygmy hippopotamus data from cited public institutional records; see HIPPOPOTAMUS_SOURCES.md and the reproducible import reports.",
    })
    # Sorting every keyed collection makes serialization reproducible regardless of import order.
    for collection, id_field in (("animals", "id"), ("claims", "id"), ("relationships", "id"), ("events", "id"), ("institutions", "id"), ("media", "media_id"), ("sources", "id")):
        atlas[collection].sort(key=lambda record: record[id_field])
    report["id_mappings"] = dict(sorted(report["id_mappings"].items()))
    for mapping_name in ("claim_id_mappings", "relationship_id_mappings", "event_id_mappings"):
        report[mapping_name] = dict(sorted(report[mapping_name].items()))
    report["institution_id_mappings"] = dict(sorted(report["institution_id_mappings"].items()))
    report["animal_identity_crosswalk"].sort(key=lambda item: (item["import_id"], item["bundle_animal_id"]))
    report["conflicts"].sort(key=lambda item: (item["animal_id"], item["field"], str(item["alternate"])))
    report["imports"].sort(key=lambda item: item["import_id"])
    report["counts"] = {collection: len(atlas[collection]) for collection in COLLECTIONS}
    report["counts_added"] = {
        collection: report["counts"][collection] - report["canonical_before_counts"][collection]
        for collection in COLLECTIONS
    }
    report["taxa"] = dict(sorted({taxon: sum(1 for animal in atlas["animals"] if animal["taxon"] == taxon) for taxon in all_animal_taxa | {animal.get("taxon") for item in imports for animal in item["bundle"].get("animals", [])}}.items()))
    return atlas, report


__all__ = ["merge_hippopotamus"]


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _crosswalk(report: dict[str, Any]) -> dict[str, str]:
    return {
        item["bundle_animal_id"]: item["canonical_animal_id"]
        for item in report.get("canonical_overlap", {}).get("identity_crosswalk", [])
        if item.get("bundle_animal_id") and item.get("canonical_animal_id")
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--canonical", type=Path, required=True)
    parser.add_argument(
        "--canonical-revision",
        help="optional immutable source revision for the canonical base",
    )
    parser.add_argument("--common-bundle", type=Path, required=True)
    parser.add_argument("--common-report", type=Path, required=True)
    parser.add_argument("--pygmy-bundle", type=Path, required=True)
    parser.add_argument("--pygmy-report", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--report-out", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        common_report = _read_json(args.common_report)
        pygmy_report = _read_json(args.pygmy_report)
        atlas, report = merge_hippopotamus(
            _read_json(args.canonical),
            [
                {"import_id": "common-hippo", "bundle": _read_json(args.common_bundle), "animal_id_map": _crosswalk(common_report), "bundle_path": args.common_bundle.as_posix(), "bundle_sha256": _sha256(args.common_bundle)},
                {"import_id": "pygmy-hippo", "bundle": _read_json(args.pygmy_bundle), "animal_id_map": _crosswalk(pygmy_report), "bundle_path": args.pygmy_bundle.as_posix(), "bundle_sha256": _sha256(args.pygmy_bundle)},
            ],
        )
        report["canonical_base"] = {
            "path": args.canonical.as_posix(),
            "sha256": _sha256(args.canonical),
            "revision": args.canonical_revision,
        }
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.report_out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(atlas, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        args.report_out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"Hippo merge failed: {error}", file=sys.stderr)
        return 1
    print(f"Merged hippopotamus atlas: {args.out}")
    print(f"Merge report: {args.report_out}")
    print(json.dumps(report["counts"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
