# Phase 3 Release Record

Status: **in progress; no Phase 3 production release**

## Baseline

- Feature branch baseline: `daf7d2931a1560b5d25721eb6b90dd35c66da6bf`.
- Production remains Phase 2 commit `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a` at `/var/www/html/_animal-lineage-releases/133f7a5324a4095aeb922f77c4dce3e4c2a50b5a`.
- Baseline live HTTP checks on 2026-10-20: all four Atlas paths and legacy `/red-panda/` returned 200. No production changes were made.
- Baseline counts: red panda 1,554 animals / 2,394 relationships; polar bear 64 / 58; hippopotamus 85 / 78 (60 common, 25 pygmy).
- Baseline checks: 45 Node tests, 79 Python tests, 10/10 serial browser tests, lint, typecheck, data/schema validation, build, and no-photo scan passed.
- Current rollout rollback target is the Phase 2 manifest's recorded prior release `ad24b3bb51c08242c731189040d15241d56ab3b4`.

## Pre-deployment production snapshot

Read-only checks on 2026-10-20, before any Phase 3 production change:

- Nginx on `127.0.0.1` returned HTTP 200 for `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, `/atlas.hippopotamus/`, and legacy `/red-panda/`.
- All four Atlas symlinks resolved to `/var/www/html/_animal-lineage-releases/133f7a5324a4095aeb922f77c4dce3e4c2a50b5a/`. The Phase 2 manifest records all four prior targets under release `ad24b3bb51c08242c731189040d15241d56ab3b4`.
- Legacy `/var/www/html/red-panda/` is a standalone directory with 505 files, 32 directories, 136,957,949 file bytes, and no symlinks. Its deterministic tree SHA-256 is `a32ae67433de89bca8067743dbb28581e9a4053965c96b46032a84720664fdf3`. The per-path, per-file digest manifest is saved at `/tmp/animal-lineage-atlas-phase3-legacy-red-panda-baseline.json` for an exact post-deploy comparison.

## Phase 3 results

Current canonical data on the feature branch:

| Atlas | Animals | Relationships |
|---|---:|---:|
| Red panda | 1554 animals | 2394 relationships |
| Polar bear | 72 animals | 63 relationships |
| Hippopotamus | 96 animals | 86 relationships |

The Phase 2 record in [Expanded dataset release](RELEASE_V2_EXPANDED_DATASETS.md) remains the historical release record. Added polar-bear and hippo records are source linked; no animal-photo assets or unlicensed embeds were added. The [red-panda source review](RED_PANDA_PHASE3_SOURCE_REVIEW.md) records 2025–2026 official zoo candidates that were not imported because existing namesakes could not be crosswalked safely. Local verification includes 54 Node tests, 82 Python tests, 15 serial browser tests, and passing lint/typecheck/data/schema/build/no-photo checks. The latest browser run uses desktop 1440×900 and mobile 390×844; Futa mobile, low-zoom selection, country flags, and overview label spacing are covered.

The shared global graph and focus layout, family/country grouping, direct profile links, generation rows, pan/zoom, lazy detail chunks, and facet filtering are implemented in the feature branch. Relationship type color and confidence dash patterns now render as independent channels in both the canvas overview and focused SVG. Local data review and verification are complete for this pass. Branch CI for the latest correction, independent PR re-review, production deployment, browser smoke checks against production, and final rollback instructions are pending. Do not treat research-prototype results as Atlas release checks.

## Release verification

| Check | Status | Evidence |
|---|---|---|
| Shared all-animal generation graph | Verified locally | 54 Node tests and 15/15 serial browser tests pass; global counts include all nodes/relationships. |
| Focus depth and relation semantics | Verified locally | Exact Futa all-generation component and focused ancestors/descendants match canonical IDs/edges; all 20 type/confidence style combinations and focused SVG edges pass. |
| Cross-species data integrity and provenance | Verified locally | 82 Python tests, canonical data/schema validators, and all-species browser checks pass. |
| Desktop and mobile browser QA | Verified locally | Playwright 15/15 at 1440×900 and 390×844, including a readable focused Futa mobile view, data-backed SVG flags, and low-zoom mobile node selection; screenshots under `/tmp/animal-lineage-atlas-qa/`. |
| Large-graph performance and memory | Verified locally | [Machine-readable report](PERFORMANCE_REPORT_PHASE3.json), pinned to clean source revision `ba9a3f0`: RP full graph layout p95 153.1 ms; largest 823-animal component p95 122.5 ms; Chromium first render 229.3 ms; search p95 9.9 ms; measured browser heap 13.4 MB. |
| No-photo source and built release scan | Verified locally | Source and `dist/` scans passed. |
| CI green and reviewed PR merged to main | Pending | |
| Four production routes and representative profiles | Pending | |
| Legacy `/red-panda/` unchanged and healthy | Pending | |
| Rollback manifest and prior release retained | Pending | |
