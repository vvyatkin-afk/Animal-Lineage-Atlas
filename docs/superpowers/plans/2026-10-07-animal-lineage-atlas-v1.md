# Animal Lineage Atlas v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, validate, document, and deploy the static hub and three source-bounded atlases at the four required production paths while leaving `/red-panda/` unchanged.

**Architecture:** A TypeScript shared engine reads one canonical JSON file per species. Python validates canonical data, imports the curated red-panda source, generates release reports, and stages atomic path releases. Static builds are independent, small, and query-profile-addressable.

**Tech Stack:** TypeScript, esbuild, Node's built-in test runner, Python 3 standard library/unittest, HTML/CSS/SVG, GitHub Actions, Nginx static root.

**Spec:** `docs/superpowers/specs/2026-10-07-animal-lineage-atlas-v1-design.md`

## Global Constraints

- Do not change or copy from production `/red-panda/`; keep new assets under the four `/atlas*` paths.
- Do not add local JPG/JPEG/PNG/WebP animal photographs, generated thumbnails, Base64 copies, caches, or copied remote photographs.
- Do not bulk-copy the unlicensed 1,559-record Red Panda Lineage snapshot; use the 83-node locally curated Futa dataset and document the excluded input.
- Preserve uncertainty and conflicting evidence; never create shared unknown-parent animals or invent translations/provenance.
- Every factual animal claim and relationship in canonical data links to a source record.
- Keep the hub and child atlases static and independently usable; use query IDs for profiles and no service workers.
- Keep production release directories immutable, retain the former symlink targets, and provide tested rollback.

## Review Focus

- **Missing or approximate dates:** keep the source's date precision and render it honestly. Test: `test_date_precision_survives_round_trip` in Task 1 and `test_profile_shows_approximate_date` in Task 6.
- **Unknown, probable, or conflicting parentage:** preserve state and show only real animal IDs. Test: `test_unknown_parent_is_not_materialized` in Task 1 and `test_probable_edge_style_is_distinct` in Task 3.
- **Convergent ancestors and cycles:** render a shared ancestor once and reject a cycle. Test: `test_convergent_ancestor_has_one_node` in Task 3 and `test_rejects_self_ancestry_and_cycles` in Task 1.
- **Country changes:** country filters/grouping do not redefine family membership. Test: `test_country_change_does_not_split_family` in Task 3.
- **Unavailable or restricted media:** preserve source links and keep the card/profile usable when a remote image fails. Test: `test_remote_media_requires_embedding_permission` in Task 2 and `test_image_failure_keeps_profile_usable` in Task 6.

---

### Task 1: Canonical schema and data validator

**Files:**
- Create: `packages/schema/atlas.schema.json`
- Create: `tools/validate_atlas.py`
- Create: `tests/test_validate_atlas.py`
- Create: `atlases/*/atlas.json` fixtures only as each data task needs them

**Interfaces:**
- Produces: `validate_atlas(document: dict) -> list[Issue]`, `Issue(code: str, path: str, message: str)`; CLI `python3 tools/validate_atlas.py <atlas.json>` exits nonzero on any error.
- Validates collections `animals`, `claims`, `relationships`, `events`, `institutions`, `media`, and `sources`, plus release and coverage metadata.

- [ ] Write tests `test_accepts_minimal_atlas`, `test_rejects_dangling_relationship`, `test_rejects_duplicate_external_id_in_namespace`, `test_rejects_self_ancestry_and_cycles`, `test_date_precision_survives_round_trip`, `test_conflicting_claims_are_preserved`, and `test_unknown_parent_is_not_materialized`.
- [ ] Run `python3 -m unittest tests.test_validate_atlas -v`; confirm expected import/missing-validator failures.
- [ ] Define JSON Schema enums and required fields for source-backed animals, claims, relationships, date values, events, places, media references, and release metadata.
- [ ] Implement cross-record ID/reference/cycle/duplicate/date/uncertainty checks in `tools/validate_atlas.py`.
- [ ] Run `python3 -m unittest tests.test_validate_atlas -v` and confirm each test passes.
- [ ] Commit as `feat: define atlas data schema and validation`.

### Task 2: Search and media resolver packages

**Files:**
- Create: `package.json`, `package-lock.json`
- Create: `packages/search/search.ts`
- Create: `packages/media/resolver.ts`
- Create: `packages/media/fixtures/local-media-manifest.json`
- Create: `packages/media/fixtures/local-media-swatch.svg`
- Create: `tests/search-media.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `normalizeSearchKey(value: string) -> string`, `searchAnimals(index, query, facets) -> AnimalSummary[]`.
- Produces: `resolvePublicMedia(reference) -> MediaResult`, `createLocalResolver(manifest) -> (reference) -> MediaResult`; results contain only an allowed URL, source link, or placeholder description.

- [ ] Add the minimal ESM package test harness (`node --import tsx --test`) and TypeScript/esbuild/tsx dev dependencies; install them before writing the tests so Node can import TypeScript modules.
- [ ] Write `test_normalizes_case_spacing_and_diacritics`, `test_searches_names_aliases_ids_and_institutions`, `test_country_and_taxon_facets`, `test_remote_media_requires_embedding_permission`, `test_remote_media_failure_returns_placeholder`, and `test_local_resolver_reads_manifest_contract`.
- [ ] Run `npm test -- tests/search-media.test.mjs`; confirm imports fail because the package files do not exist.
- [ ] Implement normalization without changing stored display values; retain all matching aliases and facet filters.
- [ ] Implement a public resolver that uses direct URLs only when `embedding_status` and `rights_status` permit embedding; otherwise return a neutral placeholder plus `source_page_url`.
- [ ] Implement the injected local-manifest resolver and generic swatch fixture with source, credit, relative path, checksum, and archive status.
- [ ] Run `npm test -- tests/search-media.test.mjs`; confirm pass.
- [ ] Commit as `feat: add atlas search and media resolvers`.

### Task 3: Reusable genealogy layout and interaction state

**Files:**
- Create: `packages/genealogy/layout.ts`
- Create: `packages/genealogy/state.ts`
- Create: `tests/genealogy.test.mjs`

**Interfaces:**
- Produces: `buildGenealogy(animals, relationships, focusId, options) -> { nodes, edges, generationRows, truncated }` with one node per animal ID.
- Produces: `createViewState(initial) -> { get(), update(patch), openProfile(id), closeProfile() }`; profile changes do not reset graph state.

- [ ] Write `test_simple_family_has_parent_child_edges`, `test_multi_generation_rows`, `test_independent_unknown_parents_create_no_nodes`, `test_convergent_ancestor_has_one_node`, `test_probable_edge_style_is_distinct`, `test_country_change_does_not_split_family`, `test_node_limit_reports_truncation`, and `test_profile_close_restores_tree_state`.
- [ ] Run `npm test -- tests/genealogy.test.mjs`; confirm expected missing-module failures.
- [ ] Implement bounded ancestor/descendant expansion, stable layer/row placement, shared-ancestor deduplication, edge status/type, country display grouping, and node-limit reporting.
- [ ] Implement URL-profile state updates without losing focus, filters, zoom, or selected group.
- [ ] Run `npm test -- tests/genealogy.test.mjs`; confirm pass.
- [ ] Commit as `feat: add reusable genealogy layout and view state`.

### Task 4: Red-panda migration and report

**Files:**
- Create: `tools/import/migrate_red_panda.py`
- Create: `atlases/red-panda/atlas.json`
- Create: `atlases/red-panda/migration_report.json`
- Create: `atlases/red-panda/legacy_id_map.json`
- Create: `tests/test_red_panda_migration.py`
- Reference input: `/home/codex/projects/FFJ-Red-Panda-Atlas-card-ui-20261007/tree/data.json` (never modify)

**Interfaces:**
- Produces: `migrate_red_panda(input_path, output_path, report_path, excluded_snapshot_path) -> MigrationReport`; the required fourth input supplies only excluded profile IDs and aggregate counts to the report.
- Stable target IDs use `red-panda:<legacy-tree-id>`; each maps to `legacy-futa-tree` namespace. Unnamed outcomes become events, not animals.

- [ ] Write `test_imports_all_named_source_nodes`, `test_local_photo_paths_are_dropped`, `test_sources_and_uncertainty_are_retained`, `test_unlinked_co_parent_is_not_fabricated`, and `test_report_documents_unlicensed_global_exclusion`.
- [ ] Run `python3 -m unittest tests.test_red_panda_migration -v`; confirm the missing importer fails as expected.
- [ ] Transform the 83 curated animal nodes, 21 source records, seven unnamed-outcome entries/eight outcomes, and one unquantified event into canonical data. Remove local image paths/bytes; convert original media pages to link-only metadata where available.
- [ ] Add a report with source revision/hash, source and target counts, 83 ID mappings, relationship counts/statuses, all excluded global record counts and legacy IDs, changed/unmapped IDs, warnings, and unresolved items.
- [ ] Run migration, schema/data validation, and `python3 -m unittest tests.test_red_panda_migration -v`; confirm pass and review counts against the source.
- [ ] Commit as `feat: migrate cited red panda family data`.

### Task 5: Polar-bear and hippopotamus source datasets

**Files:**
- Create: `atlases/polar-bear/atlas.json`
- Create: `atlases/hippopotamus/atlas.json`
- Create: `tests/test_species_data.py`
- Sources: `docs/POLAR_BEAR_SOURCES.md`, `docs/HIPPOPOTAMUS_SOURCES.md`

**Interfaces:**
- Each file satisfies the canonical atlas schema and includes precise coverage, version/review dates, source records, and release counts.
- Polar bear v1 includes supported Tallinn, Tierpark Berlin, and Prague individuals; hippo v1 is common hippopotamus at Cincinnati Zoo only.

- [x] Write tests `test_polar_bear_relationships_have_primary_evidence`, `test_tonja_wolodja_parentage_is_genetically_documented`, `test_hippo_taxa_are_not_mixed`, `test_cincinnati_parentage_is_source_backed`, and `test_historical_locations_have_dates_or_unknown_precision`.
- [x] Run `python3 -m unittest tests.test_species_data -v`; confirm expected missing-data failures.
- [x] Add individually identified animals, biological links, approximate/exact events, dated institution transfers, aliases only where sources supply them, and source IDs.
- [x] Write reproducible research notes with direct URLs, supported claims, access dates, source-use limits, corpus scope, and known gaps.
- [x] Run species tests and all canonical validators; review each relationship directly against its cited source.
- [x] Commit as `feat: add sourced polar bear and hippo datasets`.

### Task 6: Shared atlas UI, profile pages, and responsive genealogy

**Files:**
- Create: `apps/atlas/index.html`
- Create: `apps/atlas/main.ts`
- Create: `apps/atlas/styles.css`
- Create: `packages/ui/genealogy-view.ts`
- Create: `packages/ui/profile-dialog.ts`
- Create: `packages/ui/search-controls.ts`
- Create: `tests/ui-contract.test.mjs`

**Interfaces:**
- Reads a generated runtime JSON adjacent to each app and a `data-atlas`/`data-base-path` config in HTML.
- Produces accessible tree controls, searchable profiles, `<dialog>` details, source links, media placeholders, and query URL `?animal=<id>`.

- [ ] Write `test_profile_query_loads_expected_animal`, `test_profile_shows_approximate_date`, `test_image_failure_keeps_profile_usable`, `test_controls_are_keyboard_operable`, `test_language_switch_renders_all_interface_locales`, and `test_graph_and_profile_share_no_photo_bytes`.
- [ ] Run `npm test -- tests/ui-contract.test.mjs`; confirm missing app modules/markup fail as expected.
- [ ] Implement desktop/mobile layout, SVG graph, keyboard zoom/pan/focus controls, EN/JA/RU interface strings, country/taxon filters, accessible placeholders, citations, and direct profile query parsing.
- [ ] Preserve focus/filters/pan/zoom/selected group while profile opens/closes; use only names present in data.
- [ ] Run UI contract tests and inspect built HTML/CSS/JS; confirm pass.
- [ ] Commit as `feat: build shared atlas and profile interface`.

### Task 7: Hub, coverage pages, and i18n

**Files:**
- Create: `apps/hub/index.html`
- Create: `apps/hub/main.ts`
- Create: `apps/hub/styles.css`
- Create: `packages/i18n/messages.json`
- Create: `tests/hub-contract.test.mjs`

**Interfaces:**
- Hub catalog is generated from the three canonical atlas files: counts, version, last review, source categories, and coverage warnings are computed, never hard-coded.
- Each atlas provides a visible Coverage and Limitations view, with bilingual/multilingual interface copy.

- [ ] Write `test_hub_counts_match_canonical_data`, `test_hub_explains_public_studbooks_and_scope`, `test_media_policy_and_offline_future_are_visible`, and `test_child_links_use_required_base_paths`.
- [ ] Run `npm test -- tests/hub-contract.test.mjs`; confirm expected missing-file failures.
- [ ] Implement the hub mission, evidence/uncertainty, source corrections, data versions, public-media policy, offline package concept, and atlas cards.
- [ ] Add human-reviewed EN/JA/RU interface strings and source-name fallback behavior.
- [ ] Run hub tests and generated catalog checks; confirm pass.
- [ ] Commit as `feat: add multilingual atlas hub and coverage pages`.

### Task 8: Static build, no-photo checks, and GitHub Actions

**Files:**
- Modify: `package.json`, `package-lock.json`, `.gitignore`
- Create: `tsconfig.json`, `esbuild.config.mjs`
- Create: `tools/build_atlases.py`, `tools/check_no_animal_photos.py`
- Create: `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**
- `npm run build` emits `dist/atlas`, `dist/atlas.red-panda`, `dist/atlas.polar-bear`, and `dist/atlas.hippopotamus`.
- CI runs `npm ci`, lint/typecheck, Node and Python tests, canonical-data validation, no-photo scan, all-app build, and Playwright smoke at desktop/mobile viewport sizes.

- [ ] Add build-contract tests `test_all_paths_exist`, `test_runtime_payload_is_bounded`, and `test_build_is_independent_of_current_directory`; add no-photo tests `test_rejects_animal_photo_extensions` and `test_allows_generic_svg_fixture`.
- [ ] Run the tests and confirm the expected missing build/checker failures.
- [ ] Add dependency lock and reproducible TypeScript bundle build; copy only source, runtime indexes, interface assets, and docs to dist.
- [ ] Implement repository/release photo scanning for local `.jpg`, `.jpeg`, `.png`, and `.webp` files; fail on any occurrence. Check atlas references for local photo paths or embedded data URLs.
- [ ] Add GitHub Actions jobs for lint/typecheck, data and unit validation, no-photo, build-all, and Playwright smoke tests; do not retain build artifacts.
- [ ] Run all local tests and `npm run build`; record HTML/JS/CSS and runtime payload sizes.
- [ ] Commit as `ci: validate and build all atlas paths`.

### Task 9: Accessibility, browser review, and performance evidence

**Files:**
- Create: `tests/browser/atlas.spec.ts`
- Create: `tools/measure_release.py`
- Create: `docs/QA_REPORT.json`
- Optional local screenshots: `/tmp/animal-lineage-atlas-qa/` only; never commit photographs/screenshots containing remote animal imagery.

**Interfaces:**
- Browser smoke opens all four paths, checks search/direct profiles, language toggles, no-photo fallback, keyboard basics, desktop and mobile layouts, and JavaScript/network errors.
- Measurement reports bundle bytes, payload bytes, search timings, and SVG layout timings for representative family graphs.

- [ ] Write browser assertions for hub/cards, all child pages, representative direct profiles, profile state restoration, mobile layout, language switching, source links, and blocked remote images.
- [ ] Run browser tests locally or in GitHub Actions; inspect desktop 1440×1000 and mobile 390×844 screenshots with remote photos blocked.
- [ ] Fix defects revealed by visual/a11y/performance review; preserve reproducible reports and screenshot location outside Git.
- [ ] Run `python3 tools/measure_release.py dist`; save measured values into `docs/QA_REPORT.json`.
- [ ] Commit as `test: record atlas browser and performance evidence`.

### Task 10: Required documentation and release metadata

**Files:**
- Create: `README.md`
- Create: `docs/ARCHITECTURE.md`, `docs/MISSION_AND_SCOPE.md`, `docs/DATA_MODEL.md`, `docs/SOURCE_AND_EVIDENCE_POLICY.md`, `docs/MEDIA_AND_RIGHTS_POLICY.md`, `docs/OFFLINE_ARCHIVE_FUTURE.md`, `docs/RED_PANDA_MIGRATION.md`, `docs/POLAR_BEAR_SOURCES.md`, `docs/HIPPOPOTAMUS_SOURCES.md`, `docs/DEPLOYMENT_AND_ROLLBACK.md`, `docs/RELEASE_V1.md`, `docs/QA_REPORT.json`

**Interfaces:**
- Docs state the exact repo SHA, URLs, record/relationship counts, source scope/gaps, no-photo audit, checks/CI, legacy health, disk, release target, and rollback steps.
- Future offline format documents app build, data snapshot, local media manifest, original source URL, credit/rights, relative path, checksum, and archive status.

- [ ] Write doc-contract tests for required files and exact four paths; verify release counts are computed from canonical datasets.
- [ ] Add docs from verified implementation and research evidence; do not claim global completeness or unsupported translations.
- [ ] Run docs tests, all validators, `git diff --check`, and review all required documentation paths.
- [ ] Commit as `docs: document atlas scope, sources, and release`.

### Task 11: Independent release review and correction pass

**Files:** all changed files, reviewed through a fresh worktree diff and CI results.

**Interfaces:**
- A fresh reviewer reports findings grouped as data/provenance, schema/runtime, UX/accessibility, deployment/no-photo, and docs. The implementer verifies each finding against the brief and fixes supported findings.

- [ ] Request an independent GPT-6 Luna review of the complete diff and browser/data evidence.
- [ ] Inspect the Git diff and rerun every cited source/count/validator check; do not rely on the reviewer's success report alone.
- [ ] Fix findings with regression tests, then rerun full local CI and browser tests.
- [ ] Commit review fixes and update `docs/QA_REPORT.json`/release notes.

### Task 12: Push, deploy atomically, smoke test, and verify rollback

**Files:**
- Create: `tools/deploy_release.py`
- Create: `tools/rollback_release.py`
- Create: `tests/test_deploy_release.py`
- Production target: `/var/www/html/_animal-lineage-releases/<git-sha>/` and four required path symlinks

**Interfaces:**
- `deploy_release.py --root /var/www/html --dist dist --revision <sha>` stages an immutable release, validates its expected paths/no-photo policy, swaps each app symlink atomically, and writes a release manifest with the prior symlink targets.
- `rollback_release.py --root /var/www/html --manifest <release-manifest>` restores the four prior targets without touching `/red-panda/`.

- [ ] Write `test_deploy_uses_immutable_revision_directory`, `test_symlink_swap_is_atomic`, `test_rollback_restores_all_paths`, `test_deploy_refuses_to_touch_legacy_path`, and `test_deploy_rejects_photo_bundle` against a temporary root; verify failures first.
- [ ] Implement deployment and rollback using temporary symlinks plus atomic rename; preserve earlier releases and refuse unexpected existing non-symlink paths.
- [ ] Run deploy tests in a temporary directory and `nginx -t`; record free disk before staging.
- [ ] Push the reviewed branch, fast-forward/merge reviewed commits to GitHub `main`, and wait for CI.
- [ ] Compare GitHub `main` SHA with release manifest; use the already authorized production deployment command only after staging, photo scan, and tests pass.
- [ ] Run HTTP smoke for old `/red-panda/`, all four new paths, representative `?animal=` profile URLs, and static runtime payloads; check Nginx and disk status.
- [ ] Test rollback in a temporary directory, preserve production previous symlink targets, and verify public paths remain on the intended SHA.
- [ ] Write final counts/results/limitations/rollback location into release docs and commit, then redeploy that exact final GitHub `main` SHA if the docs commit changes deployed metadata.

## Plan self-review

- Spec coverage is assigned across Tasks 1–10; deployment/release is Task 12 and fresh review is Task 11.
- Failure modes in Review Focus have direct regression tests assigned to the owning tasks.
- Canonical types are validated before UI/build/deploy consume them; the static runtime is generated from canonical data.
- The plan keeps the source snapshot with no declared license out of runtime and reports the excluded legacy identifiers and counts.
- Production data and legacy route are protected by deployment tests that refuse the `/red-panda/` path and retain atomic rollback targets.
