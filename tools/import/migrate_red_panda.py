#!/usr/bin/env python3
"""Migrate the cited Futa-family tree into the shared atlas schema."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Sequence
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.validate_atlas import validate_atlas  # noqa: E402


BUILD_DATE = "2026-10-07"
CURATED_SOURCE_COMMIT = "fe97aff63d87948232462ea4b60873460de96948"
PRODUCTION_SOURCE_COMMIT = "efb54a683f51728378bb513ab05cf7feea23ca62"
PRODUCTION_TREE_SHA256 = "fae0383b8851fe8522c16692322576d456dcd49412b1aaa7fd51415806b6addd"
TAXON = "Ailurus fulgens"


@dataclass(frozen=True)
class MigrationReport:
    animal_count: int
    relationship_count: int
    event_count: int
    media_count: int
    source_count: int
    unresolved_count: int
    excluded_profile_count: int


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _stable_id(prefix: str, value: str) -> str:
    return f"{prefix}:{hashlib.sha256(value.encode('utf-8')).hexdigest()[:16]}"


def _date_value(value: Any, unknown_note: str) -> dict[str, str]:
    candidate = _text(value)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", candidate):
        return {"precision": "exact", "value": candidate}
    if re.fullmatch(r"\d{4}(?:-\d{2})?", candidate):
        return {"precision": "approximate", "value": candidate}
    return {"precision": "unknown", "notes": unknown_note or "The source did not give a usable date."}


def _valid_http_url(value: Any) -> bool:
    parsed = urlparse(_text(value))
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _merge_notes(*values: Any) -> str:
    return "\n".join(value for item in values if (value := _text(item)))


def _load_global_exclusion(path: Path | None) -> dict[str, Any]:
    if path is None:
        return {
            "source_repository": "wwoast/redpanda-lineage",
            "declared_license": None,
            "exclusion_reason": "GitHub repository metadata declares no license; records were not imported.",
            "record_counts": {"profiles": 0, "zoos": 0, "family_edges": 0, "litter_edges": 0},
            "profile_ids": [],
            "id_list_complete": False,
        }

    data = json.loads(path.read_text(encoding="utf-8"))
    pandas = data.get("pandas", [])
    zoos = data.get("zoos", [])
    family_edges = data.get("familyEdges", [])
    litter_edges = data.get("litterEdges", [])
    # Read only record IDs into the migration result. Names, fields, edges, and media
    # from this unlicensed snapshot are deliberately discarded.
    profile_ids = sorted({_text(record.get("id")) for record in pandas if isinstance(record, dict) and _text(record.get("id"))})
    return {
        "source_repository": "wwoast/redpanda-lineage",
        "declared_license": None,
        "exclusion_reason": "GitHub repository metadata declares no license; records were not imported.",
        "record_counts": {
            "profiles": len(pandas),
            "zoos": len(zoos),
            "family_edges": len(family_edges),
            "litter_edges": len(litter_edges),
        },
        "profile_ids": profile_ids,
        "id_list_complete": len(profile_ids) == len(pandas),
    }


def _publication_date(value: Any) -> str | None:
    candidate = _text(value)
    if re.fullmatch(r"\d{4}(?:-\d{2}(?:-\d{2})?)?", candidate):
        return candidate
    return None


def _normalized_source_type(value: str) -> str:
    mappings = {
        "公式資料": "official_source",
        "現行二次プロフィール": "secondary_profile",
        "飼育担当者インタビュー": "keeper_interview",
        "専門記事": "specialist_article",
        "飼育担当者データの報道": "news_report",
        "二次データベース": "secondary_database",
        "公式情報を引用した資料": "secondary_source",
        "一次発表を引用した報道": "news_report",
        "写真利用条件": "media_rights_source",
        "現所属園の情報": "official_zoo_profile",
    }
    return mappings.get(value, "legacy_source")


def _name_key(value: str) -> str:
    return re.sub(r"（[^）]*）", "", value).strip().casefold()


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}.")
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def migrate_red_panda(
    input_path: Path | str,
    output_path: Path | str,
    report_path: Path | str,
    excluded_snapshot_path: Path | str | None = None,
) -> MigrationReport:
    """Write canonical atlas, migration report, and sibling legacy ID map."""
    input_path = Path(input_path)
    output_path = Path(output_path)
    report_path = Path(report_path)
    source_data = _load_json(input_path)
    source_bytes = input_path.read_bytes()
    nodes = source_data.get("nodes", [])
    source_records = source_data.get("sources", {})
    if not isinstance(nodes, list) or not isinstance(source_records, dict):
        raise ValueError("Curated source tree must contain node and source collections.")

    cutoff = _text(source_data.get("meta", {}).get("cutoff"))
    accessed_date = cutoff if re.fullmatch(r"\d{4}-\d{2}-\d{2}", cutoff) else BUILD_DATE
    source_id_map = {legacy_id: f"source:red-panda:{legacy_id}" for legacy_id in source_records}
    node_id_map = {node["id"]: f"red-panda:{node['id']}" for node in nodes if isinstance(node, dict) and _text(node.get("id"))}
    warnings: list[str] = []
    unresolved: list[dict[str, str]] = []
    institutions_by_name: dict[str, dict[str, Any]] = {}
    source_output: dict[str, dict[str, Any]] = {}
    media_output: list[dict[str, Any]] = []
    relationships: list[dict[str, Any]] = []
    claims: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []

    def source_refs(legacy_ids: Any, fallback: Sequence[str] = ()) -> list[str]:
        values = legacy_ids if isinstance(legacy_ids, list) else []
        converted = [source_id_map[value] for value in values if value in source_id_map]
        if not converted:
            converted = [source_id_map[value] for value in fallback if value in source_id_map]
        return sorted(set(converted))

    for legacy_id, source in source_records.items():
        if not isinstance(source, dict) or not _valid_http_url(source.get("url")):
            warnings.append(f"Skipped source {legacy_id}: its URL was missing or not HTTP(S).")
            continue
        original_date = _text(source.get("date"))
        notes = _merge_notes(
            source.get("note_ja"),
            f"Legacy source type: {_text(source.get('type_ja'))}." if _text(source.get("type_ja")) else "",
            f"Legacy date field: {original_date}." if original_date and not _publication_date(original_date) else "",
            "Access date is inherited from the curated dataset cutoff; this link was not independently revalidated during migration.",
        )
        source_output[source_id_map[legacy_id]] = {
            "id": source_id_map[legacy_id],
            "title": _text(source.get("title")) or f"Legacy source {legacy_id}",
            "publisher": _text(source.get("org")) or "Publisher not specified in legacy source.",
            "url": _text(source.get("url")),
            "publication_date": _publication_date(original_date),
            "accessed_date": accessed_date,
            "source_type": _normalized_source_type(_text(source.get("type_ja"))),
            "notes": notes,
            "data_use": "Citation for factual claims only; no media reuse is implied.",
        }

    name_index: dict[str, list[str]] = {}
    for node in nodes:
        if not isinstance(node, dict):
            continue
        name = _text(node.get("name_jp"))
        if name:
            for key in {name.casefold(), _name_key(name)}:
                name_index.setdefault(key, []).append(str(node.get("id")))

    def resolve_name(value: Any) -> str | None:
        name = _text(value)
        if not name:
            return None
        matches = set(name_index.get(name.casefold(), [])) | set(name_index.get(_name_key(name), []))
        return next(iter(matches)) if len(matches) == 1 else None

    def institution_id(name_value: Any) -> str | None:
        name = _text(name_value)
        if not name:
            return None
        if name not in institutions_by_name:
            record_id = _stable_id("place", name)
            institutions_by_name[name] = {
                "id": record_id,
                "names": [{"value": name, "language": "ja"}],
                "country_code": None,
                "location": None,
            }
        return institutions_by_name[name]["id"]

    def add_relationship(parent_legacy_id: str, child_legacy_id: str, child: dict[str, Any], relation_label: str) -> None:
        parent = next((node for node in nodes if isinstance(node, dict) and node.get("id") == parent_legacy_id), None)
        if parent is None:
            unresolved.append({"animal_id": node_id_map.get(child_legacy_id, child_legacy_id), "kind": relation_label, "value": parent_legacy_id})
            return
        if relation_label == "co_parent":
            relation_type = "social"
            endpoints = sorted([node_id_map[parent_legacy_id], node_id_map[child_legacy_id]])
            relation_id = _stable_id("relationship:red-panda:partner", "|".join(endpoints))
            subject_id, object_id = endpoints
        else:
            sex = parent.get("sex")
            if sex == "F":
                relation_type = "biological_mother"
            elif sex == "M":
                relation_type = "biological_father"
            else:
                claim_id = f"claim:red-panda:{child_legacy_id}:{relation_label}"
                claims.append({
                    "id": claim_id,
                    "subject": node_id_map[child_legacy_id],
                    "claim_type": "unresolved_parent_reference",
                    "value": parent_legacy_id,
                    "status": "unknown",
                    "source_ids": source_refs(child.get("sources")),
                    "review": {"status": "needs_review", "reviewed_on": BUILD_DATE, "notes": "Legacy parent sex is unknown, so a mother/father relationship type was not inferred."},
                })
                unresolved.append({"animal_id": node_id_map[child_legacy_id], "kind": relation_label, "value": parent_legacy_id})
                return
            relation_id = f"relationship:red-panda:{parent_legacy_id}:{child_legacy_id}"
            subject_id, object_id = node_id_map[parent_legacy_id], node_id_map[child_legacy_id]
        if any(existing["id"] == relation_id for existing in relationships):
            return
        relationships.append({
            "id": relation_id,
            "subject": subject_id,
            "object": object_id,
            "type": relation_type,
            "status": "probable",
            "source_ids": source_refs(child.get("sources")),
            "review": {
                "status": "needs_review",
                "reviewed_on": BUILD_DATE,
                "notes": (
                    "Imported as a social partner link from the legacy co-parent field; it is not an ancestry assertion."
                    if relation_label == "co_parent"
                    else f"Imported from the explicit legacy {relation_label} field. The source file has no relation-specific confidence, so this link is retained as probable."
                ),
            },
        })

    animals: list[dict[str, Any]] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        legacy_id = _text(node.get("id"))
        if not legacy_id or legacy_id not in node_id_map:
            warnings.append("Skipped a source node with no stable legacy ID.")
            continue
        node_sources = source_refs(node.get("sources"))
        if not node_sources:
            warnings.append(f"Node {legacy_id} has no usable source citation.")
            continue
        name = _text(node.get("name_jp"))
        sex = {"F": "female", "M": "male"}.get(node.get("sex"), "unknown")
        legacy_status = _text(node.get("status_ja"))
        status = "deceased" if _text(node.get("death_date")) or legacy_status.startswith("死亡") else "living" if "在籍中" in legacy_status else "unknown"
        grade = _text(node.get("confidence")) or "unspecified"
        animals.append({
            "id": node_id_map[legacy_id],
            "taxon": TAXON,
            "sex": sex,
            "status": status,
            "name": {"canonical": name, "language": "ja", "source_ids": node_sources, "localized": []},
            "aliases": [],
            "external_ids": [{"namespace": "legacy-futa-tree", "value": legacy_id}],
            "review": {
                "status": "needs_review",
                "reviewed_on": BUILD_DATE,
                "notes": f"Imported from the curated Futa family tree. Legacy data grade: {grade}; its definition is not reinterpreted here.",
            },
        })

    for node in nodes:
        if not isinstance(node, dict) or node.get("id") not in node_id_map:
            continue
        child_id = str(node["id"])
        parent_id = _text(node.get("parent"))
        if parent_id:
            if parent_id in node_id_map:
                add_relationship(parent_id, child_id, node, "parent")
            else:
                claims.append({
                    "id": f"claim:red-panda:{child_id}:parent",
                    "subject": node_id_map[child_id],
                    "claim_type": "unresolved_parent_reference",
                    "value": parent_id,
                    "status": "unknown",
                    "source_ids": source_refs(node.get("sources")),
                    "review": {"status": "needs_review", "reviewed_on": BUILD_DATE, "notes": "Legacy parent ID does not map to a named source node; no animal was fabricated."},
                })
                unresolved.append({"animal_id": node_id_map[child_id], "kind": "parent", "value": parent_id})

        co_parent = _text(node.get("co_parent_ja"))
        if co_parent:
            resolved = resolve_name(co_parent)
            if resolved and resolved != child_id:
                add_relationship(resolved, child_id, node, "co_parent")
            elif resolved == child_id:
                claims.append({
                    "id": f"claim:red-panda:{child_id}:co-parent",
                    "subject": node_id_map[child_id],
                    "claim_type": "unresolved_co_parent_name",
                    "value": co_parent,
                    "status": "unknown",
                    "source_ids": source_refs(node.get("sources")),
                    "review": {"status": "needs_review", "reviewed_on": BUILD_DATE, "notes": "Legacy co-parent label resolves only to the animal itself; no relationship was created."},
                })
                unresolved.append({"animal_id": node_id_map[child_id], "kind": "co_parent", "value": co_parent})
            elif not resolved:
                claims.append({
                    "id": f"claim:red-panda:{child_id}:co-parent",
                    "subject": node_id_map[child_id],
                    "claim_type": "unresolved_co_parent_name",
                    "value": co_parent,
                    "status": "unknown",
                    "source_ids": source_refs(node.get("sources")),
                    "review": {"status": "needs_review", "reviewed_on": BUILD_DATE, "notes": "Legacy co-parent name has no unique matching individual in the curated source nodes; no animal or link was fabricated."},
                })
                unresolved.append({"animal_id": node_id_map[child_id], "kind": "co_parent", "value": co_parent})

    def event_sources(raw: dict[str, Any], fallback: Sequence[str]) -> list[str]:
        refs = source_refs([raw.get("source")] if raw.get("source") else [], fallback)
        return refs

    for node in nodes:
        if not isinstance(node, dict) or node.get("id") not in node_id_map:
            continue
        legacy_id = str(node["id"])
        node_sources = node.get("sources", [])
        old_events = node.get("events", []) if isinstance(node.get("events"), list) else []
        covered_birth = set()
        covered_death = set()
        for index, old_event in enumerate(old_events):
            if not isinstance(old_event, dict):
                continue
            old_type = _text(old_event.get("type"))
            event_type = {"birth": "birth", "death": "death", "move": "move", "milestone": "observation"}.get(old_type, "observation")
            event_id = f"event:red-panda:{legacy_id}:{index + 1}"
            source_ids = event_sources(old_event, node_sources)
            event_note = _merge_notes(
                old_event.get("note_ja"),
                f"Legacy event type: {old_type}." if old_type and old_type not in {"birth", "death", "move", "milestone"} else "",
                "The legacy event had no event-level source ID; the animal citation set is retained for traceability." if not old_event.get("source") else "",
            )
            if not event_note:
                event_note = "No additional event note was recorded in the curated source file."
            place = institution_id(old_event.get("place_jp"))
            record = {
                "id": event_id,
                "animal_id": node_id_map[legacy_id],
                "type": event_type,
                "date": _date_value(old_event.get("date"), event_note),
                "institution_id": place if event_type != "move" else None,
                "source_ids": source_ids,
                "notes": event_note,
            }
            if event_type == "move" and place:
                record["to_institution_id"] = place
            events.append(record)
            if event_type == "birth":
                covered_birth.add(_text(old_event.get("date")))
            elif event_type == "death":
                covered_death.add(_text(old_event.get("date")))

        for legacy_field, event_type, covered in (("birth_date", "birth", covered_birth), ("death_date", "death", covered_death)):
            value = _text(node.get(legacy_field))
            if value and value not in covered:
                source_ids = source_refs(node_sources)
                if source_ids:
                    events.append({
                        "id": f"event:red-panda:{legacy_id}:{event_type}-date",
                        "animal_id": node_id_map[legacy_id],
                        "type": event_type,
                        "date": _date_value(value, f"Legacy {legacy_field} field did not provide a valid date: {value}."),
                        "institution_id": None,
                        "source_ids": source_ids,
                        "notes": f"Imported from the legacy {legacy_field} field; no separate event record was supplied.",
                    })

    def add_unnamed_event(record: dict[str, Any], index: int, unquantified: bool = False) -> None:
        parent_id = _text(record.get("parent"))
        related: list[str] = []
        if parent_id in node_id_map:
            related.append(node_id_map[parent_id])
        co_parent_id = resolve_name(record.get("co_parent"))
        if co_parent_id and co_parent_id in node_id_map and node_id_map[co_parent_id] not in related:
            related.append(node_id_map[co_parent_id])
        if not related:
            warnings.append(f"Unnamed outcome {record.get('id', index)} has no resolvable named parent and was omitted from events.")
            unresolved.append({"animal_id": "", "kind": "unnamed_outcome", "value": _text(record.get("id")) or str(index)})
            return
        source_ids = source_refs(record.get("sources"))
        if not source_ids and parent_id in node_id_map:
            parent = next((node for node in nodes if isinstance(node, dict) and node.get("id") == parent_id), {})
            source_ids = source_refs(parent.get("sources"))
        note = _merge_notes(record.get("note_ja"), record.get("note"))
        if unquantified:
            note = _merge_notes(note, "The source reports a birth but gives neither a count nor a date.")
        elif not note:
            note = "The source records an unnamed birth outcome; no individual animal record was created."
        record_out: dict[str, Any] = {
            "id": f"event:red-panda:unnamed:{_text(record.get('id')) or index}",
            "animal_id": None,
            "related_animal_ids": related,
            "type": "birth",
            "date": _date_value(None if unquantified else record.get("date"), note),
            "institution_id": None,
            "source_ids": source_ids,
            "notes": note,
        }
        count = record.get("count")
        if not unquantified and isinstance(count, int) and not isinstance(count, bool) and count > 0:
            record_out["outcome_count"] = count
        events.append(record_out)

    unnamed_outcomes = source_data.get("unnamed_outcomes", [])
    if isinstance(unnamed_outcomes, list):
        for index, record in enumerate(unnamed_outcomes, start=1):
            if isinstance(record, dict):
                add_unnamed_event(record, index)
    unquantified = source_data.get("unquantified", [])
    if isinstance(unquantified, list):
        for index, record in enumerate(unquantified, start=1):
            if isinstance(record, dict):
                add_unnamed_event(record, index, unquantified=True)

    source_media_records: dict[str, str] = {}

    def media_source(url: str, title: str, publisher: str, note: str, source_type: str) -> str:
        existing = source_media_records.get(url)
        if existing:
            return existing
        record_id = _stable_id("source:red-panda:media", url)
        source_media_records[url] = record_id
        host = urlparse(url).netloc
        source_output[record_id] = {
            "id": record_id,
            "title": title or "Animal profile or image source page",
            "publisher": publisher or host or "Publisher not specified.",
            "url": url,
            "publication_date": None,
            "accessed_date": accessed_date,
            "source_type": source_type,
            "notes": _merge_notes(note, "Link disposition and metadata are inherited from the curated dataset cutoff; the page was not independently revalidated during migration."),
            "data_use": "Link only. No image embedding, downloading, archiving, or redistribution permission is implied.",
        }
        return record_id

    seen_media: set[tuple[str, str]] = set()
    for node in nodes:
        if not isinstance(node, dict) or node.get("id") not in node_id_map:
            continue
        animal_id = node_id_map[str(node["id"])]
        confidence_note = _text(node.get("profile_link_verified_ja"))
        profile_url = _text(node.get("photo_profile_url"))
        profile_verified = bool(profile_url and confidence_note)
        candidate_records: list[tuple[str, str, str, str, str]] = []
        if profile_url:
            candidate_records.append((profile_url, _text(node.get("profile_title")) or _text(node.get("name_jp")), "", "Legacy individual profile link.", "animal_profile"))
        for field, fallback_confidence in (("photo_links_confirmed", "confirmed"), ("photo_links_candidate", "unknown")):
            values = node.get(field, [])
            if not isinstance(values, list):
                continue
            for item in values:
                if not isinstance(item, dict):
                    continue
                candidate_records.append((
                    _text(item.get("url")),
                    _text(item.get("title")),
                    "",
                    _merge_notes(
                        item.get("note_ja"),
                        item.get("rights_ja"),
                        f"Legacy media source type: {_text(item.get('source_type_ja'))}." if _text(item.get("source_type_ja")) else "",
                    ),
                    fallback_confidence,
                ))
        for url, title, publisher, note, confidence in candidate_records:
            if not _valid_http_url(url) or (animal_id, url) in seen_media:
                continue
            seen_media.add((animal_id, url))
            resolved_confidence = "confirmed" if confidence == "animal_profile" and profile_verified else confidence
            media_source_id = media_source(url, title, publisher, note, "animal_profile" if confidence == "animal_profile" else "media_page")
            media_output.append({
                "media_id": _stable_id(f"media:red-panda:{node['id']}", url),
                "animal_id": animal_id,
                "source_page_url": url,
                "credit": None,
                "rights_status": "link-only; source-specific rights are not cleared for reuse",
                "embedding_status": "link_only",
                "offline_archive_eligible": False,
                "identity_confidence": resolved_confidence,
                "checked_date": accessed_date,
                "notes": _merge_notes(note, "Direct image URL and local image files are intentionally omitted."),
                "source_ids": [media_source_id],
            })

    all_source_ids = set(source_output)
    atlas = {
        "release": {
            "schema_version": "1.0.0",
            "data_version": "2026.10.07",
            "engine_version": "1.0.0",
            "build_date": BUILD_DATE,
            "provenance": "Migrated from the cited, curated Futa-family tree; see migration_report.json.",
        },
        "coverage": {
            "taxon": TAXON,
            "scope": "The cited Futa-family layer: named individuals, cited parent links, documented events, and explicitly reported unnamed outcomes.",
            "limitations": [
                "This is a curated family layer, not a complete red-panda studbook.",
                "Unresolved co-parent names remain claims and are not converted into animal records.",
                "The independent global profile snapshot has no declared reuse license and was excluded.",
                "Names are retained in Japanese where the cited source provides no verified transliteration.",
                "Media is link-only; no animal photos or direct image URLs are bundled.",
            ],
            "last_reviewed": accessed_date,
        },
        "animals": animals,
        "claims": claims,
        "relationships": relationships,
        "events": events,
        "institutions": sorted(institutions_by_name.values(), key=lambda record: record["id"]),
        "media": media_output,
        "sources": list(source_output.values()),
    }

    unknown_refs = sorted({source_id for collection in ("animals", "claims", "relationships", "events", "media") for record in atlas[collection] for source_id in record.get("source_ids", []) if source_id not in all_source_ids})
    if unknown_refs:
        raise ValueError(f"Migration produced unresolved source references: {unknown_refs[:5]}")
    issues = validate_atlas(atlas)
    if issues:
        details = "\n".join(f"{issue.code} {issue.path}: {issue.message}" for issue in issues[:30])
        raise ValueError(f"Generated red-panda atlas failed validation ({len(issues)} issue(s)):\n{details}")

    excluded = _load_global_exclusion(Path(excluded_snapshot_path) if excluded_snapshot_path else None)
    output_hash = hashlib.sha256(source_bytes).hexdigest()
    mapped_legacy_ids = sorted(node_id_map)
    relation_statuses = Counter(relation["status"] for relation in relationships)
    report_document = {
        "report_version": "1.0.0",
        "source": {
            "curated_repository": "FFJ-Red-Panda-Atlas-card-ui-20261007",
            "curated_commit": CURATED_SOURCE_COMMIT,
            "import_input": "FFJ-Red-Panda-Atlas/tree/data.json",
            "input_resolution_note": "The referenced card-ui worktree was unavailable; the remaining curated tree JSON was used after its SHA-256 matched the recorded production tree asset.",
            "production_baseline_commit": PRODUCTION_SOURCE_COMMIT,
            "production_tree_sha256": PRODUCTION_TREE_SHA256,
            "input_sha256": output_hash,
            "production_hash_matches": output_hash == PRODUCTION_TREE_SHA256,
            "dataset_cutoff": cutoff or None,
        },
        "counts": {
            "source_named_animals": len(nodes),
            "target_animals": len(animals),
            "curated_source_records": len(source_records),
            "target_source_records_including_media_pages": len(source_output),
            "parent_relationships": sum(1 for relation in relationships if relation["type"] in {"biological_mother", "biological_father"}),
            "social_partner_links": sum(1 for relation in relationships if relation["type"] == "social"),
            "mapped_explicit_parent_refs": sum(1 for node in nodes if isinstance(node, dict) and _text(node.get("parent")) in node_id_map),
            "relationships_by_status": dict(sorted(relation_statuses.items())),
            "claims": len(claims),
            "events": len(events),
            "named_animal_events": sum(1 for event in events if event.get("animal_id") is not None),
            "unnamed_outcome_events": sum(1 for event in events if event.get("animal_id") is None and "outcome_count" in event),
            "explicit_unnamed_outcome_total": sum(event.get("outcome_count", 0) for event in events if event.get("animal_id") is None),
            "unquantified_birth_events": sum(1 for event in events if event.get("animal_id") is None and "outcome_count" not in event),
            "institutions_or_places": len(institutions_by_name),
            "media_references": len(media_output),
            "local_image_fields_dropped": sum(sum(field in node for field in ("image", "photo", "photo_url")) for node in nodes if isinstance(node, dict)),
            "unresolved_items": len(unresolved),
            "unmapped_named_ids": 0,
        },
        "legacy_id_map": {legacy_id: node_id_map[legacy_id] for legacy_id in mapped_legacy_ids},
        "unmapped_legacy_ids": [],
        "unresolved_items": unresolved,
        "warnings": sorted(set(warnings)),
        "excluded_global_snapshot": excluded,
        "decisions": [
            "Use the cited 83-node curated Futa-family source and its 21 fact sources; add source records only for its curated media/profile links.",
            "Retain exact or unique normalized co-parent name matches as probable social partner links, not ancestry; preserve all other names as unknown claims.",
            "Keep unnamed and unquantified birth outcomes as events linked to known animals; create no placeholder animal records.",
            "Drop local image paths and direct image URLs. Preserve source pages as link-only media metadata.",
            "Do not import global profile names, animal data, zoo records, family or litter edges, photo URLs, or image data from the excluded snapshot.",
        ],
    }
    _write_json(output_path, atlas)
    _write_json(output_path.parent / "legacy_id_map.json", {
        "namespace": "legacy-futa-tree",
        "target_prefix": "red-panda:",
        "source_commit": CURATED_SOURCE_COMMIT,
        "mappings": report_document["legacy_id_map"],
    })
    _write_json(report_path, report_document)
    return MigrationReport(
        animal_count=len(animals),
        relationship_count=len(relationships),
        event_count=len(events),
        media_count=len(media_output),
        source_count=len(source_output),
        unresolved_count=len(unresolved),
        excluded_profile_count=len(excluded["profile_ids"]),
    )


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="curated Futa tree JSON (read-only)")
    parser.add_argument("output", type=Path, help="canonical atlas JSON output")
    parser.add_argument("report", type=Path, help="migration report JSON output")
    parser.add_argument("--excluded-global-snapshot", type=Path, help="unlicensed snapshot input; only profile IDs and aggregate counts are retained")
    args = parser.parse_args(argv)
    try:
        report = migrate_red_panda(args.input, args.output, args.report, args.excluded_global_snapshot)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Migrated {report.animal_count} animals, {report.relationship_count} relationships, {report.event_count} events, and {report.media_count} link-only media references.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
