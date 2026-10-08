# Animal Lineage Atlas v1 release

## Source and paths

- Repository: [vvyatkin-afk/Animal-Lineage-Atlas](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas)
- Source implementation revision at QA: recorded in the archived [`docs/QA_REPORT_V1.json`](QA_REPORT_V1.json). The current `docs/QA_REPORT.json` records the Phase 2 release.
- Production root: `/var/www/html`
- Public routes:
  - Hub: [http://204.168.161.237/atlas/](http://204.168.161.237/atlas/)
  - Red panda: [http://204.168.161.237/atlas.red-panda/](http://204.168.161.237/atlas.red-panda/)
  - Polar bear: [http://204.168.161.237/atlas.polar-bear/](http://204.168.161.237/atlas.polar-bear/)
  - Common hippopotamus: [http://204.168.161.237/atlas.hippopotamus/](http://204.168.161.237/atlas.hippopotamus/)
- Legacy `/red-panda/` remains an independent application.

## Canonical data

| Atlas | Animals | Relationships | Events | Claims | Sources | Scope |
|---|---:|---:|---:|---:|---:|---|
| Red panda | 83 animals | 93 relationships | 173 events | 63 claims | 95 sources | Cited Futa-family subset |
| Polar bear | 22 animals | 24 relationships | 38 events | 4 claims | 11 sources | Tallinn, Tierpark Berlin, and Prague open records |
| Common hippopotamus | 5 animals | 4 relationships | 6 events | 1 claim | 8 sources | Cincinnati Zoo family; common hippo only |

These counts are verified from the canonical JSON. None of the datasets claims global or studbook completeness. Known conflicts and unknown status/date fields remain visible; see the species research notes linked from the README.

## Build and QA evidence

The static release contains 758,779 bytes across the four paths before transport compression. JavaScript plus CSS bundles total 383,233 bytes. Runtime JSON payloads are 272,047 bytes for red panda, 52,156 bytes for polar bear, and 18,081 bytes for hippopotamus; hub catalog JSON is 8,358 bytes. The machine-readable report includes individual assets and sampled search and genealogy timings.

Local validation passed clean dependency installation, lint, strict typecheck, 40 Node tests, 41 Python tests, JSON Schema and cross-reference validation for all three canonical datasets, repository and built-release no-photo scans, all four builds, and 8/8 Playwright tests. GitHub Actions passed the same checks on main at [c73b208](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/commit/c73b208386acee320cacfce4743b51b30fd03e84) ([run 37687966676](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/37687966676)). Browser checks used Chromium at 1440×1000 and 390×844, blocked third-party image requests, tested a failed remote image fallback, and inspected screenshots at `/tmp/animal-lineage-atlas-qa/`. The screenshots contain placeholders only.

`docs/QA_REPORT_V1.json` stores exact asset sizes, search and layout timings, browser totals, screenshot sizes, and production verification for application revision `c73b208`. The final live release manifest records the exact deployed revision and prior symlink targets; release close compares its revision with GitHub `main`.

## Media and source limits

The repository and release contain no animal-photo files or embedded animal photographs. All current animal-media references are link-only because public image embedding rights are not established. The separate 1,559-profile red-panda snapshot without a declared reuse license is excluded and documented in the migration report.

## Production verification

The application payload was built from main revision `c73b208386acee320cacfce4743b51b30fd03e84` and deployed to the four Atlas paths. A production browser smoke passed on the deployed release: hub cards, Japanese and Russian labels and coverage text, direct profiles for Futa, Franz, and Fiona, and a 390×844 mobile viewport. There were no browser errors or failed local requests. The separate eight-test Chromium suite also passed in CI.

All 19 Atlas HTML, JavaScript, CSS, catalog, runtime, and media-manifest URLs returned HTTP 200. `/red-panda/` returned HTTP 200. `nginx -t` passed before and after the path switch. The deployed immutable release passed the no-animal-photo scan. Nginx configuration was not changed.

The legacy `/var/www/html/red-panda/` tree remained at 497 files and 119,920,152 bytes with the same SHA-256 (`d3515d040661efb2ab3e1b9149970d25102e6da7dc6164cfe0220f87e2f3042d`) before and after deployment. The checksum covers sorted relative paths and file bytes. At final verification the filesystem had 5.8 GB available (84% used of 38 GB).

The checks above record the application payload deployment at `c73b208`, when that revision was GitHub `main`. Later release-record changes are documentation-only. At release close, compare the current public symlinks' immutable release manifest `revision` with GitHub `main`; accept the release only when they match. The current manifest is at `/var/www/html/_animal-lineage-releases/<current-main-sha>/release-manifest.json` and records the prior four targets for rollback. See [deployment and rollback](DEPLOYMENT_AND_ROLLBACK.md).
