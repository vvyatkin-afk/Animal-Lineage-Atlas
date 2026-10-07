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

- [ ] Commit schema, source/evidence model, validators, genealogy/search/media resolver packages, and test fixtures.
- [ ] Migrate the cited Futa-family dataset without photos; preserve uncertainty and unresolved items; generate ID map and migration report.
- [ ] Research and build a source-bounded polar-bear atlas and a common-hippopotamus atlas; publish coverage and limitations.
- [ ] Build the hub and shared responsive, keyboard-accessible English/Japanese/Russian interface.
- [ ] Add CI checks for lint/typecheck, tests, schema/data validation, local-animal-photo prohibition, all-app builds, and browser smoke coverage where available.
- [ ] Run independent code/data/browser review; fix findings; commit release and rollback documentation.
- [ ] Push reviewed release to GitHub `main` and verify the exact deployed SHA matches it.
- [ ] Deploy four path applications with isolated release directories/symlinks, preserving `/red-panda/`; verify Nginx config and HTTP/direct-profile/mobile behavior.
- [ ] Record production smoke results, counts, source limits, photo audit, disk usage, and rollback target in machine-readable and human-readable release reports.
