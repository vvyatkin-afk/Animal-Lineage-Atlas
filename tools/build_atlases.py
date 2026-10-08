#!/usr/bin/env python3
"""Build four independent static Atlas paths from canonical source files."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
try:
    from .check_no_animal_photos import scan_tree
except ImportError:  # Direct script execution places tools/ on sys.path.
    from check_no_animal_photos import scan_tree


CHILD_PATHS = {
    "red-panda": "/atlas.red-panda/",
    "polar-bear": "/atlas.polar-bear/",
    "hippopotamus": "/atlas.hippopotamus/",
}
OUTPUT_NAMES = ("atlas", "atlas.red-panda", "atlas.polar-bear", "atlas.hippopotamus")
DETAIL_CHUNK_SIZE = 128


def _remove_recreatable_target(path: Path) -> None:
    if path.is_symlink():
        raise RuntimeError(f"Refusing to replace build output symlink: {path}")
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def _write_runtime_index(document: dict, output_dir: Path, chunk_size: int = DETAIL_CHUNK_SIZE) -> None:
    """Write a compact searchable/graph index plus lazily loaded profile chunks."""
    if chunk_size < 1:
        raise ValueError("Detail chunk size must be positive")
    animals = document.get("animals", [])
    institutions = {item["id"]: item for item in document.get("institutions", [])}
    source_by_id = {item["id"]: item for item in document.get("sources", [])}
    events_by_animal: dict[str, list[dict]] = defaultdict(list)
    claims_by_animal: dict[str, list[dict]] = defaultdict(list)
    media_by_animal: dict[str, list[dict]] = defaultdict(list)
    relationships_by_animal: dict[str, dict[str, dict]] = defaultdict(dict)
    for event in document.get("events", []):
        events_by_animal[event["animal_id"]].append(event)
    for claim in document.get("claims", []):
        claims_by_animal[claim["subject"]].append(claim)
    for item in document.get("media", []):
        media_by_animal[item["animal_id"]].append(item)
    for relationship in document.get("relationships", []):
        for animal_id in {relationship.get("subject"), relationship.get("object")} - {None}:
            relationships_by_animal[animal_id][relationship["id"]] = relationship
    country_by_animal: dict[str, str] = {}
    institution_names_by_animal: dict[str, set[str]] = {}

    events = sorted(
        document.get("events", []),
        key=lambda event: event.get("date", {}).get("value")
        or event.get("date", {}).get("end")
        or event.get("date", {}).get("start")
        or "",
    )
    for event in events:
        animal_id = event["animal_id"]
        institution_ids = [
            event.get("from_institution_id"),
            event.get("to_institution_id"),
            event.get("institution_id"),
        ]
        for institution_id in filter(None, institution_ids):
            institution = institutions.get(institution_id)
            if institution:
                names = institution_names_by_animal.setdefault(animal_id, set())
                names.update(name["value"] for name in institution.get("names", []))
        destination_id = event.get("to_institution_id") or event.get("institution_id")
        destination = institutions.get(destination_id or "")
        if destination and destination.get("country_code"):
            country_by_animal[animal_id] = destination["country_code"]

    chunks: list[dict[str, object]] = []
    compact_animals: list[dict[str, object]] = []
    for start in range(0, len(animals), chunk_size):
        chunk_index = start // chunk_size
        chunk_name = f"details/chunk-{chunk_index:04d}.json"
        owner_animals = animals[start : start + chunk_size]
        owner_ids = {animal["id"] for animal in owner_animals}
        owner_id_order = [animal["id"] for animal in owner_animals]
        owner_events = [record for animal_id in owner_id_order for record in events_by_animal.get(animal_id, [])]
        owner_claims = [record for animal_id in owner_id_order for record in claims_by_animal.get(animal_id, [])]
        owner_media = [record for animal_id in owner_id_order for record in media_by_animal.get(animal_id, [])]
        owner_relationships_by_id = {
            relationship_id: relationship
            for animal_id in owner_id_order
            for relationship_id, relationship in relationships_by_animal.get(animal_id, {}).items()
        }

        source_ids: set[str] = set()
        institution_ids: set[str] = set()

        def collect_sources(record: dict) -> None:
            source_ids.update(record.get("source_ids", []))

        for animal in owner_animals:
            collect_sources(animal.get("name", {}))
        for record in (*owner_events, *owner_claims, *owner_media, *owner_relationships_by_id.values()):
            collect_sources(record)
        for event in owner_events:
            institution_ids.update(
                value for value in (
                    event.get("institution_id"), event.get("from_institution_id"), event.get("to_institution_id")
                ) if value
            )

        chunks.append({
            "format": "animal-lineage-atlas-detail-chunk-v1",
            "animals": owner_animals,
            "events": owner_events,
            "claims": owner_claims,
            "media": owner_media,
            "sources": [source_by_id[source_id] for source_id in sorted(source_ids) if source_id in source_by_id],
            "institutions": [institutions[institution_id] for institution_id in sorted(institution_ids) if institution_id in institutions],
        })
        for animal in owner_animals:
            name = animal.get("name", {})
            compact_animals.append({
                "id": animal["id"],
                "taxon": animal["taxon"],
                "name": {
                    "canonical": name.get("canonical", animal["id"]),
                    **({"localized": name["localized"]} if name.get("localized") else {}),
                },
                **({"aliases": animal["aliases"]} if animal.get("aliases") else {}),
                **({"external_ids": animal["external_ids"]} if animal.get("external_ids") else {}),
                **({"population": animal["population"]} if animal.get("population") else {}),
                "country_code": country_by_animal.get(animal["id"]),
                "institution_names": sorted(institution_names_by_animal.get(animal["id"], set())),
                "detail_chunk": chunk_name,
            })

    details_dir = output_dir / "details"
    details_dir.mkdir()
    for index, chunk in enumerate(chunks):
        (details_dir / f"chunk-{index:04d}.json").write_text(
            json.dumps(chunk, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )

    runtime_index = {
        "format": "animal-lineage-atlas-runtime-index-v1",
        "release": document.get("release", {}),
        "coverage": document.get("coverage", {}),
        "animals": compact_animals,
        "relationships": [
            {
                "id": relationship["id"],
                "subject": relationship["subject"],
                "object": relationship["object"],
                "type": relationship["type"],
                "status": relationship["status"],
                **({"source_ids": relationship["source_ids"]} if relationship.get("source_ids") else {}),
            }
            for relationship in document.get("relationships", [])
        ],
    }
    (output_dir / "runtime.json").write_text(
        json.dumps(runtime_index, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def build_atlases(output_root: Path) -> list[Path]:
    output_root = Path(output_root).expanduser()
    if output_root.is_symlink():
        raise RuntimeError(f"Refusing to use symlink build root: {output_root}")
    output_root = output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    for name in OUTPUT_NAMES:
        _remove_recreatable_target(output_root / name)

    esbuild_config = REPO_ROOT / "esbuild.config.mjs"
    if not esbuild_config.exists() or not (REPO_ROOT / "node_modules" / "esbuild").exists():
        raise RuntimeError("Dependencies are not installed; run npm ci first.")
    built_paths: list[Path] = []

    hub_dir = output_root / "atlas"
    hub_dir.mkdir()
    shutil.copy2(REPO_ROOT / "apps" / "hub" / "index.html", hub_dir / "index.html")
    shutil.copy2(REPO_ROOT / "apps" / "hub" / "styles.css", hub_dir / "styles.css")
    subprocess.run(
        ["node", str(esbuild_config), str(REPO_ROOT / "apps" / "hub" / "main.ts"), str(hub_dir / "main.js")],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    subprocess.run(
        ["node", "--import", "tsx", str(REPO_ROOT / "tools" / "build_catalog.mjs"), str(hub_dir / "catalog.json")],
        cwd=REPO_ROOT,
        check=True,
    )
    built_paths.append(hub_dir)

    for species, base_path in CHILD_PATHS.items():
        output_dir = output_root / f"atlas.{species}"
        output_dir.mkdir()
        template = (REPO_ROOT / "apps" / "atlas" / "index.html").read_text(encoding="utf-8")
        template = re.sub(r'data-atlas="[^"]+"', f'data-atlas="{species}"', template, count=1)
        template = re.sub(r'data-base-path="[^"]+"', f'data-base-path="{base_path}"', template, count=1)
        (output_dir / "index.html").write_text(template, encoding="utf-8")
        shutil.copy2(REPO_ROOT / "apps" / "atlas" / "styles.css", output_dir / "styles.css")
        subprocess.run(
            ["node", str(esbuild_config), str(REPO_ROOT / "apps" / "atlas" / "main.ts"), str(output_dir / "main.js")],
            cwd=REPO_ROOT,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        source_document = json.loads((REPO_ROOT / "atlases" / species / "atlas.json").read_text(encoding="utf-8"))
        _write_runtime_index(source_document, output_dir)
        (output_dir / "local-media-manifest.json").write_text(
            json.dumps({"format": "animal-lineage-atlas-local-media-manifest-v1", "items": []}, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        built_paths.append(output_dir)

    findings = scan_tree(output_root)
    if findings:
        raise RuntimeError("Built release failed the no-photo check:\n" + "\n".join(findings))
    return built_paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "dist", help="Output directory (default: repository dist/)")
    args = parser.parse_args()
    try:
        paths = build_atlases(args.out)
    except (OSError, ValueError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return 1
    for path in paths:
        print(f"Built {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
