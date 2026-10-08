# Red Panda Upstream Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 83-record red-panda runtime atlas with one canonical animals array containing every current upstream panda profile and every unique curated animal, with deterministic provenance-preserving matching.

**Architecture:** Preserve the current 83-record atlas as a stable curated input. A Python merger accepts an upstream JSON object and snapshot metadata, maps all profile IDs, merges only explicit ID matches or unique exact name/zoo/birth/parent matches, and emits the canonical atlas plus a complete JSON audit report. A sync entry point fetches the README-linked JSON and GitHub commit metadata, then calls the same pure merger; tests use local fixtures and never depend on the network.

**Tech Stack:** Python 3 standard library, existing Atlas JSON Schema validator, `unittest`.

**Spec:** `/home/codex/projects/Animal-Lineage-Atlas/PHASE2_EXPAND_GLOBAL_DATASETS.md`, red-panda sections A, D, E, G, and L.

## Global Constraints

- Work only in `.worktrees/phase2-red-panda` on `phase2/red-panda`.
- Keep the legacy `/red-panda/`, shared schema/UI, other species, and shared release documents untouched.
- Keep one canonical `atlases/red-panda/atlas.json` with one `animals` array.
- Preserve source-linked curated facts and retain upstream conflicts as alternate claims or disputed relationships.
- Never merge ambiguous identities or materialize upstream `none` markers as animals.
- Store no upstream image bytes or local paths; retain only attributable source-page and direct-remote URL metadata as link-only with no embedding.
- Report the exact export URL, retrieval time, current repo SHA, export-embedded SHA, raw JSON SHA-256, source counts, ID maps, conflicts, ambiguities, exclusions, and dropped media/path fields.
- Do not install dependencies; inspect available disk space before creating artifacts.

## Review Focus

- Two curated or upstream pandas sharing name and birth data remain separate when zoo or known parents differ; test exact composite matching.
- Multiple candidates for the full composite never auto-merge; test ambiguous candidates remain separate.
- Family edge direction is child-to-parent in the export; test Atlas links point parent-to-child.
- `none` markers and a self-edge never create animals or self-parent relationships; test all raw edges receive an audit status.
- Local image identifiers and paths do not survive canonical generation, while allowed remote URL metadata remains link-only; test URL policy and strip counts.

---

### Task 1: Deterministic merge core

**Files:**
- Create: `tools/import/merge_red_panda_upstream.py`
- Create: `tests/test_red_panda_upstream_merge.py`
- Modify: `atlases/red-panda/atlas.json` only when running the completed tool

**Interfaces:**
- Consumes: a parsed upstream export, curated Atlas object, and immutable snapshot metadata.
- Produces: `merge_red_panda(upstream: dict, curated: dict, snapshot: dict) -> tuple[dict, dict]`, returning canonical Atlas and full machine-readable merge report.

- [x] **Step 1: Write failing tests** for complete ID mapping, exact unique composite matching, ambiguous candidate retention, curated/upstream conflict preservation, child-to-parent edge inversion, unknown-marker/self-edge exclusions, deterministic IDs, and photo/path handling.
- [x] **Step 2: Run** `python3 -m unittest tests.test_red_panda_upstream_merge -v`; confirm failures report missing merge behavior.
- [x] **Step 3: Implement** the pure transformation and audit report using stable IDs, source-linked claims, Atlas relationships/events/institutions/media, and edge-by-edge statuses.
- [x] **Step 4: Run** the focused unit tests and confirm all pass.

### Task 2: Reproducible upstream sync and canonical generation

**Files:**
- Create: `tools/import/sync_red_panda_upstream.py`
- Create: `atlases/red-panda/curated-atlas.json`
- Create: `atlases/red-panda/upstream_sync_report.json`
- Modify: `atlases/red-panda/atlas.json`

**Interfaces:**
- Consumes: the merge core from Task 1 and snapshot metadata gathered by HTTP fetch or supplied by an offline input file.
- Produces: an offline-testable CLI that fetches the exact README-linked export by default, records current GitHub `master` commit metadata, and writes the canonical atlas/report only after validation succeeds.

- [x] **Step 1: Add failing CLI tests** for explicit local JSON input, raw hash recording, missing/malformed snapshot metadata rejection, and no network access in fixture mode.
- [x] **Step 2: Run** `python3 -m unittest tests.test_red_panda_upstream_merge -v`; confirm the new CLI tests fail because the sync entry point is absent.
- [x] **Step 3: Implement** download/metadata handling, preserve the original 83-record atlas as the curated input, and apply the reviewed current export without committing the raw 10 MB source file.
- [x] **Step 4: Run** the focused tests, Atlas schema validator, and no-animal-photo check against the generated canonical atlas.

### Task 3: Red panda provenance and source policy documentation

**Files:**
- Modify: `docs/RED_PANDA_MIGRATION.md`
- Create: `docs/RED_PANDA_UPSTREAM_SYNC.md`
- Modify: `atlases/red-panda/upstream_sync_report.json`

**Interfaces:**
- Consumes: generated report and canonical atlas from Task 2.
- Produces: instructions for refreshing from the exact upstream source, license/provenance statement, current counts, attribution, exclusions, and media handling.

- [x] **Step 1: Add documentation-contract assertions** for the export URL, retrieval timestamp/hash, current repo and export commits, no explicit license, one canonical animals array, and no-photo policy.
- [x] **Step 2: Run** the documentation-contract tests and confirm the new sync document is missing.
- [x] **Step 3: Write** concise red-panda migration and refresh docs grounded in the generated report.
- [x] **Step 4: Run** focused Python tests, docs tests, schema validation, and no-photo validation; review branch diff for out-of-scope paths.
- [x] **Step 5: Commit** the red-panda merge, tools, report, tests, and documentation on `phase2/red-panda`.



## Verification note

Focused Python checks, custom atlas validation, no-photo validation, the direct-URL UI contract, and `git diff --check` pass. The current isolated worktree's JSON Schema validation rejects the newly required `source.tier` property because this branch's schema predates the integration enum; the parent integration branch supplies that schema change.
