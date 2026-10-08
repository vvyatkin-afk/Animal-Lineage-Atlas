# Expanded dataset release (Phase 2)

## Release candidate

This record follows the Phase 2 data expansion. The release commit and GitHub Actions run will be added after the reviewed branch merges; deployment manifest, production checks, and final disk usage will be recorded after the scoped production release.

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

- Local CI-equivalent checks: lint, typecheck, all 45 Node tests, all Python tests, data validation, schema validation, canonical-atlas no-photo scan, built-release no-photo scan, and all 4 static builds passed. The current integration branch is also covered by the full GitHub Actions run before merge.
- GitHub Actions on the reviewed main commit: pending.
- Final-corpus performance and desktop/mobile browser measurements: recorded in [the Phase 2 performance report](PERFORMANCE_REPORT_PHASE2.md) and its machine-readable [JSON results](PERFORMANCE_REPORT_PHASE2.json). The full local Playwright suite passed 10/10 tests at 1440×1000 and 390×844.
- Built-release no-photo scan: passed for all four paths; canonical `atlases/` also passes the no-photo scan.
- Production verification for the four Atlas paths and representative direct profiles: pending.
- Production manifest revision matched to GitHub `main`: pending.
- The scoped production check covers only `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/`.
- Disk usage at final deployment: pending.

The prior release and current rollback manifest are retained. After deployment, this section will record the exact GitHub main SHA, successful CI run, manifest path and prior four Atlas symlink targets, HTTP/browser results, no-photo scan, performance measurements, and free disk space. To roll back, run the `rollback_release.py` command against the deployed manifest as described in [Deployment and rollback](DEPLOYMENT_AND_ROLLBACK.md).
