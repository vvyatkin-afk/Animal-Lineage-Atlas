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
import { buildFocusedGenealogy, createGenealogyIndex } from './packages/genealogy/layout.ts';

const atlas = JSON.parse(await readFile(process.argv[1], 'utf8'));
if (globalThis.gc) globalThis.gc();
const heapBeforeIndexes = process.memoryUsage().heapUsed;
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
const graphIndex = createGenealogyIndex(graphAnimals, graphRelationships);
if (globalThis.gc) globalThis.gc();
const derivedIndexHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBeforeIndexes);
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
for (let run = 0; run < 120; run += 1) {
  const query = queryCases[run % queryCases.length];
  searchSamples.push(timeCall(() => searchAnimals(index, query)).elapsed);
}

const layoutSamples = [];
let representativeGraph;
for (let run = 0; run < 30; run += 1) {
  const focusId = focusCases[run % focusCases.length];
  const measured = timeCall(() => buildFocusedGenealogy(graphIndex, focusId, { depth: 3, maxNodes: 180 }));
  layoutSamples.push(measured.elapsed);
  if (!representativeGraph) representativeGraph = measured.result;
}

process.stdout.write(JSON.stringify({
  record_count: atlas.animals.length,
  relationship_count: atlas.relationships.length,
  component_count: graphIndex.components.length,
  largest_component_size: graphIndex.components.reduce((largest, component) => Math.max(largest, component.animalIds.length), 0),
  derived_index_heap_bytes: derivedIndexHeapBytes,
  search: { ...summarize(searchSamples), query_cases: searchResults },
  genealogy_layout: {
    ...summarize(layoutSamples),
    representative_nodes: representativeGraph?.nodes.length ?? 0,
    representative_edges: representativeGraph?.edges.length ?? 0,
    representative_truncated: representativeGraph?.truncated ?? false,
  },
}));
"""

SCALE_BENCHMARK = r"""
import { performance } from 'node:perf_hooks';
import { buildAtlasSearchIndex } from './packages/search/atlas-index.ts';
import { searchAnimals } from './packages/search/search.ts';
import { buildFocusedGenealogy, createGenealogyIndex } from './packages/genealogy/layout.ts';

const animalCount = 5000;
const animals = Array.from({ length: animalCount }, (_, index) => ({
  id: `synthetic:${String(index + 1).padStart(5, '0')}`,
  taxon: 'Synthetic taxon',
  population: index % 2 ? 'wild' : 'zoo_captive',
  name: { canonical: `Synthetic animal ${String(index + 1).padStart(5, '0')}`, localized: [] },
  aliases: [{ value: `Test alias ${index + 1}` }],
  external_ids: [{ namespace: 'scale-fixture', value: `ID-${String(index + 1).padStart(5, '0')}` }],
}));
const relationships = [];
const componentSize = 20;
for (let start = 0; start < animalCount; start += componentSize) {
  const end = Math.min(start + componentSize, animalCount);
  for (let index = start + 1; index < end; index += 1) {
    relationships.push({
      id: `synthetic:edge-${index}`,
      subject: animals[index - 1].id,
      object: animals[index].id,
      type: index % 2 ? 'biological_mother' : 'biological_father',
      status: 'confirmed',
    });
  }
}
if (globalThis.gc) globalThis.gc();
const heapBeforeIndexes = process.memoryUsage().heapUsed;
const indexBuildStart = performance.now();
const searchIndex = buildAtlasSearchIndex({ animals, events: [], institutions: [] });
const searchIndexBuildMs = performance.now() - indexBuildStart;
const graphAnimals = searchIndex.map((animal) => ({
  id: animal.id,
  name: { canonical: animal.name.canonical },
  country_code: animal.country_code,
}));
const graphIndexStart = performance.now();
const graphIndex = createGenealogyIndex(graphAnimals, relationships);
const graphIndexBuildMs = performance.now() - graphIndexStart;
if (globalThis.gc) globalThis.gc();
const derivedIndexHeapBytes = Math.max(0, process.memoryUsage().heapUsed - heapBeforeIndexes);
const queryCases = ['synthetic:04999', 'synthetic animal 04', 'Synthetic taxon'];
const searchSamples = [];
for (let warmup = 0; warmup < 20; warmup += 1) searchAnimals(searchIndex, queryCases[warmup % queryCases.length]);
for (let run = 0; run < 150; run += 1) {
  const start = performance.now();
  searchAnimals(searchIndex, queryCases[run % queryCases.length], { population: run % 2 ? 'wild' : '' });
  searchSamples.push(performance.now() - start);
}
const focusId = animals[1234].id;
for (let warmup = 0; warmup < 10; warmup += 1) buildFocusedGenealogy(graphIndex, focusId, { depth: 3, maxNodes: 180 });
const layoutSamples = [];
let focusedGraph;
for (let run = 0; run < 60; run += 1) {
  const start = performance.now();
  const graph = buildFocusedGenealogy(graphIndex, focusId, { depth: 3, maxNodes: 180 });
  layoutSamples.push(performance.now() - start);
  focusedGraph ??= graph;
}
function summarize(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = (p) => ordered[Math.min(ordered.length - 1, Math.ceil(p * ordered.length) - 1)];
  return {
    samples: values.length,
    median_ms: Number(percentile(0.5).toFixed(3)),
    p95_ms: Number(percentile(0.95).toFixed(3)),
  };
}
process.stdout.write(JSON.stringify({
  fixture: 'synthetic, deterministic 5,000-animal pedigree; 250 disconnected linear components of up to 20 animals',
  animal_count: animalCount,
  relationship_count: relationships.length,
  component_count: graphIndex.components.length,
  derived_index_heap_bytes: derivedIndexHeapBytes,
  search_index_build_ms: Number(searchIndexBuildMs.toFixed(3)),
  graph_index_build_ms: Number(graphIndexBuildMs.toFixed(3)),
  search: { ...summarize(searchSamples), query_cases: queryCases.map((query) => ({ query, matches: searchAnimals(searchIndex, query).length })) },
  focused_graph: { ...summarize(layoutSamples), nodes: focusedGraph.nodes.length, edges: focusedGraph.edges.length, truncated: focusedGraph.truncated },
}));
"""


def asset_sizes(release_root: Path) -> dict:
    applications = {}
    total_bytes = 0
    for path_name in RELEASE_PATHS:
        app_dir = release_root / path_name
        if not app_dir.is_dir():
            raise ValueError(f"Missing built release path: {app_dir}")
        files = {file.relative_to(app_dir).as_posix(): file.stat().st_size for file in sorted(app_dir.rglob("*")) if file.is_file()}
        total = sum(files.values())
        detail_chunks = {name: size for name, size in files.items() if name.startswith("details/") and name.endswith(".json")}
        sorted_chunk_sizes = sorted(detail_chunks.values())
        middle = len(sorted_chunk_sizes) // 2
        median_chunk_bytes = (
            (sorted_chunk_sizes[middle - 1] + sorted_chunk_sizes[middle]) // 2
            if len(sorted_chunk_sizes) > 1 and len(sorted_chunk_sizes) % 2 == 0
            else sorted_chunk_sizes[middle] if sorted_chunk_sizes else 0
        )
        runtime_bytes = files.get("runtime.json", 0)
        data_bytes = runtime_bytes or files.get("catalog.json", 0)
        manifest_bytes = files.get("local-media-manifest.json", 0)
        total_bytes += total
        applications[path_name] = {
            "files_bytes": files,
            "bundle_bytes": files.get("main.js", 0) + files.get("styles.css", 0),
            "data_payload_bytes": data_bytes,
            "initial_data_payload_bytes": data_bytes + manifest_bytes,
            "detail_payloads": {
                "chunk_count": len(detail_chunks),
                "total_bytes": sum(detail_chunks.values()),
                "largest_chunk_bytes": max(detail_chunks.values(), default=0),
                "median_chunk_bytes": median_chunk_bytes,
            },
            "complete_data_payload_bytes": data_bytes + manifest_bytes + sum(detail_chunks.values()),
            "total_bytes": total,
        }
    return {"applications": applications, "total_bytes": total_bytes}


def engine_timings() -> dict:
    results = {}
    for atlas_id in ATLAS_IDS:
        source = REPO_ROOT / "atlases" / atlas_id / "atlas.json"
        completed = subprocess.run(
            ["node", "--expose-gc", "--import", "tsx", "--input-type=module", "-e", ENGINE_BENCHMARK, str(source)],
            cwd=REPO_ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        results[atlas_id] = json.loads(completed.stdout)
    return results


def synthetic_scale_timing() -> dict:
    completed = subprocess.run(
        ["node", "--expose-gc", "--import", "tsx", "--input-type=module", "-e", SCALE_BENCHMARK],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


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


def browser_performance_evidence() -> dict:
    report_path = Path("/tmp/animal-lineage-atlas-qa/performance-report.json")
    if not report_path.is_file():
        return {"status": "not measured", "run": "npm run test:browser"}
    return json.loads(report_path.read_text(encoding="utf-8"))


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
    report_paths = {"docs/QA_REPORT.json", "docs/PERFORMANCE_REPORT_PHASE2.json"}
    source_changes = [line[3:] for line in status if line[3:] not in report_paths]
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
        "measurement_method": {
            "source_data": "Exact canonical atlases checked in at measurement time.",
            "engine_runner": "Node.js with --expose-gc; 120 search timing samples and 30 focused graph samples per atlas, after index construction.",
            "synthetic_scale_fixture": "Deterministic 5,000-record fixture with 250 disconnected components; kept separate from source-backed corpus numbers.",
            "browser_method": "Playwright Chromium local static release at 1440x1000 and 390x844 CSS pixel viewports; browser heap is reported only when Chromium exposes performance.memory.",
            "render_timing_scope": "Synchronous focused SVG DOM construction/attachment; excludes the following paint/composite frame.",
            "memory_limitations": "Node heap delta is an approximate derived-index cost after garbage collection; browser heap availability varies by Chromium build and is not a whole-device memory measure.",
        },
        "release_sizes": asset_sizes(release_root),
        "engine_timings": engine_timings(),
        "synthetic_scale": synthetic_scale_timing(),
        "browser_validation": browser_evidence(),
        "browser_performance": browser_performance_evidence(),
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
