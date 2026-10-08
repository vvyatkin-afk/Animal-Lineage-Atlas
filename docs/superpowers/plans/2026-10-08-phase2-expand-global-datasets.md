# Phase 2: Expand Global Datasets

## Objective

Deliver a unified, source-traceable expansion of the red-panda, polar-bear, and hippopotamus atlases. Keep the canonical animal records unified per route, make the large datasets usable on desktop and mobile, preserve the no-local-photo rule, and deploy only the four new `/atlas*` paths through the existing atomic release mechanism.

## Scope and constraints

- Work in `Animal-Lineage-Atlas` and deploy `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/` only.
- Do not inspect or alter the legacy `/red-panda/` path or its repository during this task.
- Keep upstream/source IDs, source URLs, access dates, source snapshots, import hashes, conflicts, and exclusions reproducible.
- Do not ingest photo bytes or restricted studbook records. Do not invent names, dates, identities, or parent links.
- Use isolated worktrees for the six requested Luna tracks; merge only after source/data/code review.
- Preserve current curated records and histories; imports must be deterministic and reviewable before publication.

## Design decisions

1. Each species keeps a single canonical `animals` array. Red-panda upstream and curated records are merged into that array with an explicit ID map and conflict report. Hippo taxa share one canonical atlas but have distinct taxon values and no cross-taxon parentage.
2. Large runtime delivery may split into a compact graph/search index and lazily fetched profile/evidence chunks. The canonical source remains complete and unified; direct profile links must resolve without loading unrelated evidence.
3. Global graph navigation must represent disconnected components and use clustering/level-of-detail or viewport culling. Search spans every canonical record and focuses the selected record.
4. Data imports are reproducible commands that produce deterministic snapshots/reports. A changed or missing upstream record is reported for review and never silently deletes canonical facts.
5. Source permission is stated narrowly. An open research dataset is used only after checking the actual dataset page and data terms; a public studbook summary is not treated as permission to republish underlying records.

## Work plan

### 1. Preflight and baseline

- Confirm `origin/main` is the reviewed baseline, verify clean tracked state, disk space, toolchain, CI workflow, deployment helper, and current `/atlas*` release manifest.
- Record the starting repository SHA and the new Atlas production revision/manifest for the release report.
- Keep the supplied Phase 2 prompt untracked and unchanged.

### 2. Parallel research and ingestion tracks

- **Red panda:** fetch the current upstream repository/export, record commit/export URL/retrieval time/SHA/counts, inspect the current schema, build deterministic ID-first dedupe against all curated records, retain ambiguous candidates as separate records, remove image-byte/path fields, and report all imports, mappings, conflicts, and exclusions.
- **Polar bear:** verify Dryad DOI `10.5061/dryad.23d8v` on its actual dataset page and import the full reusable Western Hudson Bay pedigree if terms allow; preserve numeric IDs and unknown parents. Add independently sourced zoo/captive records without mapping them to wild research IDs absent authoritative evidence.
- **Common hippo:** research official zoo/conservation/research sources and prepare a source-backed common-hippo import bundle with multiple institutions and verified family links.
- **Pygmy hippo:** research official public histories and prepare a separate source-backed pygmy-hippo import bundle. Use Moo Deng only if official parentage is directly verified. Do not reproduce inaccessible studbook records.
- **Performance:** implement scalable graph/search/runtime delivery and objective measurements without changing canonical facts.
- **Independent QA:** review evidence and imports, verify source-tier rules, duplicate/relationship safety, no-photo constraints, and acceptance coverage; repeat against the integrated candidate before release.

Each data track writes to a disjoint path or a temporary species import bundle to avoid concurrent canonical-file edits. The integration lead combines bundles deterministically into the canonical atlas and resolves only documented conflicts.

### 3. Integration and provenance

- Extend schema/validators only where required for population/scope/source-tier metadata and optimized runtime indexes.
- Combine hippo common and pygmy bundles; enforce exact taxon boundaries for every relationship.
- Merge all current red-panda upstream profiles plus unique curated records; preserve curated cited facts as preferred while recording alternate values.
- Add required source-tier, sync, import, merge, species research, QA, and release documentation.
- Add machine-readable import/merge reports with counts, source snapshot hashes, ID mappings, conflicts, dropped media fields, and exclusions.

### 4. Verification

- Run formatting/lint, typecheck, Node and Python suites, schema/data validation, no-photo scans, release build, and browser suite; maintain regression coverage for EN/JA/RU, direct profiles, route filters, global search/tree, disconnected families, mobile layout, and taxon isolation.
- Measure canonical counts, built/runtime and initial-transfer bytes, search median/p95, global graph/index build time, heap use where practical, and direct-profile latency using the final datasets.
- Audit built artifacts, CI-visible files, and reports for photo bytes and photo paths. Remote image failures must remain non-fatal.
- Have QA review the final integrated commit and close every blocking finding before merge.

### 5. Merge, deploy, and production verification

- Merge the reviewed integration branch to `main`, push it, and wait for the GitHub Actions CI run for that exact SHA to pass.
- Build and deploy with the existing atomic release helper. Run `nginx -t` without changing configuration.
- Verify the release manifest SHA equals GitHub `main`; check all `/atlas*` pages and data/chunk URLs, representative name/ID search, wild/captive and common/pygmy filters, direct-profile queries, desktop/mobile behavior, and no-photo status.
- Record final counts, source snapshots, research limits, CI/tests, timings/bytes, production URLs, manifest/rollback path, and release SHA in the required report.

## Acceptance checks

- Every current upstream red-panda record is mapped to a final canonical ID or explicitly reported as a source record excluded for a documented technical/reuse reason; no ambiguous names are auto-merged.
- Polar bear contains the full Dryad pedigree if reusable, with exact external IDs and no fabricated parents; captive scope remains separate.
- Hippopotamus includes both taxa, substantial source-backed additions across institutions, and no cross-taxon edges.
- The large datasets do not force full evidence JSON into the first page transfer; search covers every animal; global navigation includes disconnected components.
- No animal photo bytes exist in repository/build/release/reports/cache; CI is green; production and `main` identify the same SHA; only `/atlas*` routes are changed.

## Progress ledger

- [x] Read the full Phase 2 brief and establish isolated worktrees from `origin/main` (`8bafae5ee12da07912cbc2e95811aafe8fb5b320`).
- [ ] Parallel source research and import bundles reviewed.
- [ ] Performance implementation and tests integrated.
- [ ] Canonical datasets, schemas, validators, and required documentation integrated.
- [ ] Independent QA complete with no unresolved blocking findings.
- [ ] Full CI/build/browser/no-photo/performance verification green.
- [ ] Merged to `main`, CI green for merge SHA, deployed, and production verified.
