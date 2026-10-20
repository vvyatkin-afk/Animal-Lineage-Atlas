# Phase 3 Release Record

Status: **in progress; no Phase 3 production release**

## Baseline

- Feature branch baseline: `daf7d2931a1560b5d25721eb6b90dd35c66da6bf`.
- Production remains Phase 2 commit `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a` at `/var/www/html/_animal-lineage-releases/133f7a5324a4095aeb922f77c4dce3e4c2a50b5a`.
- Baseline live HTTP checks on 2026-10-20: all four Atlas paths and legacy `/red-panda/` returned 200. No production changes were made.
- Baseline counts: red panda 1,554 animals / 2,394 relationships; polar bear 64 / 58; hippopotamus 85 / 78 (60 common, 25 pygmy).
- Baseline checks: 45 Node tests, 79 Python tests, 10/10 serial browser tests, lint, typecheck, data/schema validation, build, and no-photo scan passed.
- Current rollout rollback target is the Phase 2 manifest's recorded prior release `ad24b3bb51c08242c731189040d15241d56ab3b4`.

## Phase 3 results

Implementation, dataset review, branch CI, PR review, production deployment, browser smoke checks, screenshots, and final rollback instructions are pending. Record each verified result here before marking it complete. Do not treat research-prototype results as Atlas release checks.

## Release verification

| Check | Status | Evidence |
|---|---|---|
| Shared all-animal generation graph | Pending | |
| Focus depth and relation semantics | Pending | |
| Cross-species data integrity and provenance | Pending | |
| Desktop and mobile browser QA | Pending | |
| Large-graph performance and memory | Pending | |
| No-photo source and built release scan | Pending | |
| CI green and reviewed PR merged to main | Pending | |
| Four production routes and representative profiles | Pending | |
| Legacy `/red-panda/` unchanged and healthy | Pending | |
| Rollback manifest and prior release retained | Pending | |
