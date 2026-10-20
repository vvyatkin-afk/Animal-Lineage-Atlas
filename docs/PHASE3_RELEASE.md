# Phase 3 Release Record

Status: **released to production on 2026-10-20**

## Baseline

- Feature branch baseline: `daf7d2931a1560b5d25721eb6b90dd35c66da6bf`.
- At Phase 3 start, production was on Phase 2 commit `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a` at `/var/www/html/_animal-lineage-releases/133f7a5324a4095aeb922f77c4dce3e4c2a50b5a`.
- Baseline live HTTP checks on 2026-10-20: all four Atlas paths and legacy `/red-panda/` returned 200. No production changes were made.
- Baseline counts: red panda 1,554 animals / 2,394 relationships; polar bear 64 / 58; hippopotamus 85 / 78 (60 common, 25 pygmy).
- Baseline checks: 45 Node tests, 79 Python tests, 10/10 serial browser tests, lint, typecheck, data/schema validation, build, and no-photo scan passed.
- At Phase 3 start, the Phase 2 manifest recorded the older prior release `ad24b3bb51c08242c731189040d15241d56ab3b4`. The Phase 3 deployment manifest now records Phase 2 release `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a` as the immediate rollback target for each Atlas link.

## Pre-deployment production snapshot

Read-only checks on 2026-10-20, before any Phase 3 production change:

- Nginx on `127.0.0.1` returned HTTP 200 for `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, `/atlas.hippopotamus/`, and legacy `/red-panda/`.
- All four Atlas symlinks resolved to `/var/www/html/_animal-lineage-releases/133f7a5324a4095aeb922f77c4dce3e4c2a50b5a/`. The Phase 2 manifest records all four prior targets under release `ad24b3bb51c08242c731189040d15241d56ab3b4`.
- Legacy `/var/www/html/red-panda/` is a standalone directory with 505 files, 32 directories, 136,957,949 file bytes, and no symlinks. Its deterministic tree SHA-256 is `a32ae67433de89bca8067743dbb28581e9a4053965c96b46032a84720664fdf3`. The per-path, per-file digest manifest is saved at `/tmp/animal-lineage-atlas-phase3-legacy-red-panda-baseline.json` for an exact post-deploy comparison.

## Phase 3 results

Current canonical data in the merged and deployed Phase 3 release:

| Atlas | Animals | Relationships |
|---|---:|---:|
| Red panda | 1554 animals | 2394 relationships |
| Polar bear | 72 animals | 63 relationships |
| Hippopotamus | 96 animals | 86 relationships |

The Phase 2 record in [Expanded dataset release](RELEASE_V2_EXPANDED_DATASETS.md) remains the historical baseline, with the Phase 3 deployment recorded below it. Added polar-bear and hippo records are source linked; no animal-photo assets or unlicensed embeds were added. The [red-panda source review](RED_PANDA_PHASE3_SOURCE_REVIEW.md) records 2025–2026 official zoo candidates that were not imported because existing namesakes could not be crosswalked safely. Local and CI verification includes 54 Node tests, 82 Python tests, 15 serial browser tests, and passing lint/typecheck/data/schema/build/no-photo checks. The browser run uses desktop 1440×900 and mobile 390×844; Futa mobile, low-zoom selection, country flags, and overview label spacing are covered.

The shared global graph and focus layout, family/country grouping, direct profile links, generation rows, pan/zoom, lazy detail chunks, and facet filtering are implemented in the merged release. Relationship type color and confidence dash patterns render as independent channels in both the canvas overview and focused SVG. Independent review of code commit `4cfb024` was clean; PR #6 merged after required CI passed. Production deployment, browser checks, and rollback evidence are complete. Do not treat research-prototype results as Atlas release checks.

## Release verification

| Check | Status | Evidence |
|---|---|---|
| Shared all-animal generation graph | Verified locally | 54 Node tests and 15/15 serial browser tests pass; global counts include all nodes/relationships. |
| Focus depth and relation semantics | Verified locally | Exact Futa all-generation component and focused ancestors/descendants match canonical IDs/edges; all 20 type/confidence style combinations and focused SVG edges pass. |
| Independent code review | Passed | Read-only follow-up review confirms the P2 relationship type/confidence rendering finding is fixed with no remaining blockers. |
| Cross-species data integrity and provenance | Verified locally | 82 Python tests, canonical data/schema validators, and all-species browser checks pass. |
| Desktop and mobile browser QA | Verified locally | Playwright 15/15 at 1440×900 and 390×844, including a readable focused Futa mobile view, data-backed SVG flags, and low-zoom mobile node selection; screenshots under `/tmp/animal-lineage-atlas-qa/`. |
| Large-graph performance and memory | Verified on release build | [Machine-readable report](PERFORMANCE_REPORT_PHASE3.json), pinned to clean merged revision `5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed`: RP full graph layout p95 113.685 ms; largest 823-animal component p95 60.141 ms; Chromium first render 164.3 ms; search p95 4.693 ms; measured browser heap 15.2 MB. |
| No-photo source and built release scan | Verified locally | Source and `dist/` scans passed. |
| CI green and reviewed PR merged to main | Passed | PR #6 merged as `5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed`; [required run 39404428209](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/39404428209) passed; independent review cleared the relationship-style finding. |
| Four production routes and representative profiles | Passed | Production Chromium verified hub plus all three graphs and direct Futa, Franz, and Fiona profiles. All routes returned HTTP 200 with no page errors or local asset failures. |
| Legacy `/red-panda/` unchanged and healthy | Passed | HTTP 200 after deployment; all 505 files match the predeployment file-by-file SHA-256 manifest, with 32 directories and zero symlinks. |
| Rollback manifest and prior release retained | Passed | Active manifest `/var/www/html/_animal-lineage-releases/5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed/release-manifest.json` records Phase 2 targets `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a`; prior release retained. |

## Production deployment

- Merged main revision: `5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed`; PR [#6](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/pull/6), merged 2026-10-20 09:58 UTC. Required CI run [39404428209](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/39404428209) passed on the identical tree.
- Deployed at 2026-10-20 10:02:03 UTC to `/var/www/html/_animal-lineage-releases/5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed/`.
- Active manifest: `/var/www/html/_animal-lineage-releases/5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed/release-manifest.json`.
- Each of `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/` points to the active release. The manifest records each previous target under Phase 2 release `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a`.
- `nginx -t` passed before the switch. No Nginx configuration was changed. The filesystem had 14 GB free before staging.
- All five production URLs returned HTTP 200: [Atlas hub](http://204.168.161.237/atlas/), [red panda](http://204.168.161.237/atlas.red-panda/), [polar bear](http://204.168.161.237/atlas.polar-bear/), [hippopotamus](http://204.168.161.237/atlas.hippopotamus/), and [legacy red panda](http://204.168.161.237/red-panda/).
- Verified direct profiles: [Futa](http://204.168.161.237/atlas.red-panda/?animal=red-panda%3Afuta), [Franz](http://204.168.161.237/atlas.polar-bear/?animal=polar-bear%3Afranz), and [Fiona](http://204.168.161.237/atlas.hippopotamus/?animal=hippopotamus%3Afiona).
- Production Chromium at `http://204.168.161.237` opened each global graph with expected counts (1,554 / 2,394; 72 / 63; 96 / 86), direct Futa, Franz, and Fiona profiles, and the 390×844 red-panda graph. It reported no page errors or local HTTP failures.
- Production screenshots are in `/tmp/animal-lineage-atlas-qa/`: `phase3-live-red-panda-global-1440x900.png`, `phase3-live-polar-bear-global-1440x900.png`, `phase3-live-hippopotamus-global-1440x900.png`, `phase3-live-futa-profile-1440x900.png`, and `phase3-live-red-panda-mobile-390x844.png`.
- The legacy tree's 505 files, 32 directories, 136,957,949 bytes, and zero symlinks match its predeployment per-file manifest exactly. Aggregate tree SHA-256 remains `a32ae67433de89bca8067743dbb28581e9a4053965c96b46032a84720664fdf3`.
- Roll back with `sudo -n python3 tools/rollback_release.py --root /var/www/html --manifest /var/www/html/_animal-lineage-releases/5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed/release-manifest.json`; this restores all four recorded Phase 2 symlinks.
