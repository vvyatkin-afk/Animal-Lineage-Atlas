"""Deterministically merge the public red-panda lineage export into Atlas.

This module intentionally does not download anything.  The companion sync
script supplies a pinned snapshot descriptor so the transformation is easy to
test and can be reproduced from a locally held export.
"""

from __future__ import annotations

import copy
import hashlib
import json
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import date
from urllib.parse import urlparse


UPSTREAM_NAMESPACE = "wwoast-redpanda-lineage"
SOURCE_ID = "source:red-panda:wwoast-lineage-export"
REVIEWED_ON = "2026-10-08"
REVIEWED_EXTERNAL_ID_CROSSWALKS = {
    "34": {
        "curated_animal_id": "red-panda:futa",
        "source_ids": ["source:red-panda:S02", "source:red-panda:S22"],
        "rationale": "Exact Japanese name and birth date; S02 identifies Nara and Fu-Fu as the parents, while the official Chiba chronology S22 confirms the Nihondaira birth and 2004-03-30 arrival.",
    },
    "49": {
        "curated_animal_id": "red-panda:nara",
        "source_ids": ["source:red-panda:S02", "source:red-panda:S08"],
        "rationale": "S02 identifies Nara as Futa's mother; the Japanese name, birth profile, and Nihondaira history agree with the curated Nara record and upstream profile.",
    },
    "50": {
        "curated_animal_id": "red-panda:fufu",
        "source_ids": ["source:red-panda:S02", "source:red-panda:S08"],
        "rationale": "S02 identifies Fu-Fu as Futa's father; the upstream Japanese alias 風風 and birth profile agree with the curated Fu-Fu record.",
    },
}
VALID_SOURCE_TIERS = {"A", "B", "C", "D", "discovery_only"}
OFFICIAL_SOURCE_HOSTS = {
    "hirakawazoo.jp", "www.hirakawazoo.jp", "tobezoo.com", "www.tobezoo.com",
    "hamazoo.net", "www.hamazoo.net", "tennojizoo.jp", "www.tennojizoo.jp",
    "neopark.co.jp", "www.neopark.co.jp", "nhdzoo.jp", "www.nhdzoo.jp",
    "city.asahikawa.hokkaido.jp", "www.city.asahikawa.hokkaido.jp",
    "city.himeji.lg.jp", "www.city.himeji.lg.jp",
    "higashiyama.city.nagoya.jp", "www.higashiyama.city.nagoya.jp",
    "hama-midorinokyokai.or.jp", "www.hama-midorinokyokai.or.jp",
    "city.chiba.jp", "www.city.chiba.jp",
}
CURATED_UNRESOLVED_SOURCE_REVIEW = [
    {
        "record_id": "event:red-panda:chiichi:3",
        "record_type": "event",
        "subject_id": "red-panda:chiichi",
        "prior_assertion": "Death on 2015-07-18 at Chiba City Zoo; cause reported as intestinal obstruction.",
        "source_ids": ["source:red-panda:S07"],
        "resolution": "removed_from_canonical; status set to unknown",
        "reason": "S07 is discovery_only; the audit found no B/C/D record directly supporting the exact death date or cause.",
    },
    {
        "record_id": "event:red-panda:kouta:2",
        "record_type": "event",
        "subject_id": "red-panda:kouta",
        "prior_assertion": "Moved to Chile with Lili around 2014.",
        "source_ids": ["source:red-panda:S12"],
        "resolution": "removed_from_canonical; status set to unknown",
        "reason": "S12 is discovery_only; no B/C/D record directly supporting this individual move was verified.",
    },
    {
        "record_id": "event:red-panda:kouta:3",
        "record_type": "event",
        "subject_id": "red-panda:kouta",
        "prior_assertion": "Death on 2017-08-21 in Chile.",
        "source_ids": ["source:red-panda:S12"],
        "resolution": "removed_from_canonical; status set to unknown",
        "reason": "S12 is discovery_only; no B/C/D record directly supporting this individual death date was verified.",
    },
    {
        "record_id": "event:red-panda:yuka_tobe:1",
        "record_type": "event",
        "subject_id": "red-panda:yuka_tobe",
        "prior_assertion": "Birth on 2010-06-20 at Tokuyama Zoo; parents recorded as Fuka and Kenken.",
        "source_ids": ["source:red-panda:S09"],
        "resolution": "removed_from_canonical; status set to unknown",
        "reason": "S09 is discovery_only; no B/C/D record directly supporting these birth details was verified.",
    },
    {
        "record_id": "event:red-panda:yuka_tobe:2",
        "record_type": "event",
        "subject_id": "red-panda:yuka_tobe",
        "prior_assertion": "Transfer to Tobe Zoo on 2012-03-23.",
        "source_ids": ["source:red-panda:S09"],
        "resolution": "removed_from_canonical; status set to unknown",
        "reason": "S09 is discovery_only; no B/C/D record directly supporting this individual transfer date was verified.",
    },
    {
        "record_id": "event:red-panda:yuka_tobe:3",
        "record_type": "event",
        "subject_id": "red-panda:yuka_tobe",
        "prior_assertion": "Death on 2016-08-15 at Tobe Zoo, reportedly from sepsis.",
        "source_ids": ["source:red-panda:S09"],
        "resolution": "removed_from_canonical; status set to unknown",
        "reason": "S09 is discovery_only; no B/C/D record directly supporting this death date or cause was verified.",
    },
    {
        "record_id": "claim:red-panda:kelu:co-parent",
        "record_type": "claim",
        "subject_id": "red-panda:kelu",
        "prior_assertion": "Kouta and Lili were Kelú's parents.",
        "source_ids": ["source:red-panda:S12"],
        "resolution": "removed_from_canonical; parentage remains unconfirmed",
        "reason": "S12 is discovery_only and does not name the parents; the official sources S24/S25 do not name parents either.",
    },
    {
        "record_id": "event:red-panda:unnamed:u2011a#unverified-sire-and-cause-detail",
        "record_type": "event_detail",
        "subject_id": "red-panda:unnamed:u2011a",
        "prior_assertion": "S07 attributed the litter to Futa and said one cub was consumed by its mother.",
        "source_ids": ["source:red-panda:S07"],
        "resolution": "detail omitted from canonical event; retain only as unresolved research note",
        "reason": "S07 is discovery_only; the official Chiba diary S23 confirms two births and both deaths but does not identify the sire or cause/behavior.",
    },
]


def _normalized(value):
    if not isinstance(value, str):
        return ""
    value = unicodedata.normalize("NFKC", value).casefold()
    return "".join(char for char in value if char.isalnum())


def _http_url(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = urlparse(value)
    except ValueError:
        return None
    return value if parsed.scheme.lower() in {"http", "https"} and parsed.netloc else None


def _looks_http_url(value):
    return isinstance(value, str) and value.lower().startswith(("http://", "https://"))


def _date(value):
    """Translate upstream YYYY/M/D dates to Atlas date values."""
    if not isinstance(value, str) or value.strip().lower() in {"", "none", "unknown"}:
        return None
    value = value.strip().replace(".", "/")
    pieces = value.split("/") if "/" in value else value.split("-")
    if not pieces or not pieces[0].isdigit() or len(pieces[0]) != 4:
        return None
    year = pieces[0]
    try:
        if len(pieces) == 1:
            return {"precision": "approximate", "value": year}
        if len(pieces) == 2:
            month = int(pieces[1])
            if not 1 <= month <= 12:
                return None
            return {"precision": "approximate", "value": f"{year}-{month:02d}"}
        if len(pieces) == 3:
            parsed = date(int(year), int(pieces[1]), int(pieces[2]))
            return {"precision": "exact", "value": parsed.isoformat()}
    except ValueError:
        return None
    return None


def _date_key(value):
    parsed = _date(value)
    if not parsed:
        return ""
    if parsed["precision"] == "exact":
        return parsed["value"]
    return parsed["value"]


def _lang_values(record, field):
    value = record.get(field)
    if not isinstance(value, dict):
        return []
    result = []
    for language, text in sorted(value.items()):
        if isinstance(text, str) and text.strip() and text.strip().lower() not in {"none", "unknown"}:
            result.append((language[:2].lower() or "en", text.strip()))
    return result


def _upstream_name(record):
    names = _lang_values(record, "name")
    if not names:
        return None, []
    preferred = next((pair for pair in names if pair[0] == "en"), names[0])
    localized = [(lang, value) for lang, value in names if (lang, value) != preferred]
    return preferred, localized


def _upstream_name_norms(record):
    return {_normalized(value) for _, value in _lang_values(record, "name") if _normalized(value)}


def _safe_part(value):
    value = str(value)
    return re.sub(r"[^A-Za-z0-9._:-]+", "-", value).strip("-:") or "unknown"


def _stable_hash(value, length=16):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()[:length]


def _id_map(records):
    return {str(record.get("_id")): record for record in records if record.get("_id") is not None}


def _parent_edges(upstream):
    parents = defaultdict(set)
    for edge in upstream.get("edges", []):
        if edge.get("_label") == "family" and edge.get("_in") != "none" and edge.get("_out") != "none":
            child, parent = str(edge.get("_in")), str(edge.get("_out"))
            if child != parent:
                parents[child].add(parent)
    return parents


def _zoo_edge_map(upstream):
    result = {}
    for edge in upstream.get("edges", []):
        if edge.get("_label") == "zoo" and edge.get("_out") != "none":
            result.setdefault(str(edge.get("_out")), set()).add(str(edge.get("_in")))
    return result


def _curated_name_values(animal):
    name = animal.get("name", {})
    values = [name.get("canonical", "")]
    values.extend(item.get("value", "") for item in name.get("localized", []))
    # Japanese canonical names sometimes include a reading in parentheses;
    # the separately recorded reading is an exact alternate, not fuzzy text.
    for value in list(values):
        match = re.fullmatch(r"(.+?)[（(]([^（）()]+)[）)]", value)
        if match:
            values.extend([match.group(1), match.group(2)])
    return {_normalized(value) for value in values if _normalized(value)}


def _curated_birth_date(atlas, animal_id):
    dates = []
    for event in atlas.get("events", []):
        if event.get("animal_id") == animal_id and event.get("type") == "birth":
            value = event.get("date", {})
            dates.append(value.get("value") or value.get("start") or "")
    keys = {_date_key(value) for value in dates if _date_key(value)}
    return next(iter(keys)) if len(keys) == 1 else ""


def _curated_current_place(atlas, animal_id, institution_names):
    events = [e for e in atlas.get("events", []) if e.get("animal_id") == animal_id]
    for event in reversed(events):
        if event.get("type") in {"observation", "move", "transfer"} and event.get("institution_id"):
            return institution_names.get(event["institution_id"], "")
    return ""


def _curated_current_place_names(atlas, animal_id):
    institutions = {item["id"]: item for item in atlas.get("institutions", [])}
    events = [e for e in atlas.get("events", []) if e.get("animal_id") == animal_id]
    for event in reversed(events):
        if event.get("type") in {"observation", "move", "transfer"} and event.get("institution_id"):
            institution = institutions.get(event["institution_id"], {})
            return {_normalized(item.get("value", "")) for item in institution.get("names", []) if _normalized(item.get("value", ""))}
    return set()


def _curated_known_parents(atlas, animal_id):
    return {
        relation.get("subject")
        for relation in atlas.get("relationships", [])
        if relation.get("object") == animal_id and relation.get("type") in {"biological_mother", "biological_father"}
    }


def _review(notes):
    return {"status": "needs_review", "reviewed_on": REVIEWED_ON, "notes": notes}


def _claim(claim_id, subject, claim_type, value, status="probable", notes="Imported from the upstream export; curator review is required."):
    return {
        "id": claim_id,
        "subject": subject,
        "claim_type": claim_type,
        "value": value,
        "status": status,
        "source_ids": [SOURCE_ID],
        "review": _review(notes),
    }


def _source_url_id(url):
    return "source:red-panda:wwoast-url:" + _stable_hash(url, 20)


def _source_tier(source):
    """Assign provenance tiers without treating missing terms as open reuse."""
    source_type = source.get("source_type")
    host = urlparse(source.get("url", "")).netloc.lower()
    if source_type in {"official_source", "official_zoo_profile"} or host in OFFICIAL_SOURCE_HOSTS:
        return "B"
    if source_type in {"research_publication", "peer_reviewed_paper"}:
        return "C"
    if source_type in {"community_dataset", "secondary_database", "secondary_profile"} or host == "redpanda-zukan.jp":
        return "D"
    return "discovery_only"


def _make_upstream_source(snapshot):
    accessed = snapshot["retrieved_at_utc"][:10]
    repo_lic = snapshot.get("repository_license")
    license_note = (
        f"Repository license metadata: {repo_lic}."
        if repo_lic
        else (
            f"The GitHub repository API reports license=null; the dedicated license endpoint returned HTTP {snapshot.get('repository_license_endpoint_status', 'not checked')}; "
            f"the repository tree was {'truncated' if snapshot.get('repository_tree_truncated') else 'complete'} and listed {len(snapshot.get('repository_license_files', []))} named license files. "
            f"{snapshot.get('license_check', 'No legal conclusion is recorded.') }"
        )
    )
    return {
        "id": SOURCE_ID,
        "title": "Red Panda Lineage JSON export",
        "publisher": "wwoast/redpanda-lineage; export served by Red Panda Finder",
        "url": snapshot["export_url"],
        "publication_date": None,
        "accessed_date": accessed,
        "source_type": "community_dataset",
        "tier": "D",
        "notes": (
            f"Retrieved {snapshot['retrieved_at_utc']} from {snapshot['export_url']}. "
            f"SHA-256 {snapshot['sha256']}; {snapshot['bytes']} bytes. "
            f"Repository commit {snapshot.get('repository_commit', 'unknown')}; "
            f"export embedded commit {snapshot.get('embedded_commit', 'unknown')}. {license_note}"
        ),
        "data_use": "Citation for claims and link-only media metadata; no photo bytes or embedding rights are implied.",
    }


def _is_known_name(value):
    return isinstance(value, str) and value.strip() and value.strip().lower() not in {"none", "unknown"}


def _curated_institution_names(atlas):
    result = {}
    for institution in atlas.get("institutions", []):
        vals = institution.get("names", [])
        result[institution["id"]] = vals[0].get("value", "") if vals else ""
    return result


def _institution_merge(curated, zoos, snapshot):
    institutions = copy.deepcopy(curated.get("institutions", []))
    by_norm = defaultdict(list)
    for record in institutions:
        for name in record.get("names", []):
            key = _normalized(name.get("value", ""))
            if key:
                by_norm[key].append(record["id"])
    ids = {record["id"] for record in institutions}
    mappings = []
    zoo_to_final = {}
    source_id = SOURCE_ID
    for zoo in sorted(zoos, key=lambda z: str(z.get("_id"))):
        upstream_id = str(zoo.get("_id"))
        name_pairs = _lang_values(zoo, "name")
        name_pair = next((x for x in name_pairs if x[0] == "en"), name_pairs[0] if name_pairs else ("en", f"Unknown zoo {upstream_id}"))
        normalized = _normalized(name_pair[1])
        candidates = sorted(set(by_norm.get(normalized, [])))
        if len(candidates) == 1:
            final_id = candidates[0]
            status = "matched_exact_name"
        else:
            base = "place:red-panda:upstream-" + _safe_part(upstream_id).lstrip("-")
            final_id, n = base, 2
            while final_id in ids:
                final_id = f"{base}-{n}"
                n += 1
            ids.add(final_id)
            lang_names = [{"value": value, "language": lang} for lang, value in name_pairs]
            if not lang_names:
                lang_names = [{"value": name_pair[1], "language": name_pair[0]}]
            institution = {
                "id": final_id,
                "names": lang_names,
                "country_code": None,
                "location": next((v for _, v in _lang_values(zoo, "location")), None),
            }
            institutions.append(institution)
            if len(candidates) > 1:
                status = "ambiguous_exact_name_new_record"
            else:
                status = "unique_upstream"
        zoo_to_final[upstream_id] = final_id
        mappings.append({"upstream_id": upstream_id, "final_institution_id": final_id, "status": status, "ambiguous_candidates": candidates if len(candidates) > 1 else []})
    institutions.sort(key=lambda x: x["id"])
    return institutions, zoo_to_final, mappings


def _event_id(animal_id, kind, raw_id, value):
    return f"event:red-panda:upstream:{_stable_hash([animal_id, kind, raw_id, value], 20)}"


def _url_counts(upstream):
    url_occurrences = []
    invalid_http_urls = []
    photo_source_occurrences = []
    invalid_photo_source_urls = []
    direct_photo_occurrences = []
    invalid_direct_photo_urls = []
    path_fields_by_type = Counter()
    byte_fields_by_type = Counter()
    photo_refs_by_type = Counter()
    for vertex in upstream.get("vertices", []):
        vertex_type = vertex.get("type", "unknown")
        if vertex.get("type") == "panda":
            photo_refs_by_type["panda"] += len(vertex.get("photos", []))
        elif vertex.get("type") == "zoo":
            photo_refs_by_type["zoo"] += len(vertex.get("photos", []))
        elif vertex.get("type") == "media":
            photo_refs_by_type["media"] += len(vertex.get("photos", []))
        elif vertex.get("type") == "wild":
            photo_refs_by_type["wild"] += len(vertex.get("photos", []))
        def walk(value):
            if isinstance(value, dict):
                for k, v in value.items():
                    if k.lower() == "path":
                        path_fields_by_type[vertex_type] += 1
                    if k.lower() in {"bytes", "image_bytes", "image_data", "base64"}:
                        byte_fields_by_type[vertex_type] += 1
                    walk(v)
            elif isinstance(value, list):
                for item in value:
                    walk(item)
            elif isinstance(value, str) and _looks_http_url(value):
                url_occurrences.append(value)
                if not _http_url(value):
                    invalid_http_urls.append(value)
        walk(vertex)
        for photo in vertex.get("photos", []):
            if _looks_http_url(photo.get("source")):
                photo_source_occurrences.append(photo["source"])
                if not _http_url(photo.get("source")):
                    invalid_photo_source_urls.append(photo["source"])
            if _looks_http_url(photo.get("url")):
                direct_photo_occurrences.append(photo["url"])
                if not _http_url(photo.get("url")):
                    invalid_direct_photo_urls.append(photo["url"])
    return {
        "http_url_occurrences": len(url_occurrences),
        "unique_http_urls": len(set(url_occurrences)),
        "invalid_http_url_occurrences": len(invalid_http_urls),
        "unique_invalid_http_urls": len(set(invalid_http_urls)),
        "photo_source_http_occurrences": len(photo_source_occurrences),
        "unique_photo_source_http_urls": len(set(photo_source_occurrences)),
        "invalid_photo_source_http_occurrences": len(invalid_photo_source_urls),
        "unique_invalid_photo_source_http_urls": len(set(invalid_photo_source_urls)),
        "invalid_direct_photo_http_occurrences": len(invalid_direct_photo_urls),
        "unique_invalid_direct_photo_http_urls": len(set(invalid_direct_photo_urls)),
        "direct_photo_http_occurrences": len(direct_photo_occurrences),
        "unique_direct_photo_http_urls": len(set(direct_photo_occurrences)),
        "non_http_photo_direct_url_occurrences": sum(
            isinstance(photo.get("url"), str) and not _looks_http_url(photo.get("url"))
            for vertex in upstream.get("vertices", [])
            for photo in vertex.get("photos", [])
        ),
        "path_fields": sum(path_fields_by_type.values()),
        "path_fields_by_vertex_type": dict(sorted(path_fields_by_type.items())),
        "image_byte_fields": sum(byte_fields_by_type.values()),
        "image_byte_fields_by_vertex_type": dict(sorted(byte_fields_by_type.items())),
        "records_with_photos_field": sum("photos" in vertex for vertex in upstream.get("vertices", [])),
        "photo_refs_by_vertex_type": dict(sorted(photo_refs_by_type.items())),
        "source_link_vertices": sum(v.get("type") == "links" for v in upstream.get("vertices", [])),
    }


def _all_photo_refs(upstream):
    return sum(len(v.get("photos", [])) for v in upstream.get("vertices", []))


def _curated_source_tier_audit(atlas):
    sources = {source["id"]: source for source in atlas.get("sources", [])}
    facts = []
    facts.extend(
        (animal["id"] + ":name", "animal_name", animal.get("name", {}))
        for animal in atlas.get("animals", [])
    )
    facts.extend(
        (record["id"], record_type, record)
        for record_type in ("claim", "relationship", "event")
        for record in atlas.get({"claim": "claims", "relationship": "relationships", "event": "events"}[record_type], [])
    )
    result = []
    for record_id, record_type, fact in facts:
        source_ids = sorted(set(fact.get("source_ids", [])))
        tiers = {source_id: sources.get(source_id, {}).get("tier", "missing") for source_id in source_ids}
        accepted = [source_id for source_id in source_ids if tiers[source_id] in {"A", "B", "C", "D"}]
        result.append({
            "record_id": record_id,
            "record_type": record_type,
            "source_ids": source_ids,
            "source_tiers": tiers,
            "accepted_source_ids": accepted,
            "discovery_only_source_ids": [source_id for source_id in source_ids if tiers[source_id] == "discovery_only"],
        })
    return sorted(result, key=lambda item: (item["record_type"], item["record_id"]))


def merge_red_panda(upstream, curated, snapshot):
    """Return ``(canonical_atlas, audit_report)`` for one pinned export."""
    atlas = copy.deepcopy(curated)
    for source in atlas.get("sources", []):
        if source.get("tier") not in VALID_SOURCE_TIERS:
            source["tier"] = _source_tier(source)
    source_ids = {source["id"] for source in atlas.get("sources", [])}
    if SOURCE_ID not in source_ids:
        atlas.setdefault("sources", []).append(_make_upstream_source(snapshot))

    vertices = upstream.get("vertices", [])
    pandas = [v for v in vertices if v.get("type") == "panda"]
    zoos = [v for v in vertices if v.get("type") == "zoo"]
    panda_by_id = _id_map(pandas)
    parents_by_child = _parent_edges(upstream)
    zoo_edges = _zoo_edge_map(upstream)

    # First resolve stable IDs; only then attempt the deliberately strict composite key.
    animals_by_id = {a["id"]: a for a in atlas.get("animals", [])}
    curated_external = defaultdict(list)
    for animal in atlas.get("animals", []):
        for ext in animal.get("external_ids", []):
            curated_external[(ext.get("namespace"), str(ext.get("value")))].append(animal["id"])
    explicit_map = {}
    for panda in pandas:
        upstream_id = str(panda.get("_id"))
        matches = sorted(set(curated_external.get((UPSTREAM_NAMESPACE, upstream_id), [])))
        if len(matches) == 1:
            explicit_map[upstream_id] = matches[0]

    curated_parent_by_child = defaultdict(set)
    for relation in atlas.get("relationships", []):
        if relation.get("type") in {"biological_mother", "biological_father"}:
            curated_parent_by_child[relation.get("object")].add(relation.get("subject"))
    curated_zoo_norms_by_animal = {}
    for animal in atlas.get("animals", []):
        curated_zoo_norms_by_animal[animal["id"]] = _curated_current_place_names(atlas, animal["id"])
    zoo_by_id = {str(zoo.get("_id")): zoo for zoo in zoos}

    name_index = defaultdict(list)
    for animal in atlas.get("animals", []):
        for norm in _curated_name_values(animal):
            name_index[norm].append(animal["id"])

    # Iteratively allow parents with later sort IDs to resolve before children.
    # Parent sets must resolve completely and match exactly; two empty sets are
    # acceptable when both records have no known parents.
    id_to_final = dict(explicit_map)
    secondary_candidates = {}
    unresolved = {str(panda.get("_id")): panda for panda in pandas if str(panda.get("_id")) not in id_to_final}
    def candidates_for(upstream_id, panda):
        name_norms = _upstream_name_norms(panda)
        birth_key = _date_key(panda.get("birthday"))
        source_zoo_ids = zoo_edges.get(upstream_id, set())
        if not name_norms or not birth_key or len(source_zoo_ids) != 1:
            return []
        zoo = zoo_by_id.get(next(iter(source_zoo_ids)))
        if not zoo:
            return []
        upstream_zoo_names = {_normalized(value) for _, value in _lang_values(zoo, "name")}
        upstream_parent_ids = parents_by_child.get(upstream_id, set())
        if not upstream_parent_ids.issubset(id_to_final):
            return []
        mapped_parent_ids = {id_to_final[parent] for parent in upstream_parent_ids}
        candidates = []
        possible_candidates = {candidate_id for name_norm in name_norms for candidate_id in name_index.get(name_norm, [])}
        for candidate_id in sorted(possible_candidates):
            candidate_birth = _curated_birth_date(atlas, candidate_id)
            candidate_zoo_names = curated_zoo_norms_by_animal.get(candidate_id, set())
            candidate_parents = curated_parent_by_child.get(candidate_id, set())
            if (
                candidate_birth == birth_key
                and upstream_zoo_names.intersection(candidate_zoo_names)
                and candidate_parents == mapped_parent_ids
            ):
                candidates.append(candidate_id)
        return candidates

    changed = True
    while changed:
        changed = False
        for upstream_id, panda in sorted(unresolved.items()):
            candidates = candidates_for(upstream_id, panda)
            secondary_candidates[upstream_id] = candidates
            if len(candidates) == 1:
                id_to_final[upstream_id] = candidates[0]
                del unresolved[upstream_id]
                changed = True
    for upstream_id, panda in sorted(unresolved.items()):
        secondary_candidates[upstream_id] = candidates_for(upstream_id, panda)

    # New animal IDs remain stable even if a later record is newly matched.
    used_animal_ids = set(animals_by_id)
    mappings = []
    ambiguity_by_upstream = {}
    for panda in sorted(pandas, key=lambda v: str(v.get("_id"))):
        upstream_id = str(panda.get("_id"))
        if upstream_id in explicit_map:
            final_id, method, status, candidates = explicit_map[upstream_id], "explicit_external_id", "matched", []
        elif len(secondary_candidates.get(upstream_id, [])) == 1:
            final_id, method, status, candidates = secondary_candidates[upstream_id][0], "secondary_exact_composite", "matched", []
        else:
            candidate_ids = secondary_candidates.get(upstream_id, [])
            base_id = "red-panda:upstream-" + _safe_part(upstream_id)
            final_id, suffix = base_id, 2
            while final_id in used_animal_ids:
                final_id = f"{base_id}-{suffix}"
                suffix += 1
            used_animal_ids.add(final_id)
            method = "unique_upstream"
            status = "ambiguous_not_merged" if len(candidate_ids) > 1 else "new_record"
            candidates = candidate_ids
            if candidate_ids:
                ambiguity_by_upstream[upstream_id] = candidate_ids
            id_to_final[upstream_id] = final_id
        mapping = {
            "upstream_id": upstream_id,
            "final_animal_id": final_id,
            "match_method": method,
            "status": status,
            "ambiguous_candidates": candidates,
        }
        if upstream_id in REVIEWED_EXTERNAL_ID_CROSSWALKS:
            mapping["crosswalk_evidence"] = {
                "source_ids": REVIEWED_EXTERNAL_ID_CROSSWALKS[upstream_id]["source_ids"],
                "rationale": REVIEWED_EXTERNAL_ID_CROSSWALKS[upstream_id]["rationale"],
            }
        mappings.append(mapping)

    def near_match_candidates_for(panda):
        upstream_id = str(panda.get("_id"))
        name_norms = _upstream_name_norms(panda)
        birth_key = _date_key(panda.get("birthday"))
        source_zoo_ids = zoo_edges.get(upstream_id, set())
        if not name_norms or not birth_key:
            return []
        upstream_zoo_names = set()
        upstream_zoo_issue = None
        if len(source_zoo_ids) == 1:
            zoo = zoo_by_id.get(next(iter(source_zoo_ids)))
            if zoo:
                upstream_zoo_names = {_normalized(value) for _, value in _lang_values(zoo, "name")}
                if not upstream_zoo_names:
                    upstream_zoo_issue = "current_zoo_unmapped_upstream"
            else:
                upstream_zoo_issue = "current_zoo_unmapped_upstream"
        elif source_zoo_ids:
            upstream_zoo_issue = "current_zoo_ambiguous_upstream"
        else:
            upstream_zoo_issue = "current_zoo_missing_upstream"
        upstream_parents = {id_to_final[parent] for parent in parents_by_child.get(upstream_id, []) if parent in id_to_final}
        possible = {candidate_id for name_norm in name_norms for candidate_id in name_index.get(name_norm, [])}
        result = []
        for candidate_id in sorted(possible):
            if _curated_birth_date(atlas, candidate_id) != birth_key:
                continue
            matching_fields = ["normalized_name", "birth_date"]
            mismatched_fields = []
            curated_zoo_names = curated_zoo_norms_by_animal.get(candidate_id, set())
            if upstream_zoo_issue:
                mismatched_fields.append(upstream_zoo_issue)
            elif not curated_zoo_names:
                mismatched_fields.append("current_zoo_missing_curated")
            elif upstream_zoo_names.intersection(curated_zoo_names):
                matching_fields.append("current_zoo")
            else:
                mismatched_fields.append("current_zoo_mismatch")
            curated_parents = curated_parent_by_child.get(candidate_id, set())
            if curated_parents != upstream_parents:
                mismatched_fields.append("known_parent_set")
            else:
                matching_fields.append("known_parent_set")
            if not mismatched_fields:
                mismatched_fields.append("composite_not_uniquely_resolved")
            missing_zoo = any(field in {
                "current_zoo_missing_upstream",
                "current_zoo_unmapped_upstream",
                "current_zoo_ambiguous_upstream",
                "current_zoo_missing_curated",
            } for field in mismatched_fields)
            reasons = []
            if "current_zoo_missing_curated" in mismatched_fields:
                reasons.append("The current zoo is absent from the curated profile, so the required current-zoo match cannot be verified")
            elif "current_zoo_missing_upstream" in mismatched_fields:
                reasons.append("The upstream profile has no current-zoo edge, so the required current-zoo match cannot be verified")
            elif missing_zoo:
                reasons.append("The required current-zoo identity could not be resolved from the available records")
            elif "current_zoo_mismatch" in mismatched_fields:
                reasons.append("The recorded current-zoo names differ")
            if "known_parent_set" in mismatched_fields:
                reasons.append("the known-parent sets do not match exactly")
            if not reasons:
                reasons.append("The required composite identity was not uniquely resolved")
            reason = "; ".join(reasons) + "; this candidate was not merged."
            result.append({
                "animal_id": candidate_id,
                "matching_fields": matching_fields,
                "mismatched_fields": mismatched_fields,
                "upstream_known_parent_animal_ids": sorted(upstream_parents),
                "curated_known_parent_animal_ids": sorted(curated_parents),
                "upstream_current_zoo_names": sorted(upstream_zoo_names),
                "curated_current_zoo_names": sorted(curated_zoo_names),
                "reason": reason,
            })
        return result

    near_match_mappings = []
    incomplete_near_match_mappings = []
    required_field_mismatch_mappings = []
    for mapping in mappings:
        if mapping["match_method"] != "unique_upstream":
            continue
        panda = panda_by_id[mapping["upstream_id"]]
        near = near_match_candidates_for(panda)
        mapping["near_match_candidates"] = near
        if near and mapping["status"] == "new_record":
            missing_required_fields = any(
                any(field in {
                    "current_zoo_missing_upstream",
                    "current_zoo_unmapped_upstream",
                    "current_zoo_ambiguous_upstream",
                    "current_zoo_missing_curated",
                } for field in candidate["mismatched_fields"])
                for candidate in near
            )
            parent_only_mismatch = all(candidate["mismatched_fields"] == ["known_parent_set"] for candidate in near)
            if missing_required_fields:
                mapping["status"] = "near_match_incomplete_required_fields"
                incomplete_near_match_mappings.append({
                    "upstream_id": mapping["upstream_id"],
                    "candidates": near,
                    "outcome": "not merged because a required composite field is unavailable or unresolved",
                })
            elif parent_only_mismatch:
                mapping["status"] = "near_match_parent_mismatch"
                near_match_mappings.append({"upstream_id": mapping["upstream_id"], "candidates": near, "outcome": "not merged because the exact known-parent sets differ"})
            else:
                mapping["status"] = "near_match_required_field_mismatch"
                required_field_mismatch_mappings.append({
                    "upstream_id": mapping["upstream_id"],
                    "candidates": near,
                    "outcome": "not merged because a required composite field differs",
                })

    # Add aliases/localized names to matched records and create source-linked
    # animal rows for records that did not match a curated individual.
    mapping_by_upstream = {item["upstream_id"]: item for item in mappings}
    new_animals = []
    conflicts = []
    claims = copy.deepcopy(atlas.get("claims", []))
    claim_ids = {claim["id"] for claim in claims}

    def add_claim(item):
        if item["id"] not in claim_ids:
            claims.append(item)
            claim_ids.add(item["id"])

    def upstream_claim_id(subject, claim_type, value):
        return "claim:red-panda:upstream:" + _stable_hash([subject, claim_type, value], 20)

    for panda in sorted(pandas, key=lambda v: str(v.get("_id"))):
        upstream_id = str(panda.get("_id"))
        final_id = id_to_final[upstream_id]
        name_pair, localized_names = _upstream_name(panda)
        if not name_pair:
            name_pair = ("en", f"Unnamed upstream panda {upstream_id}")
        raw_gender = str(panda.get("gender", "unknown")).lower()
        upstream_sex = {"female": "female", "male": "male", "intersex": "intersex"}.get(raw_gender, "unknown")
        death_date = _date(panda.get("death"))
        upstream_status = "deceased" if death_date else "unknown"
        birth_date = _date(panda.get("birthday"))
        if final_id in animals_by_id:
            animal = animals_by_id[final_id]
            external_ids = animal.setdefault("external_ids", [])
            external = {"namespace": UPSTREAM_NAMESPACE, "value": upstream_id}
            if external not in external_ids:
                external_ids.append(external)
            name = animal.get("name", {})
            name_sources = name.setdefault("source_ids", [])
            if SOURCE_ID not in name_sources:
                name_sources.append(SOURCE_ID)
            localized = name.setdefault("localized", [])
            existing_names = {(item.get("language"), item.get("value")) for item in localized}
            all_names = [name_pair] + localized_names
            for lang, value in all_names:
                if value != name.get("canonical") and (lang, value) not in existing_names:
                    localized.append({"value": value, "language": lang, "source_ids": [SOURCE_ID]})
                    existing_names.add((lang, value))
            alias_entries = animal.setdefault("aliases", [])
            alias_values = {_normalized(alias.get("value", "")) for alias in alias_entries}
            for field in ("othernames", "nicknames"):
                for lang, values in sorted((panda.get(field) or {}).items()) if isinstance(panda.get(field), dict) else []:
                    values = values if isinstance(values, list) else [values]
                    for value in values:
                        if _is_known_name(value) and _normalized(value) not in alias_values and _normalized(value) != _normalized(name.get("canonical", "")):
                            alias_entries.append({"value": str(value), "language": lang[:2].lower() or "en", "source_ids": [SOURCE_ID]})
                            alias_values.add(_normalized(value))
            for field, curated_value, upstream_value in (
                ("sex", animal.get("sex"), upstream_sex),
                ("status", animal.get("status"), upstream_status),
            ):
                if upstream_value != "unknown" and curated_value not in {"unknown", upstream_value}:
                    value = upstream_value
                    add_claim(_claim(
                        upstream_claim_id(final_id, f"upstream_alternate_{field}", value),
                        final_id,
                        f"upstream_alternate_{field}",
                        value,
                        notes=f"Upstream value conflicts with the curated {field}; curated value remains preferred.",
                    ))
                    conflicts.append({"animal_id": final_id, "upstream_id": upstream_id, "field": field, "preferred_value": curated_value, "alternate_value": value, "source_id": SOURCE_ID})
            if birth_date:
                curated_births = {
                    json.dumps(event.get("date", {}), sort_keys=True)
                    for event in atlas.get("events", [])
                    if event.get("animal_id") == final_id and event.get("type") == "birth"
                }
                upstream_birth = json.dumps(birth_date, sort_keys=True)
                if curated_births and upstream_birth not in curated_births:
                    value = birth_date
                    claim_type = "upstream_alternate_birth_date"
                    add_claim(_claim(
                        upstream_claim_id(final_id, claim_type, value),
                        final_id,
                        claim_type,
                        value,
                        notes="Upstream birth date conflicts with the curated source-linked birth event; curated event remains preferred.",
                    ))
                    conflicts.append({"animal_id": final_id, "upstream_id": upstream_id, "field": "birth_date", "preferred_values": sorted(curated_births), "alternate_value": value, "source_id": SOURCE_ID})
        else:
            aliases = []
            alias_values = {_normalized(name_pair[1])}
            for field in ("othernames", "nicknames"):
                values_by_lang = panda.get(field) or {}
                if isinstance(values_by_lang, dict):
                    for lang, vals in sorted(values_by_lang.items()):
                        vals = vals if isinstance(vals, list) else [vals]
                        for value in vals:
                            if _is_known_name(value) and _normalized(value) not in alias_values:
                                aliases.append({"value": str(value), "language": lang[:2].lower() or "en", "source_ids": [SOURCE_ID]})
                                alias_values.add(_normalized(value))
            localized = [{"value": value, "language": lang, "source_ids": [SOURCE_ID]} for lang, value in localized_names]
            new_animals.append({
                "id": final_id,
                "taxon": "Ailurus fulgens",
                "sex": upstream_sex,
                "status": upstream_status,
                "name": {"canonical": name_pair[1], "language": name_pair[0], "source_ids": [SOURCE_ID], "localized": localized},
                "aliases": aliases,
                "external_ids": [{"namespace": UPSTREAM_NAMESPACE, "value": upstream_id}],
                "review": _review("Upstream profile normalized from the public export; facts have not been independently verified."),
            })
        # Known raw details not modeled in canonical animal fields remain as claims.
        for field in ("species", "birthday", "death", "gender", "color", "weight", "height"):
            value = panda.get(field)
            if value not in (None, "", "none", "unknown"):
                add_claim(_claim(upstream_claim_id(final_id, f"upstream_{field}", value), final_id, f"upstream_{field}", value))

    atlas["animals"] = sorted(list(animals_by_id.values()) + new_animals, key=lambda item: item["id"])
    atlas["claims"] = claims
    atlas["institutions"], zoo_to_final, zoo_mappings = _institution_merge(atlas, zoos, snapshot)

    # Add dated events.  Source location IDs are positive while zoo vertices
    # use negative IDs, so use absolute numeric IDs to join those inventories.
    zoo_id_aliases = {}
    for zoo_id, final_id in zoo_to_final.items():
        zoo_id_aliases[zoo_id] = final_id
        if zoo_id.startswith("-"):
            zoo_id_aliases[zoo_id[1:]] = final_id
        else:
            zoo_id_aliases["-" + zoo_id] = final_id
    events = copy.deepcopy(atlas.get("events", []))
    event_ids = {item["id"] for item in events}
    event_mappings = []
    birthplace_edges = defaultdict(set)
    for edge in upstream.get("edges", []):
        if edge.get("_label") == "birthplace":
            birthplace_edges[str(edge.get("_out"))].add(str(edge.get("_in")))
    for panda in sorted(pandas, key=lambda v: str(v.get("_id"))):
        upstream_id = str(panda.get("_id"))
        final_id = id_to_final[upstream_id]
        birth = _date(panda.get("birthday"))
        death = _date(panda.get("death"))
        birth_place = next((zoo_id_aliases.get(value) for value in sorted(birthplace_edges.get(upstream_id, [])) if zoo_id_aliases.get(value)), None)
        for kind, date_value, institution_id in (("birth", birth, birth_place), ("death", death, None)):
            if not date_value:
                continue
            eid = _event_id(final_id, kind, upstream_id, date_value)
            event_mappings.append({"upstream_id": upstream_id, "event_type": kind, "event_id": eid, "status": "imported"})
            if eid not in event_ids:
                events.append({"id": eid, "animal_id": final_id, "type": kind, "date": date_value, "institution_id": institution_id, "source_ids": [SOURCE_ID], "notes": f"{kind.title()} date from upstream profile {upstream_id}; source precision retained."})
                event_ids.add(eid)
        locations = panda.get("locations", [])
        parsed_locations = []
        for location in locations if isinstance(locations, list) else []:
            if isinstance(location, dict):
                loc_id = str(location.get("_id", ""))
                loc_date = _date(location.get("date"))
                institution_id = zoo_id_aliases.get(loc_id)
                if institution_id and loc_date:
                    parsed_locations.append((loc_date.get("value") or loc_date.get("start") or "", institution_id))
        for index, (date_text, institution_id) in enumerate(sorted(set(parsed_locations))):
            if index == 0 and birth and birth_place == institution_id and date_text == birth.get("value"):
                continue
            date_value = _date(date_text)
            if not date_value:
                continue
            kind = "transfer" if index else "observation"
            eid = _event_id(final_id, kind, upstream_id, [date_value, institution_id])
            event_mappings.append({"upstream_id": upstream_id, "event_type": kind, "event_id": eid, "status": "imported"})
            if eid not in event_ids:
                events.append({"id": eid, "animal_id": final_id, "type": kind, "date": date_value, "institution_id": institution_id, "source_ids": [SOURCE_ID], "notes": f"Location-history entry from upstream profile {upstream_id}."})
                event_ids.add(eid)
    atlas["events"] = sorted(events, key=lambda item: item["id"])

    # Family edges are directed child -> parent upstream. Convert to Atlas
    # parent -> child; unknown offspring markers, unknown parents and self loops
    # remain fully represented in the audit mapping but create no fake node.
    relationships = copy.deepcopy(atlas.get("relationships", []))
    relation_key_to_idx = {}
    for index, relation in enumerate(relationships):
        relation_key_to_idx[(relation.get("subject"), relation.get("object"), relation.get("type"))] = index
    family_map = []
    family_source_edges = [e for e in upstream.get("edges", []) if e.get("_label") == "family"]
    for index, edge in enumerate(family_source_edges, 1):
        child_raw, parent_raw = str(edge.get("_in")), str(edge.get("_out"))
        item = {"source_edge_id": f"family:{index:04d}", "source_edge": copy.deepcopy(edge)}
        if child_raw == "none":
            item.update(status="excluded_unknown_offspring_marker", reason="The source uses an unknown offspring marker; no animal node is created.")
        elif parent_raw == "none":
            item.update(status="excluded_unknown_parent_marker", reason="The source uses an unknown parent marker; no animal node is created.")
        elif child_raw == parent_raw:
            item.update(status="excluded_self_parent_edge", reason="Self-parent edge is invalid and was excluded.")
            conflicts.append({"type": "self_parent_edge", "source_edge_id": item["source_edge_id"], "upstream_id": child_raw, "source_id": SOURCE_ID})
        elif child_raw not in id_to_final or parent_raw not in id_to_final:
            item.update(status="excluded_unmapped_endpoint", child_upstream_id=child_raw, parent_upstream_id=parent_raw)
        else:
            child_id, parent_id = id_to_final[child_raw], id_to_final[parent_raw]
            parent = panda_by_id.get(parent_raw, {})
            sex = str(parent.get("gender", "unknown")).lower()
            rel_type = "biological_mother" if sex == "female" else "biological_father" if sex == "male" else None
            item.update(child_animal_id=child_id, parent_animal_id=parent_id)
            if not rel_type:
                claim_value = {"related_animal_id": parent_id, "direction": "parent_of"}
                cid = upstream_claim_id(child_id, "upstream_parent_association", claim_value)
                add_claim(_claim(cid, child_id, "upstream_parent_association", claim_value))
                item.update(status="imported_parent_association_claim", claim_id=cid)
            elif child_id == parent_id:
                item.update(status="excluded_merged_self_parent_edge", reason="Distinct upstream IDs resolved to the same curated individual.")
                conflicts.append({"type": "merged_self_parent_edge", "source_edge_id": item["source_edge_id"], "animal_id": child_id, "source_id": SOURCE_ID})
            else:
                key = (parent_id, child_id, rel_type)
                conflicting_relations = [
                    relation for relation in relationships
                    if relation.get("subject") == parent_id and relation.get("object") == child_id and relation.get("type") != rel_type
                ]
                if conflicting_relations:
                    value = {"parent_animal_id": parent_id, "relationship_type": rel_type}
                    cid = upstream_claim_id(child_id, "upstream_alternate_parent_relationship", value)
                    add_claim(_claim(cid, child_id, "upstream_alternate_parent_relationship", value, notes="Upstream parent classification conflicts with a curated source-linked relationship; the curated relationship remains preferred."))
                    item.update(status="excluded_conflicting_curated_relationship", claim_id=cid, preferred_relationship_ids=sorted(relation["id"] for relation in conflicting_relations))
                    conflicts.append({"animal_id": child_id, "field": "parent_relationship", "preferred_relationship_ids": sorted(relation["id"] for relation in conflicting_relations), "alternate_parent_id": parent_id, "alternate_relationship_type": rel_type, "source_edge_id": item["source_edge_id"], "source_id": SOURCE_ID})
                elif key in relation_key_to_idx:
                    relation = relationships[relation_key_to_idx[key]]
                    if SOURCE_ID not in relation.setdefault("source_ids", []):
                        relation["source_ids"].append(SOURCE_ID)
                    item.update(status="mapped_to_existing_relationship", relationship_id=relation["id"])
                else:
                    rid = "relationship:red-panda:upstream:" + _stable_hash([parent_id, child_id, rel_type], 20)
                    relation = {"id": rid, "subject": parent_id, "object": child_id, "type": rel_type, "status": "probable", "source_ids": [SOURCE_ID], "review": _review("Parent direction inverted from the upstream child-to-parent edge; parent sex determines the relationship type.")}
                    relation_key_to_idx[key] = len(relationships)
                    relationships.append(relation)
                    item.update(status="imported_relationship", relationship_id=rid)
        family_map.append(item)
    atlas["relationships"] = sorted(relationships, key=lambda item: item["id"])

    # A litter edge denotes a sibling association, not a social relationship.
    litter_map = []
    litter_claim_by_pair = {}
    litter_source_edges = [e for e in upstream.get("edges", []) if e.get("_label") == "litter"]
    for index, edge in enumerate(litter_source_edges, 1):
        member_a, member_b = str(edge.get("_in")), str(edge.get("_out"))
        item = {"source_edge_id": f"litter:{index:04d}", "source_edge": copy.deepcopy(edge)}
        if member_a == "none" or member_b == "none":
            item.update(status="excluded_unknown_litter_member_marker", reason="The source uses an unknown litter-member marker; no animal node is created.")
        elif member_a not in id_to_final or member_b not in id_to_final:
            item.update(status="excluded_unmapped_endpoint", upstream_ids=[member_a, member_b])
        elif id_to_final[member_a] == id_to_final[member_b]:
            item.update(status="excluded_same_canonical_individual", animal_id=id_to_final[member_a])
        else:
            animal_ids = sorted([id_to_final[member_a], id_to_final[member_b]])
            pair_key = tuple(animal_ids)
            if pair_key in litter_claim_by_pair:
                cid = litter_claim_by_pair[pair_key]
                item.update(status="mapped_to_existing_litter_claim", claim_id=cid)
            else:
                value = {"related_animal_id": animal_ids[1], "association": "same_litter"}
                cid = "claim:red-panda:upstream:litter:" + _stable_hash(animal_ids, 20)
                add_claim(_claim(cid, animal_ids[0], "upstream_litter_association", value))
                litter_claim_by_pair[pair_key] = cid
                item.update(status="imported_litter_claim", claim_id=cid)
        litter_map.append(item)
    atlas["claims"] = claims

    # Keep only attributable HTTP(S) URL metadata for photos associated with a
    # panda. Local paths and opaque source schemes are never serialized.
    media = copy.deepcopy(atlas.get("media", []))
    media_id_by_key = {
        (m.get("animal_id"), m.get("source_page_url"), m.get("direct_remote_url")): m["media_id"]
        for m in media
    }
    media_vertex_details = {}
    for vertex in vertices:
        if vertex.get("type") != "media":
            continue
        source_vertex_id = str(vertex.get("_id"))
        tagged_ids = sorted(set(str(item) for item in vertex.get("panda.tags", [])))
        mapped_tagged_ids = sorted({id_to_final[item] for item in tagged_ids if item in id_to_final})
        media_vertex_details[source_vertex_id] = {
            "target_animal_ids": mapped_tagged_ids,
            "target_media_ids": set(),
            "photo_mappings": [],
            "unmapped_tagged_upstream_ids": sorted(set(tagged_ids) - set(id_to_final)),
        }
    retained_page_count = 0
    retained_direct_count = 0
    dropped_photo_refs = 0
    dropped_photo_ref_reasons = Counter()
    dropped_media_owner_associations = 0
    raw_photo_refs = _all_photo_refs(upstream)

    def media_for_photo(photo, upstream_ids, vertex_id, photo_index):
        nonlocal retained_page_count, retained_direct_count, dropped_photo_refs, dropped_media_owner_associations
        detail = media_vertex_details.get(vertex_id)
        page = _http_url(photo.get("source"))
        direct = _http_url(photo.get("url"))
        if not page and not direct:
            dropped_photo_refs += 1
            dropped_photo_ref_reasons["no_http_source_or_direct_url"] += 1
            if detail is not None:
                detail["photo_mappings"].append({"source_photo_index": photo_index, "status": "excluded_no_http_url", "target_media_ids": []})
            return
        if not page:
            page = snapshot["export_url"]
            page_note = "No HTTP(S) source page was supplied; the export URL is retained as provenance and the direct URL remains metadata only."
        else:
            page_note = "Upstream photo source page; image embedding and downloading are not permitted by this record."
        source_author = photo.get("author")
        raw_owners = sorted(set(upstream_ids))
        owners = [upstream_id for upstream_id in raw_owners if upstream_id in id_to_final]
        if not owners:
            dropped_photo_refs += 1
            dropped_photo_ref_reasons["unmapped_or_non_panda_owner"] += 1
            if detail is not None:
                detail["photo_mappings"].append({"source_photo_index": photo_index, "status": "excluded_unmapped_owner", "target_media_ids": []})
            return
        retained_page_count += 1
        retained_direct_count += int(bool(direct))
        target_media_ids = []
        for upstream_id in owners:
            animal_id = id_to_final[upstream_id]
            key = (animal_id, page, direct)
            media_id = media_id_by_key.get(key)
            if not media_id:
                media_id = "media:red-panda:upstream:" + _stable_hash([animal_id, page, direct], 20)
                notes = f"Photo metadata from upstream {vertex_id} item {photo_index}. {page_note} Local image bytes and path fields were discarded."
                media.append({
                    "media_id": media_id,
                    "animal_id": animal_id,
                    "source_page_url": page,
                    **({"direct_remote_url": direct} if direct else {}),
                    "credit": str(source_author) if source_author else None,
                    "rights_status": "unknown",
                    "embedding_status": "link_only",
                    "offline_archive_eligible": False,
                    "identity_confidence": "probable",
                    "checked_date": snapshot["retrieved_at_utc"][:10],
                    "notes": notes,
                    "source_ids": [SOURCE_ID],
                })
                media_id_by_key[key] = media_id
            target_media_ids.append(media_id)
            if detail is not None:
                detail["target_media_ids"].add(media_id)
        if detail is not None:
            detail["photo_mappings"].append({
                "source_photo_index": photo_index,
                "status": "mapped_media_metadata",
                "target_media_ids": sorted(set(target_media_ids)),
            })

    for panda in pandas:
        for photo_index, photo in enumerate(panda.get("photos", []), 1):
            media_for_photo(photo, [str(panda.get("_id"))], str(panda.get("_id")), photo_index)
    for vertex in vertices:
        if vertex.get("type") == "media":
            raw_owners = [str(item) for item in vertex.get("panda.tags", [])]
            owners = [owner for owner in raw_owners if owner in id_to_final]
            dropped_media_owner_associations += len(set(raw_owners) - set(owners))
            for photo_index, photo in enumerate(vertex.get("photos", []), 1):
                media_for_photo(photo, raw_owners, str(vertex.get("_id")), photo_index)
        elif vertex.get("type") != "panda":
            count = len(vertex.get("photos", []))
            dropped_photo_refs += count
            dropped_photo_ref_reasons["non_animal_vertex_photo_ref"] += count
            continue
    atlas["media"] = sorted(media, key=lambda item: item["media_id"])

    # Preserve all source photo-page links as auditable source records, while
    # avoiding a second source row when a page URL repeats.
    existing_source_ids = {source["id"] for source in atlas.get("sources", [])}
    photo_urls = sorted({
        _http_url(photo.get("source"))
        for vertex in vertices
        for photo in vertex.get("photos", [])
        if _http_url(photo.get("source"))
    })
    for url in photo_urls:
        sid = _source_url_id(url)
        if sid in existing_source_ids:
            continue
        atlas["sources"].append({
            "id": sid,
            "title": "Upstream photo source page",
            "publisher": urlparse(url).netloc,
            "url": url,
            "publication_date": None,
            "accessed_date": snapshot["retrieved_at_utc"][:10],
            "source_type": "media_source_link",
            "tier": "discovery_only",
            "notes": "URL is retained as attribution metadata only; image embedding, download, and rights are not cleared.",
            "data_use": "Citation/link metadata only; no media reuse is implied.",
        })
        existing_source_ids.add(sid)

    for item in atlas["media"]:
        if item.get("media_id", "").startswith("media:red-panda:upstream:"):
            page_source_id = _source_url_id(item["source_page_url"])
            if item["source_page_url"] != snapshot["export_url"] and page_source_id in existing_source_ids and page_source_id not in item["source_ids"]:
                item["source_ids"].append(page_source_id)

    # Coverage and release identify the current merged collection and its update.
    accessed_day = snapshot["retrieved_at_utc"][:10]
    atlas.setdefault("release", {})["data_version"] = accessed_day
    atlas["release"]["build_date"] = accessed_day
    atlas["release"]["provenance"] = "Curated Futa-family records merged with every named individual in the pinned wwoast/redpanda-lineage export; see RED_PANDA_UPSTREAM_SYNC.md and upstream_sync_report.json."
    atlas.setdefault("coverage", {})["last_reviewed"] = accessed_day
    coverage = atlas["coverage"]
    coverage["scope"] = "The 83-record curated Futa-family layer merged with named panda profiles from the pinned global wwoast/redpanda-lineage export; the source graph and non-individual markers are reported in the sync report."
    coverage["source_categories"] = sorted(set(coverage.get("source_categories", [])) | {"community_dataset"})
    limitations = [
        item for item in coverage.get("limitations", [])
        if "global profile snapshot" not in item.lower()
        and "independent global" not in item.lower()
        and "direct image url" not in item.lower()
        and "animal photos" not in item.lower()
        and "excluded" not in item.lower()
    ]
    limitations.extend([
        "The upstream repository reports no declared reuse license; photo-page and direct-URL metadata remain link-only with rights and embedding unknown.",
        "Upstream records require review; unknown offspring and litter-member markers are reported, not animals, and curated facts remain preferred in conflicts.",
    ])
    coverage["limitations"] = list(dict.fromkeys(limitations))
    for lang, scope in (("ja", "引用されたFuta家系の83件と、固定したwwoast/redpanda-lineageのレッサーパンダ個体プロフィールを統合しています。"), ("ru", "Объединены 83 записи по семейству Futa с профилями особей из зафиксированного экспорта wwoast/redpanda-lineage.")):
        trans = coverage.setdefault("translations", {}).setdefault(lang, {"limitations": []})
        trans["scope"] = scope
        stale_tokens = ("スナップショット", "除外", "写真") if lang == "ja" else ("снимок", "исключ", "фотограф")
        translated_limitations = [value for value in trans.get("limitations", []) if not any(token in value.lower() for token in stale_tokens)]
        translated_media_license = (
            "上流リポジトリに再利用ライセンスの明示はありません。写真ページと画像URLはリンクのみのメタデータとして保持し、権利と埋め込み許可は不明です。"
            if lang == "ja"
            else "В репозитории источника нет явной лицензии на повторное использование; страницы фотографий и прямые URL сохранены только как ссылки, права и встраивание неизвестны."
        )
        translated_review = (
            "上流記録は確認が必要です。不明な子や同腹個体の目印は動物記録にせず、矛盾がある場合は出典付きの編纂済み情報を優先します。"
            if lang == "ja"
            else "Записи источника требуют проверки; маркеры неизвестных потомков и членов помёта не становятся животными, а при конфликте предпочтение отдаётся кураторским данным с источниками."
        )
        trans["limitations"] = list(dict.fromkeys(translated_limitations + [
            translated_media_license,
            translated_review,
        ]))

    # Input accounting includes every vertex and edge. No placeholder vertices
    # are created for wild/population markers, links, or unknown sentinels.
    url_stats = _url_counts(upstream)
    family_status_counts = Counter(item["status"] for item in family_map)
    litter_status_counts = Counter(item["status"] for item in litter_map)
    merged_count = sum(item["status"] == "matched" for item in mappings)
    ambiguous_count = sum(item["status"] == "ambiguous_not_merged" for item in mappings)
    unknown_types = Counter(v.get("type", "unknown") for v in vertices)
    mapping_by_id = {item["upstream_id"]: item for item in mappings}
    reviewed_crosswalks = [
        {
            "upstream_id": upstream_id,
            "curated_animal_id": evidence["curated_animal_id"],
            "match_method": mapping_by_id[upstream_id]["match_method"],
            "status": mapping_by_id[upstream_id]["status"],
            "source_ids": evidence["source_ids"],
            "rationale": evidence["rationale"],
        }
        for upstream_id, evidence in sorted(REVIEWED_EXTERNAL_ID_CROSSWALKS.items())
        if upstream_id in mapping_by_id
    ]
    zoo_mapping_by_id = {str(item["upstream_id"]): item for item in zoo_mappings}
    source_vertex_mappings = []
    for vertex in sorted(vertices, key=lambda item: str(item.get("_id"))):
        source_vertex_id = str(vertex.get("_id"))
        source_type = vertex.get("type", "unknown")
        row = {"source_vertex_id": source_vertex_id, "source_type": source_type}
        if source_type == "panda":
            animal_mapping = mapping_by_id[source_vertex_id]
            row.update(
                status=animal_mapping["status"],
                final_animal_id=animal_mapping["final_animal_id"],
                match_method=animal_mapping["match_method"],
            )
        elif source_type == "zoo":
            zoo_mapping = zoo_mapping_by_id[source_vertex_id]
            row.update(
                status=zoo_mapping["status"],
                final_institution_id=zoo_mapping["final_institution_id"],
                ambiguous_candidates=zoo_mapping["ambiguous_candidates"],
            )
        elif source_type == "media":
            detail = media_vertex_details[source_vertex_id]
            target_media_ids = sorted(detail["target_media_ids"])
            if target_media_ids:
                status = "mapped_media_metadata"
            elif detail["target_animal_ids"]:
                status = "excluded_no_attributable_photo_metadata"
            else:
                status = "excluded_photo_only_vertex"
            row.update(
                status=status,
                target_animal_ids=detail["target_animal_ids"],
                target_media_ids=target_media_ids,
                photo_reference_mappings=detail["photo_mappings"],
                unmapped_tagged_upstream_ids=detail["unmapped_tagged_upstream_ids"],
            )
        elif source_type == "none":
            row.update(status="excluded_unknown_marker", reason="Unknown graph endpoints are not individual animals.")
        elif source_type == "wild":
            row.update(status="excluded_population_marker", reason="A population/location marker does not identify an individual animal.")
        elif source_type == "links":
            row.update(status="excluded_source_link_vertex", reason="Attribution/support vertices are inventoried as source links, not animals.")
        else:
            row.update(status="excluded_non_individual_vertex", reason="This source vertex type does not identify a named individual animal.")
        source_vertex_mappings.append(row)
    canonical_source_tier_audit = _curated_source_tier_audit(atlas)
    atlas_sources_by_id = {source["id"]: source for source in atlas.get("sources", [])}
    unresolved_source_review = copy.deepcopy(CURATED_UNRESOLVED_SOURCE_REVIEW)
    for item in unresolved_source_review:
        item["source_tiers"] = {
            source_id: atlas_sources_by_id.get(source_id, {}).get("tier", "missing")
            for source_id in item["source_ids"]
        }
    report = {
        "source_snapshot": copy.deepcopy(snapshot),
        "source_counts": {
            "vertices": len(vertices),
            "pandas": len(pandas),
            "zoos": len(zoos),
            "media_vertices": unknown_types.get("media", 0),
            "wild_vertices": unknown_types.get("wild", 0),
            "link_vertices": url_stats["source_link_vertices"],
            "other_vertices_by_type": dict(sorted(unknown_types.items())),
            "none_sentinel_vertices": unknown_types.get("none", 0),
            "family_edges": len(family_source_edges),
            "litter_edges": len(litter_source_edges),
            "photo_refs_total": raw_photo_refs,
            "photo_refs_by_vertex_type": url_stats["photo_refs_by_vertex_type"],
            "http_photo_source_occurrences": url_stats["photo_source_http_occurrences"],
            "unique_http_photo_source_urls": url_stats["unique_photo_source_http_urls"],
            "invalid_http_photo_source_occurrences": url_stats["invalid_photo_source_http_occurrences"],
            "http_photo_direct_url_occurrences": url_stats["direct_photo_http_occurrences"],
            "unique_http_photo_direct_urls": url_stats["unique_direct_photo_http_urls"],
            "invalid_http_photo_direct_url_occurrences": url_stats["invalid_direct_photo_http_occurrences"],
            "http_url_string_occurrences_all_vertices": url_stats["http_url_occurrences"],
            "unique_http_url_strings_all_vertices": url_stats["unique_http_urls"],
            "invalid_http_url_string_occurrences_all_vertices": url_stats["invalid_http_url_occurrences"],
            "unique_invalid_http_url_strings_all_vertices": url_stats["unique_invalid_http_urls"],
        },
        "counts": {
            "source_vertices_in": len(vertices),
            "source_vertex_id_mappings": len(source_vertex_mappings),
            "curated_animals_in": len(curated.get("animals", [])),
            "upstream_pandas": len(pandas),
            "merged_overlaps": merged_count,
            "ambiguous_unmerged_profiles": ambiguous_count,
            "near_match_parent_mismatch_profiles_not_merged": len(near_match_mappings),
            "near_match_incomplete_required_fields_profiles_not_merged": len(incomplete_near_match_mappings),
            "near_match_required_field_mismatch_profiles_not_merged": len(required_field_mismatch_mappings),
            "near_match_review_candidates_not_merged": len(near_match_mappings) + len(incomplete_near_match_mappings) + len(required_field_mismatch_mappings),
            "reviewed_external_id_crosswalks": len(reviewed_crosswalks),
            "unique_upstream_animals_added": len(pandas) - merged_count,
            "canonical_animals_out": len(atlas["animals"]),
            "curated_institutions_in": len(curated.get("institutions", [])),
            "upstream_zoos": len(zoos),
            "canonical_institutions_out": len(atlas["institutions"]),
            "family_edges_source": len(family_map),
            "family_edges_unknown_offspring_markers": family_status_counts["excluded_unknown_offspring_marker"],
            "family_edges_unknown_parent_markers": family_status_counts["excluded_unknown_parent_marker"],
            "family_edges_self_excluded": family_status_counts["excluded_self_parent_edge"] + family_status_counts["excluded_merged_self_parent_edge"],
            "family_edges_valid_nonself_source": sum(family_status_counts[k] for k in ("mapped_to_existing_relationship", "imported_relationship", "imported_parent_association_claim")),
            "family_relationships_added": sum(item["status"] == "imported_relationship" for item in family_map),
            "family_association_claims_added": sum(item["status"] == "imported_parent_association_claim" for item in family_map),
            "litter_edges_source": len(litter_map),
            "litter_edges_unknown_member_markers": litter_status_counts["excluded_unknown_litter_member_marker"],
            "litter_edges_valid_nonmarker_source": sum(litter_status_counts[k] for k in ("imported_litter_claim", "mapped_to_existing_litter_claim")),
            "unique_litter_pair_claims_added": len(litter_claim_by_pair),
            "retained_media_source_page_urls": retained_page_count,
            "retained_direct_remote_urls": retained_direct_count,
            "photo_refs_retained_with_url_metadata": retained_page_count,
            "photo_refs_dropped_without_animal_media_record": dropped_photo_refs,
            "photo_refs_total": raw_photo_refs,
            "dropped_media_owner_associations": dropped_media_owner_associations,
            "unique_upstream_media_records_added": sum(item.get("media_id", "").startswith("media:red-panda:upstream:") for item in atlas["media"]),
            "dropped_photo_refs": dropped_photo_refs,
            "dropped_path_fields": url_stats["path_fields"],
            "dropped_image_byte_fields": url_stats["image_byte_fields"],
            "records_with_photos_field_dropped": url_stats["records_with_photos_field"],
            "non_http_photo_direct_url_refs_dropped": url_stats["non_http_photo_direct_url_occurrences"],
            "canonical_media_out": len(atlas["media"]),
            "canonical_events_added": len(event_mappings),
            "canonical_source_tier_audit_records": len(canonical_source_tier_audit),
            "unresolved_curated_source_review_items": len(unresolved_source_review),
        },
        "matching_policy": {
            "explicit_id": "Match upstream profile _id to a curated external_ids value in namespace wwoast-redpanda-lineage.",
            "secondary": "Require exact normalized name, birth date, current zoo, and exactly matching known-parent ID sets. Parent sets must resolve completely; empty sets can match when both records have no known parents.",
            "ambiguity": "Never merge when a composite key has multiple curated candidates; list all candidates and create a separate upstream animal.",
            "incomplete_candidate_review": "Candidates sharing normalized name and exact birth date are reported when current-zoo identity or another required field is unavailable; those candidates are not auto-merged.",
        },
        "animal_id_mappings": mappings,
        "source_vertex_id_mappings": source_vertex_mappings,
        "curated_animal_id_mappings": [
            {"curated_animal_id": animal["id"], "final_animal_id": animal["id"], "status": "retained_curated_identity"}
            for animal in sorted(curated.get("animals", []), key=lambda item: item["id"])
        ],
        "institution_id_mappings": zoo_mappings,
        "event_mappings": event_mappings,
        "edge_id_mappings": {"family": family_map, "litter": litter_map},
        "provenance_conflicts": conflicts,
        "ambiguities": [
            {"upstream_id": upstream_id, "candidates": sorted(candidates), "outcome": "not merged; unique upstream animal created"}
            for upstream_id, candidates in sorted(ambiguity_by_upstream.items())
        ],
        "near_match_parent_mismatches": near_match_mappings,
        "near_match_incomplete_required_fields": incomplete_near_match_mappings,
        "near_match_required_field_mismatches": required_field_mismatch_mappings,
        "reviewed_external_id_crosswalks": reviewed_crosswalks,
        "canonical_source_tier_audit": canonical_source_tier_audit,
        "unresolved_curated_source_review": unresolved_source_review,
        "media_accounting": {
            "retained_metadata_policy": "Only HTTP(S) source-page and direct-remote URL metadata associated with named panda records is retained. rights_status=unknown, embedding_status=link_only, offline_archive_eligible=false.",
            "dropped_photo_ref_reasons": dict(sorted(dropped_photo_ref_reasons.items())),
            "dropped_fields": {"path": url_stats["path_fields"], "image_or_byte_payload_fields": url_stats["image_byte_fields"]},
            "dropped_fields_by_vertex_type": {
                "path": url_stats["path_fields_by_vertex_type"],
                "image_or_byte_payload": url_stats["image_byte_fields_by_vertex_type"],
            },
            "photos_arrays_not_serialized": url_stats["records_with_photos_field"],
            "raw_non_http_direct_photo_urls_not_serialized": url_stats["non_http_photo_direct_url_occurrences"],
        },
        "excluded_source_records": {
            "wild_vertices": "Generic population/location markers; not identified individuals.",
            "link_vertices": "Site attribution/support vertices; their HTTP(S) URL inventory is reported separately.",
            "unknown_markers": "The literal none/unknown graph endpoints describe unknown offspring or litter members, never animal identities.",
            "photo_only_vertices": "Media vertices without a tagged named panda are not converted into animal records.",
        },
    }
    atlas["sources"].sort(key=lambda item: item["id"])
    atlas["claims"].sort(key=lambda item: item["id"])
    atlas["relationships"].sort(key=lambda item: item["id"])
    atlas["events"].sort(key=lambda item: item["id"])
    atlas["media"].sort(key=lambda item: item["media_id"])
    return atlas, report
