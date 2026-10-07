#!/usr/bin/env python3
"""Measure static release bytes and representative search/layout timings."""

from __future__ import annotations

import argparse
import json
import platform
import subprocess
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
ATLAS_IDS = ("red-panda", "polar-bear", "hippopotamus")
RELEASE_PATHS = ("atlas", "atlas.red-panda", "atlas.polar-bear", "atlas.hippopotamus")

ENGINE_BENCHMARK = r"""
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { buildAtlasSearchIndex } from './packages/search/atlas-index.ts';
import { searchAnimals } from './packages/search/search.ts';
import { buildGenealogy } from './packages/genealogy/layout.ts';

const atlas = JSON.parse(await readFile(process.argv[1], 'utf8'));
const index = buildAtlasSearchIndex(atlas);
const graphAnimals = index.map((animal) => ({
  id: animal.id,
  name: { canonical: animal.name.canonical },
  country_code: animal.country_code,
}));
const graphRelationships = atlas.relationships.map((relationship) => ({
  id: relationship.id,
  subject: relationship.subject,
  object: relationship.object,
  type: relationship.type,
  status: relationship.status,
  source_ids: relationship.source_ids,
}));
const queryCases = [
  atlas.animals[0]?.name?.canonical ?? '',
  atlas.animals[0]?.id ?? '',
  atlas.coverage?.taxon ?? '',
].filter(Boolean);
const focusCases = [
  atlas.animals[0]?.id,
  atlas.animals[Math.floor(atlas.animals.length / 2)]?.id,
  atlas.animals.at(-1)?.id,
].filter(Boolean);

function summarize(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (p) => ordered[Math.min(ordered.length - 1, Math.ceil(p * ordered.length) - 1)];
  return {
    samples: values.length,
    median_ms: Number(percentile(0.5).toFixed(3)),
    p95_ms: Number(percentile(0.95).toFixed(3)),
    mean_ms: Number((statisticsMean(values)).toFixed(3)),
  };
}
function statisticsMean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}
function timeCall(fn) {
  const start = performance.now();
  const result = fn();
  return { result, elapsed: performance.now() - start };
}

for (const query of queryCases) searchAnimals(index, query);
const searchSamples = [];
const searchResults = queryCases.map((query) => ({ query, matches: searchAnimals(index, query).length }));
for (let run = 0; run < 60; run += 1) {
  const query = queryCases[run % queryCases.length];
  searchSamples.push(timeCall(() => searchAnimals(index, query)).elapsed);
}

const layoutSamples = [];
let representativeGraph;
for (let run = 0; run < 30; run += 1) {
  const focusId = focusCases[run % focusCases.length];
  const measured = timeCall(() => buildGenealogy(graphAnimals, graphRelationships, focusId, { depth: 3, maxNodes: 180 }));
  layoutSamples.push(measured.elapsed);
  if (!representativeGraph) representativeGraph = measured.result;
}

process.stdout.write(JSON.stringify({
  search: { ...summarize(searchSamples), query_cases: searchResults },
  genealogy_layout: {
    ...summarize(layoutSamples),
    representative_nodes: representativeGraph?.nodes.length ?? 0,
    representative_edges: representativeGraph?.edges.length ?? 0,
    representative_truncated: representativeGraph?.truncated ?? false,
  },
}));
"""


def asset_sizes(release_root: Path) -> dict:
    applications = {}
    total_bytes = 0
    for path_name in RELEASE_PATHS:
        app_dir = release_root / path_name
        if not app_dir.is_dir():
            raise ValueError(f"Missing built release path: {app_dir}")
        files = {file.name: file.stat().st_size for file in sorted(app_dir.iterdir()) if file.is_file()}
        total = sum(files.values())
        total_bytes += total
        applications[path_name] = {
            "files_bytes": files,
            "bundle_bytes": files.get("main.js", 0) + files.get("styles.css", 0),
            "data_payload_bytes": files.get("runtime.json", files.get("catalog.json", 0)),
            "total_bytes": total,
        }
    return {"applications": applications, "total_bytes": total_bytes}


def engine_timings() -> dict:
    results = {}
    for atlas_id in ATLAS_IDS:
        source = REPO_ROOT / "atlases" / atlas_id / "atlas.json"
        completed = subprocess.run(
            ["node", "--import", "tsx", "--input-type=module", "-e", ENGINE_BENCHMARK, str(source)],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        results[atlas_id] = json.loads(completed.stdout)
    return results


def browser_evidence() -> dict:
    report_path = Path("/tmp/animal-lineage-atlas-qa/playwright-report.json")
    summary = {
        "runner": "Playwright Chromium",
        "viewports_css_pixels": ["1440x1000 desktop", "390x844 mobile"],
        "external_image_policy": "External image requests are blocked; one permitted test image is deliberately failed to verify fallback.",
        "screenshots_directory": "/tmp/animal-lineage-atlas-qa/",
    }
    if report_path.is_file():
        browser_report = json.loads(report_path.read_text(encoding="utf-8"))
        stats = browser_report.get("stats", {})
        summary["tests"] = {
            "passed": stats.get("expected", 0),
            "failed": stats.get("unexpected", 0),
            "flaky": stats.get("flaky", 0),
            "skipped": stats.get("skipped", 0),
            "duration_ms": stats.get("duration", 0),
        }
    screenshot_dir = Path("/tmp/animal-lineage-atlas-qa")
    summary["screenshots"] = {
        path.name: path.stat().st_size
        for path in sorted(screenshot_dir.glob("*.png"))
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("release", type=Path, help="Built release root, usually dist/")
    parser.add_argument("--out", type=Path, help="Write the JSON report to this path")
    args = parser.parse_args()
    release_root = args.release.resolve()
    if not release_root.is_dir():
        parser.error(f"Release directory does not exist: {release_root}")

    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=REPO_ROOT, check=True, capture_output=True, text=True
    ).stdout.strip()
    try:
        release_label = release_root.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        release_label = release_root.as_posix()
    status = subprocess.run(
        ["git", "status", "--porcelain=v1", "--untracked-files=all"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.splitlines()
    source_changes = [line[3:] for line in status if line[3:] != "docs/QA_REPORT.json"]
    report = {
        "schema_version": "1.0.0",
        "measured_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repository": "vvyatkin-afk/Animal-Lineage-Atlas",
        "source_revision": revision,
        "source_worktree_dirty_excluding_report": bool(source_changes),
        "release_root": release_label,
        "runtime": {"python": platform.python_version(), "node": subprocess.run(
            ["node", "--version"], check=True, capture_output=True, text=True
        ).stdout.strip()},
        "release_sizes": asset_sizes(release_root),
        "engine_timings": engine_timings(),
        "browser_validation": browser_evidence(),
    }
    encoded = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        destination = args.out.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(encoded, encoding="utf-8")
    print(encoded, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
