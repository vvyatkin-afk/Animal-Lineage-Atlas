# Animal Lineage Atlas v1 release

## Source and paths

- Repository: [vvyatkin-afk/Animal-Lineage-Atlas](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas)
- Source implementation revision at QA: `15b6f18875db1973110900240e7668e92dd55121` (release documentation and deployment commits are tracked separately in Git).
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

The static release contains 654,196 bytes across the four paths before transport compression. JavaScript plus CSS bundles total 296,458 bytes. Runtime JSON payloads are 269,771 bytes for red panda, 47,573 bytes for polar bear, and 14,920 bytes for hippopotamus; hub catalog JSON is 2,542 bytes. The machine-readable report includes individual assets and sampled search and genealogy timings.

Local validation at the QA revision passed clean dependency installation, lint, strict typecheck, 36 Node tests, 27 Python tests, all three canonical validators, repository and built-release no-photo scans, all four builds, and 6/6 Playwright tests. Browser checks used Chromium at 1440×1000 and 390×844, blocked third-party image requests, tested a failed remote image fallback, and inspected screenshots at `/tmp/animal-lineage-atlas-qa/`. The screenshots contain placeholders only.

`docs/QA_REPORT.json` stores exact asset sizes, search and layout timings, browser totals, and screenshot sizes. CI will repeat the same checks on GitHub `main`; final CI run, deploy SHA, Nginx check, disk status, HTTP smoke results, and rollback manifest are recorded after deployment.

## Media and source limits

The repository and release contain no animal-photo files or embedded animal photographs. All current animal-media references are link-only because public image embedding rights are not established. The separate 1,559-profile red-panda snapshot without a declared reuse license is excluded and documented in the migration report.

## Deployment status

This document is updated as the reviewed release is pushed and deployed. The intended immutable directory is `/var/www/html/_animal-lineage-releases/<git-sha>/`; the deploy manifest stores prior symlink targets. See [deployment and rollback](DEPLOYMENT_AND_ROLLBACK.md). The final section will record the exact GitHub `main` SHA and verified production state.
