# Animal Lineage Atlas v1 execution checklist

This checklist records the required release path from `MASTER_EXECUTION_PROMPT.md`.

## Preflight findings (2026-10-07)

- [x] New repository is `vvyatkin-afk/Animal-Lineage-Atlas`, initially clean at `de3fd587cd49283e088903cc2e4285cceaa0ab05`.
- [x] Disk checked: 38 GB filesystem, 35 GB used, 832 MB available (98%). Existing 670 MB Python environments and 179 MB `/tmp` contents belong to other work; no cleanup was needed or performed.
- [x] Reviewed all three red-panda checkouts. Migration reference is `FFJ-Red-Panda-Atlas-card-ui-20261007` (`fe97aff63d87948232462ea4b60873460de96948`); production release evidence records `efb54a683f51728378bb513ab05cf7feea23ca62`.
- [x] Current legacy URL is `http://204.168.161.237/red-panda/`; home and tree data returned HTTP 200. Reviewed the active Nginx server block. It serves `/var/www/html`; legacy routes and PHP forum endpoints are separate.
- [x] Production red-panda `index.html`, `profile.html`, tree HTML/JS/data, and direct-profile CSS match the reviewed migration checkout by SHA-256.
- [x] Current legacy data contains a cited 83-node Futa-family layer and a separate 1,559-record Red Panda Lineage profile index. The upstream repository has no declared reuse license, so the new atlas will not copy its full snapshot. The migration report will document excluded IDs/counts and reasons; only the locally curated, source-linked Futa layer will be migrated.
- [x] No legacy files, production files, backups, caches, or unrelated projects were changed or removed.

## Release work

- [x] Commit schema, source/evidence model, validators, genealogy/search/media resolver packages, and test fixtures.
- [x] Migrate the cited Futa-family dataset without photos; preserve uncertainty and unresolved items; generate ID map and migration report.
- [x] Research and build a source-bounded polar-bear atlas and a common-hippopotamus atlas; publish coverage and limitations.
- [x] Build the hub and shared responsive, keyboard-accessible English/Japanese/Russian interface.
- [x] Localize source categories and coverage scope/limitations in all three interface languages while retaining curated proper names and source titles.
- [x] Add CI checks for lint/typecheck, tests, schema/data validation, local-animal-photo prohibition, all-app builds, and browser smoke coverage.
- [x] Run independent code/data/browser review and fix findings; release and rollback documentation is present.
- [x] Merge reviewed application revision `c73b208386acee320cacfce4743b51b30fd03e84` to GitHub `main`; its production release manifest matched that exact `main` SHA at application release verification.
- [x] Deploy four path applications with isolated release directories/symlinks, preserving `/red-panda/`; verify Nginx config and HTTP/direct-profile/mobile behavior.
- [x] Record production smoke results, counts, source limits, photo audit, disk usage, and rollback location in machine-readable and human-readable release reports.

## Production verification (2026-10-07)

- The web root is `/var/www/html` and owned by `root:root`; the scoped deploy and Nginx validation commands ran with `sudo -n`. Nginx configuration was not changed.
- The application payload commit is `c73b208386acee320cacfce4743b51b30fd03e84`; its GitHub Actions main run passed.
- All 19 Atlas asset/data URLs and `/red-panda/` returned HTTP 200. Production browser smoke verified all three direct profiles, EN/JA/RU interface text and coverage, and a 390×844 viewport without browser or local HTTP errors.
- The legacy tree stayed at 497 files and 119,920,152 bytes with aggregate SHA-256 `d3515d040661efb2ab3e1b9149970d25102e6da7dc6164cfe0220f87e2f3042d` before and after deployment.
- The deployed release passed the no-photo scan; `nginx -t` passed after deployment. The disk had 5.8 GB free (84% used of 38 GB).
- The production checks above verify the `c73b208` application payload. Later release-record changes are documentation-only; release close compares the active manifest revision with GitHub `main` and keeps the prior targets recorded in that manifest for rollback.
