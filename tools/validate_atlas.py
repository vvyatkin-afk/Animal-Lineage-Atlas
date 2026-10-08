#!/usr/bin/env python3
"""Validate canonical Animal Lineage Atlas JSON without third-party packages."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


STATUSES = {"confirmed", "probable", "disputed", "unknown"}
REVIEW_STATUSES = {"reviewed", "needs_review", "unreviewed"}
RELATION_TYPES = {"biological_mother", "biological_father", "foster", "adoptive", "social"}
ANCESTRY_TYPES = {"biological_mother", "biological_father"}
EVENT_TYPES = {"birth", "death", "move", "transfer", "release", "observation"}
EMBEDDABLE_RIGHTS = {"cc0", "public_domain", "permission_granted", "license_allows_embedding"}
PARTIAL_DATE_RE = re.compile(r"^\d{4}(?:-\d{2}(?:-\d{2})?)?$")
FULL_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True)
class Issue:
    code: str
    path: str
    message: str


def _issue(issues: list[Issue], code: str, path: str, message: str) -> None:
    issues.append(Issue(code, path, message))


def _is_nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _valid_date_text(value: Any, full_only: bool = False) -> bool:
    if not isinstance(value, str):
        return False
    pattern = FULL_DATE_RE if full_only else PARTIAL_DATE_RE
    if not pattern.fullmatch(value):
        return False
    try:
        parts = value.split("-")
        year = int(parts[0])
        if len(parts) >= 2:
            month = int(parts[1])
            if not 1 <= month <= 12:
                return False
        if len(parts) == 3:
            date(year, month, int(parts[2]))
    except (ValueError, TypeError):
        return False
    return True


def _date_bounds(value: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    parts = [int(item) for item in value.split("-")]
    year = parts[0]
    if len(parts) == 1:
        return (year, 1, 1), (year, 12, 31)
    month = parts[1]
    if len(parts) == 2:
        if month == 12:
            return (year, month, 1), (year, month, 31)
        next_month = date(year + (month == 12), (month % 12) + 1, 1)
        return (year, month, 1), (next_month.year, next_month.month, next_month.day - 1)
    day = parts[2]
    return (year, month, day), (year, month, day)


def _check_date_value(value: Any, path: str, issues: list[Issue]) -> None:
    if not isinstance(value, dict):
        _issue(issues, "invalid_date", path, "Date must be a precision-tagged object.")
        return
    precision = value.get("precision")
    if precision == "exact":
        if not _valid_date_text(value.get("value"), full_only=True):
            _issue(issues, "invalid_date", f"{path}.value", "Exact dates must be valid YYYY-MM-DD dates.")
    elif precision == "approximate":
        if not _valid_date_text(value.get("value")):
            _issue(issues, "invalid_date", f"{path}.value", "Approximate dates must be valid YYYY, YYYY-MM, or YYYY-MM-DD values.")
    elif precision == "range":
        start = value.get("start")
        end = value.get("end")
        if not _valid_date_text(start) or not _valid_date_text(end):
            _issue(issues, "invalid_date", path, "Date ranges must use valid partial dates for both bounds.")
        elif _date_bounds(start)[0] > _date_bounds(end)[1]:
            _issue(issues, "invalid_date_range", path, "Date range starts after it ends.")
    elif precision == "unknown":
        if not _is_nonempty_string(value.get("notes")):
            _issue(issues, "invalid_date", f"{path}.notes", "Unknown dates require a note explaining the uncertainty.")
    else:
        _issue(issues, "invalid_date", f"{path}.precision", "Date precision must be exact, approximate, range, or unknown.")


def _check_review(value: Any, path: str, issues: list[Issue]) -> None:
    if not isinstance(value, dict) or value.get("status") not in REVIEW_STATUSES:
        _issue(issues, "invalid_review", path, "Review metadata needs a supported status.")
        return
    if not _valid_date_text(value.get("reviewed_on"), full_only=True):
        _issue(issues, "invalid_review_date", f"{path}.reviewed_on", "Review date must be a valid YYYY-MM-DD date.")
    if not isinstance(value.get("notes"), str):
        _issue(issues, "invalid_review", f"{path}.notes", "Review notes must be text.")


def _check_source_refs(record: dict[str, Any], path: str, source_ids: set[str], issues: list[Issue]) -> None:
    refs = record.get("source_ids")
    if not isinstance(refs, list) or not refs:
        _issue(issues, "missing_evidence", f"{path}.source_ids", "A factual record must cite at least one source.")
        return
    for offset, source_id in enumerate(refs):
        if source_id not in source_ids:
            _issue(issues, "dangling_source", f"{path}.source_ids[{offset}]", f"Source {source_id!r} does not exist.")


def _check_uri(value: Any) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def validate_atlas(document: dict[str, Any]) -> list[Issue]:
    """Return schema and cross-reference issues without mutating the document."""
    issues: list[Issue] = []
    if not isinstance(document, dict):
        return [Issue("invalid_document", "$", "Atlas document must be an object.")]

    expected = {"release", "coverage", "animals", "claims", "relationships", "events", "institutions", "media", "sources"}
    for key in sorted(expected - set(document)):
        _issue(issues, "missing_collection", f"$.{key}", "Required atlas field is missing.")
    for key in sorted(set(document) - expected):
        _issue(issues, "unexpected_field", f"$.{key}", "Atlas has an unrecognized top-level field.")

    release = document.get("release", {})
    if not isinstance(release, dict):
        _issue(issues, "invalid_release", "$.release", "Release metadata must be an object.")
    else:
        for field in ("schema_version", "data_version", "engine_version", "provenance"):
            if not _is_nonempty_string(release.get(field)):
                _issue(issues, "invalid_release", f"$.release.{field}", "Release value must be non-empty text.")
        if not _valid_date_text(release.get("build_date"), full_only=True):
            _issue(issues, "invalid_release_date", "$.release.build_date", "Build date must be a valid YYYY-MM-DD date.")

    coverage = document.get("coverage", {})
    if not isinstance(coverage, dict):
        _issue(issues, "invalid_coverage", "$.coverage", "Coverage metadata must be an object.")
    else:
        for field in ("taxon", "scope"):
            if not _is_nonempty_string(coverage.get(field)):
                _issue(issues, "invalid_coverage", f"$.coverage.{field}", "Coverage value must be non-empty text.")
        if not isinstance(coverage.get("limitations"), list) or not all(isinstance(item, str) for item in coverage.get("limitations", [])):
            _issue(issues, "invalid_coverage", "$.coverage.limitations", "Coverage limitations must be a list of strings.")
        translations = coverage.get("translations")
        if not isinstance(translations, dict):
            _issue(issues, "missing_coverage_translation", "$.coverage.translations", "Japanese and Russian coverage translations are required.")
        else:
            for locale in ("ja", "ru"):
                translated = translations.get(locale)
                path = f"$.coverage.translations.{locale}"
                if not isinstance(translated, dict):
                    _issue(issues, "missing_coverage_translation", path, "Coverage translation must be an object.")
                    continue
                if not _is_nonempty_string(translated.get("scope")):
                    _issue(issues, "invalid_coverage_translation", f"{path}.scope", "Translated coverage scope must be non-empty text.")
                translated_limitations = translated.get("limitations")
                if not isinstance(translated_limitations, list) or not all(_is_nonempty_string(item) for item in translated_limitations):
                    _issue(issues, "invalid_coverage_translation", f"{path}.limitations", "Translated limitations must be a list of non-empty strings.")
                elif isinstance(coverage.get("limitations"), list) and len(translated_limitations) != len(coverage["limitations"]):
                    _issue(issues, "invalid_coverage_translation", f"{path}.limitations", "Translated limitations must retain the same entries as the canonical text.")
        if not _valid_date_text(coverage.get("last_reviewed"), full_only=True):
            _issue(issues, "invalid_coverage_date", "$.coverage.last_reviewed", "Review date must be a valid YYYY-MM-DD date.")

    collection_names = ("animals", "claims", "relationships", "events", "institutions", "media", "sources")
    collections: dict[str, list[dict[str, Any]]] = {}
    for collection in collection_names:
        values = document.get(collection, [])
        if not isinstance(values, list):
            _issue(issues, "invalid_collection", f"$.{collection}", "Collection must be a list.")
            collections[collection] = []
            continue
        if any(not isinstance(item, dict) for item in values):
            _issue(issues, "invalid_record", f"$.{collection}", "Every collection entry must be an object.")
        collections[collection] = [item for item in values if isinstance(item, dict)]

    id_fields = {
        "animals": "id", "claims": "id", "relationships": "id", "events": "id",
        "institutions": "id", "media": "media_id", "sources": "id",
    }
    records_by_id: dict[str, dict[str, Any]] = {}
    for collection, field in id_fields.items():
        seen: set[str] = set()
        for index, record in enumerate(collections[collection]):
            record_id = record.get(field)
            path = f"$.{collection}[{index}].{field}"
            if not _is_nonempty_string(record_id):
                _issue(issues, "invalid_id", path, "Record ID must be non-empty text.")
                continue
            if record_id in seen:
                _issue(issues, "duplicate_id", path, f"Duplicate ID {record_id!r} in {collection}.")
            seen.add(record_id)
            if record_id in records_by_id:
                _issue(issues, "duplicate_internal_id", path, f"ID {record_id!r} is reused across collections.")
            records_by_id[record_id] = record

    animals = {record.get("id"): record for record in collections["animals"] if _is_nonempty_string(record.get("id"))}
    source_ids = {record.get("id") for record in collections["sources"] if _is_nonempty_string(record.get("id"))}
    institution_ids = {record.get("id") for record in collections["institutions"] if _is_nonempty_string(record.get("id"))}

    external_ids: dict[tuple[str, str], str] = {}
    for index, animal in enumerate(collections["animals"]):
        path = f"$.animals[{index}]"
        if not _is_nonempty_string(animal.get("taxon")):
            _issue(issues, "invalid_animal", f"{path}.taxon", "Animal taxon must be non-empty text.")
        if animal.get("sex") not in {"female", "male", "intersex", "unknown"}:
            _issue(issues, "invalid_animal", f"{path}.sex", "Animal sex must preserve known or unknown status.")
        if animal.get("status") not in {"living", "deceased", "unknown"}:
            _issue(issues, "invalid_animal", f"{path}.status", "Animal status must be living, deceased, or unknown.")
        name = animal.get("name")
        if not isinstance(name, dict) or not _is_nonempty_string(name.get("canonical")) or not _is_nonempty_string(name.get("language")):
            _issue(issues, "invalid_name", f"{path}.name", "Animal needs a canonical source-language name.")
        else:
            _check_source_refs(name, f"{path}.name", source_ids, issues)
            for offset, localized in enumerate(name.get("localized", [])):
                if not isinstance(localized, dict):
                    _issue(issues, "invalid_name", f"{path}.name.localized[{offset}]", "Localized names must be objects.")
                else:
                    _check_source_refs(localized, f"{path}.name.localized[{offset}]", source_ids, issues)
        _check_review(animal.get("review"), f"{path}.review", issues)
        for offset, alias in enumerate(animal.get("aliases", [])):
            if not isinstance(alias, dict) or not _is_nonempty_string(alias.get("value")) or not _is_nonempty_string(alias.get("language")):
                _issue(issues, "invalid_alias", f"{path}.aliases[{offset}]", "Alias needs a value and source language.")
            else:
                _check_source_refs(alias, f"{path}.aliases[{offset}]", source_ids, issues)
        for offset, external in enumerate(animal.get("external_ids", [])):
            if not isinstance(external, dict):
                _issue(issues, "invalid_external_id", f"{path}.external_ids[{offset}]", "External identifier must be an object.")
                continue
            namespace, value = external.get("namespace"), external.get("value")
            if not _is_nonempty_string(namespace) or not _is_nonempty_string(value):
                _issue(issues, "invalid_external_id", f"{path}.external_ids[{offset}]", "External identifier needs namespace and value.")
                continue
            key = (namespace, value)
            if key in external_ids:
                _issue(issues, "duplicate_external_id", f"{path}.external_ids[{offset}]", f"{namespace}:{value} is already assigned to {external_ids[key]}.")
            else:
                external_ids[key] = str(animal.get("id"))

    ancestry: dict[str, list[str]] = {}
    for index, claim in enumerate(collections["claims"]):
        path = f"$.claims[{index}]"
        subject = claim.get("subject")
        if subject not in animals:
            _issue(issues, "dangling_animal", f"{path}.subject", f"Animal {subject!r} does not exist.")
        if not _is_nonempty_string(claim.get("claim_type")):
            _issue(issues, "invalid_claim", f"{path}.claim_type", "Claim type must be non-empty text.")
        if claim.get("status") not in STATUSES:
            _issue(issues, "invalid_claim_status", f"{path}.status", "Claim status must preserve confidence or uncertainty.")
        _check_source_refs(claim, path, source_ids, issues)
        _check_review(claim.get("review"), f"{path}.review", issues)

    for index, relation in enumerate(collections["relationships"]):
        path = f"$.relationships[{index}]"
        subject, obj = relation.get("subject"), relation.get("object")
        if subject not in animals:
            _issue(issues, "dangling_animal", f"{path}.subject", f"Animal {subject!r} does not exist.")
        if obj not in animals:
            _issue(issues, "dangling_animal", f"{path}.object", f"Animal {obj!r} does not exist.")
        if subject == obj and subject in animals:
            _issue(issues, "self_ancestry", path, "An animal cannot have a relationship to itself.")
        if relation.get("type") not in RELATION_TYPES:
            _issue(issues, "invalid_relationship_type", f"{path}.type", "Relationship type is not supported.")
        if relation.get("status") not in STATUSES:
            _issue(issues, "invalid_relationship_status", f"{path}.status", "Relationship status must preserve confidence or uncertainty.")
        _check_source_refs(relation, path, source_ids, issues)
        _check_review(relation.get("review"), f"{path}.review", issues)
        if relation.get("type") in ANCESTRY_TYPES and subject in animals and obj in animals and subject != obj:
            ancestry.setdefault(str(subject), []).append(str(obj))

    def visit(animal_id: str, visiting: set[str], visited: set[str]) -> None:
        if animal_id in visiting:
            _issue(issues, "ancestry_cycle", "$.relationships", f"Biological ancestry cycle includes {animal_id!r}.")
            return
        if animal_id in visited:
            return
        visiting.add(animal_id)
        for child_id in ancestry.get(animal_id, []):
            visit(child_id, visiting, visited)
        visiting.remove(animal_id)
        visited.add(animal_id)

    visited: set[str] = set()
    for animal_id in ancestry:
        visit(animal_id, set(), visited)

    for index, event in enumerate(collections["events"]):
        path = f"$.events[{index}]"
        animal_id = event.get("animal_id")
        if animal_id is None:
            related = event.get("related_animal_ids")
            if not isinstance(related, list) or not related:
                _issue(issues, "missing_event_subject", f"{path}.related_animal_ids", "An event without an identified animal must link to at least one known related animal.")
        elif animal_id not in animals:
            _issue(issues, "dangling_animal", f"{path}.animal_id", f"Animal {animal_id!r} does not exist.")
        related_ids = event.get("related_animal_ids", [])
        if not isinstance(related_ids, list):
            _issue(issues, "invalid_event_subjects", f"{path}.related_animal_ids", "Related animal IDs must be a list.")
            related_ids = []
        for offset, related_id in enumerate(related_ids):
            if related_id not in animals:
                _issue(issues, "dangling_animal", f"{path}.related_animal_ids[{offset}]", f"Animal {related_id!r} does not exist.")
        outcome_count = event.get("outcome_count")
        if outcome_count is not None and (not isinstance(outcome_count, int) or isinstance(outcome_count, bool) or outcome_count < 1):
            _issue(issues, "invalid_outcome_count", f"{path}.outcome_count", "Outcome count must be a positive integer.")
        if event.get("type") not in EVENT_TYPES:
            _issue(issues, "invalid_event_type", f"{path}.type", "Event type is not supported.")
        _check_date_value(event.get("date"), f"{path}.date", issues)
        for field in ("institution_id", "from_institution_id", "to_institution_id"):
            institution_id = event.get(field)
            if institution_id is not None and institution_id not in institution_ids:
                _issue(issues, "dangling_institution", f"{path}.{field}", f"Institution {institution_id!r} does not exist.")
        _check_source_refs(event, path, source_ids, issues)

    for index, media in enumerate(collections["media"]):
        path = f"$.media[{index}]"
        if media.get("animal_id") not in animals:
            _issue(issues, "dangling_animal", f"{path}.animal_id", f"Animal {media.get('animal_id')!r} does not exist.")
        if not _check_uri(media.get("source_page_url")):
            _issue(issues, "invalid_media_source", f"{path}.source_page_url", "Media source must be an HTTP(S) source page URL.")
        if media.get("direct_remote_url") is not None and not _check_uri(media.get("direct_remote_url")):
            _issue(issues, "invalid_direct_media_url", f"{path}.direct_remote_url", "Direct media metadata must be an HTTP(S) URL.")
        if media.get("embedding_status") == "allowed" and str(media.get("rights_status", "")).lower() not in EMBEDDABLE_RIGHTS:
            _issue(issues, "unlicensed_embedding", f"{path}.embedding_status", "Embedding is allowed only when the recorded rights status explicitly permits it.")
        if media.get("embedding_status") not in {"allowed", "link_only", "denied", "unknown"}:
            _issue(issues, "invalid_embedding_status", f"{path}.embedding_status", "Embedding status is not supported.")
        if not _valid_date_text(media.get("checked_date"), full_only=True):
            _issue(issues, "invalid_media_date", f"{path}.checked_date", "Media checked date must be a valid YYYY-MM-DD date.")
        _check_source_refs(media, path, source_ids, issues)

    for index, source in enumerate(collections["sources"]):
        path = f"$.sources[{index}]"
        for field in ("title", "publisher", "source_type", "data_use"):
            if not _is_nonempty_string(source.get(field)):
                _issue(issues, "invalid_source", f"{path}.{field}", "Source value must be non-empty text.")
        if not _check_uri(source.get("url")):
            _issue(issues, "invalid_source_url", f"{path}.url", "Source URL must use HTTP or HTTPS.")
        if not _valid_date_text(source.get("accessed_date"), full_only=True):
            _issue(issues, "invalid_source_date", f"{path}.accessed_date", "Source access date must be a valid YYYY-MM-DD date.")
        publication_date = source.get("publication_date")
        if publication_date is not None and not _valid_date_text(publication_date):
            _issue(issues, "invalid_source_date", f"{path}.publication_date", "Publication date must preserve a valid full or partial date.")

    return sorted(issues, key=lambda issue: (issue.path, issue.code, issue.message))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("atlas", type=Path, help="canonical atlas JSON document")
    args = parser.parse_args(argv)
    try:
        document = json.loads(args.atlas.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"ERROR {args.atlas}: {error}", file=sys.stderr)
        return 2
    issues = validate_atlas(document)
    for issue in issues:
        print(f"{issue.code}: {issue.path}: {issue.message}")
    if issues:
        print(f"Validation failed: {len(issues)} issue(s).", file=sys.stderr)
        return 1
    print(f"Valid atlas: {args.atlas}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
