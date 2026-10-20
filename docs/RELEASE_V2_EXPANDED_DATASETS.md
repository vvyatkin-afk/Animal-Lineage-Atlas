# Expanded dataset release (Phase 2)

## Release

Phase 2 was merged through [PR #4](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/pull/4) as merge commit `ad24b3bb51c08242c731189040d15241d56ab3b4`. The post-merge [GitHub Actions run](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/37725623575) passed on that exact `main` revision. The release was deployed from that commit on 2026-10-08; the deploy manifest was created at 04:04:47 UTC.

Repository: [vvyatkin-afk/Animal-Lineage-Atlas](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas). The release deploys only `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/` using the atomic release helper documented in [Deployment and rollback](DEPLOYMENT_AND_ROLLBACK.md).

## Canonical counts and scope

| Atlas | Animals | Relationships | Claims | Events | Institutions | Sources | Scope |
|---|---:|---:|---:|---:|---:|---:|---|
| Red panda | 1554 animals | 2394 relationships | 5660 claims | 3792 events | 358 | 1521 | One canonical array: 1475 profiles from the pinned public wwoast/redpanda-lineage export plus 83 curated Futa-family records, with four reviewed identity crosswalks. |
| Polar bear | 64 animals | 58 relationships | 7 claims | 84 events | 31 | 28 | Named zoo/captive histories from public institutional sources. Wild research IDs remain a separate population and are not merged with zoo animals. |
| Hippopotamus | 85 animals | 78 relationships | 111 claims | 85 events | 41 | 69 | 60 common and 25 pygmy hippos; taxa remain separate and all records are tagged `zoo_captive`. |

Counts are read from the canonical JSON files. They do not imply full studbook coverage. The red-panda merge report maps or excludes every one of the 2256 upstream vertices and all 7331 source edges. Upstream IDs 34, 49, 50, and 200 are explicitly crosswalked to Futa, Nara, Fu-Fu, and Kelú. Seventy-one other near-match candidates remain unmerged because required identity evidence is incomplete or conflicts; no ambiguous candidate is auto-merged. Kelú's two upstream parent edges are mapped for audit but excluded from canonical parentage because no cited primary source establishes those parents.

The polar bear atlas adds 42 named zoo records to its earlier 22-animal corpus. Dryad's Western Hudson Bay dataset describes a 4449-individual pedigree and states CC0 reuse terms, but its normal published file link returned HTTP 403 and its documented anonymous API download returned HTTP 401. No wild rows were imported without the file bytes. See [the Western Hudson Bay access review](POLAR_BEAR_WESTERN_HUDSON_BAY.md). The common- and pygmy-hippo imports use public institutional records; public studbook summaries are context only and no restricted individual rows were copied.

## Provenance and media

The community red-panda dataset has no explicit repository license in the pinned metadata or repository tree. The import records attribution, source revision, export URL, retrieval time, byte count, and SHA-256 without asserting a license. Official institution records are classified as Tier B; community data as Tier D; discovery-only pages do not stand as sole evidence for final facts. Eight inherited discovery-only assertions or details are reduced, removed, or documented as unresolved in the red-panda sync report.

No animal-photo bytes, copied thumbnails, local image paths, or embedded photos are present in the canonical files or release. The red-panda import stripped 36264 image references and 2255 local path fields, and found zero byte payload fields. Red-panda media remains link-only with embedding disabled because rights are not established. All other media uses the shared resolver policy; failed or disallowed images leave a placeholder and source link.

## Verification record

- Local checks passed: lint, typecheck, all 45 Node tests, all 79 Python tests, data validation, schema validation, canonical-atlas and built-release no-photo scans, and all four static builds.
- The PR branch check and post-merge GitHub Actions run both passed. The post-merge run tested `ad24b3bb51c08242c731189040d15241d56ab3b4` and ran lint, typecheck, Node and Python tests, data/schema validation, both photo scans, build, and browser tests.
- Final-corpus performance and desktop/mobile browser measurements: recorded in [the Phase 2 performance report](PERFORMANCE_REPORT_PHASE2.md) and its machine-readable [JSON results](PERFORMANCE_REPORT_PHASE2.json). The full local Playwright suite passed 10/10 tests at 1440×1000 and 390×844.
- The deployed release no-photo scan passed. Production Nginx configuration validation passed; no Nginx configuration was changed.
- Production verification at 2026-10-08 04:08 UTC covered only `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/`. All four pages returned HTTP 200; their main scripts and the hub catalog and three child runtime indexes returned HTTP 200.
- Direct production profiles for Kelú, Franz, and Fiona returned HTTP 200 and rendered their genealogy views. Kelú's S24 link was visible. The browser reported no page errors or Atlas asset errors. The hub showed all three cards and the 1,554 red-panda count; Japanese and Russian locale switches passed. At 390×844, document width remained 390 px.
- Active manifest: `/var/www/html/_animal-lineage-releases/ad24b3bb51c08242c731189040d15241d56ab3b4/release-manifest.json`. Its revision matched GitHub `main` at verification time. The manifest records all four prior targets under `_animal-lineage-releases/8bafae5ee12da07912cbc2e95811aafe8fb5b320/`; each target was present and verified for rollback.
- The filesystem had 5.5 GB free of 38 GB (85% used) after deployment. No cleanup was needed.

Production browser screenshots were saved under `/tmp/animal-lineage-atlas-qa/production-*.png`. To roll back, run the `rollback_release.py` command against the deployed manifest as described in [Deployment and rollback](DEPLOYMENT_AND_ROLLBACK.md). This release record is a documentation-only follow-up to the deployed app revision.

## Phase 3 deployment record — 2026-10-20

Phase 3 was merged through [PR #6](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/pull/6) as main commit `5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed`; required [GitHub Actions run 39404428209](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/39404428209) passed on the identical source tree. An independent read-only review confirmed the relationship type/confidence rendering fix with no remaining blockers. Deployment completed at 2026-10-20 10:02 UTC.

The immutable production release is `/var/www/html/_animal-lineage-releases/5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed/`. Its active manifest is `/var/www/html/_animal-lineage-releases/5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed/release-manifest.json`; all four Atlas symlinks point into this release, and the manifest records Phase 2 release `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a` as the rollback target. `nginx -t` passed before the switch; no Nginx configuration changed.

The five production paths `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, `/atlas.hippopotamus/`, and `/red-panda/` returned HTTP 200 after deployment. Production Chromium opened all three global indexes at 1,554/2,394, 72/63, and 96/86 nodes/relationships, direct Futa, Franz, and Fiona profiles, and the red-panda graph at 390×844 without page errors or local asset failures. The legacy `/var/www/html/red-panda/` tree remained byte-for-byte unchanged: 505 files, 32 directories, 136,957,949 bytes, zero symlinks, and tree SHA-256 `a32ae67433de89bca8067743dbb28581e9a4053965c96b46032a84720664fdf3`.

Final Phase 3 build, browser, and performance evidence is recorded in [the release record](PHASE3_RELEASE.md) and [the machine-readable performance report](PERFORMANCE_REPORT_PHASE3.json). The report is pinned to main commit `5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed`; production screenshots are saved under `/tmp/animal-lineage-atlas-qa/` with the `phase3-live-` prefix. The rollback command is in [Deployment and rollback](DEPLOYMENT_AND_ROLLBACK.md).
