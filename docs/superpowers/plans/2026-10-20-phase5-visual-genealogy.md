# Phase 5 Visual Genealogy and Identified Photos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make focused pedigrees locally pair parents with mother left of father, replace the fit-all ribbon with a navigable multi-scale family map, and show browser-direct photographs only when individual identity and external use rights are evidenced.

**Architecture:** Preserve canonical animals and relationship records. Improve deterministic layered ordering and 2D packing in the genealogy package; render a family/clan overview at far zoom and cards plus actual edge routes at close zoom. Extend the existing rights-aware media resolver and profile gallery to load approved source URLs directly in the browser, retaining attribution and source-only links for all uncleared references.

**Tech Stack:** TypeScript, Node.js, Python atlas tooling, Playwright Chromium, GitHub Actions, existing static release/deploy/rollback helpers.

**Spec:** `docs/PHASE5_PHOTO_LAYOUT_BRIEF_20261021.md`

## Global Constraints

- The complete red-panda Atlas retains 1,554 canonical animals and 2,394 relationships; no records or true edges are dropped or duplicated.
- Focused layouts constrain each feasible child's biological mother to the left of that child's biological father; global layouts apply no sex-side rule.
- Actual rendered-route crossings are minimized first and actual rendered-route centerline length second; measurements include solid and dashed edges and exclude edge pairs sharing an animal endpoint.
- Generation levels stay topologically valid; do not use force-directed movement between generations.
- Full-size photos load from permitted original HTTPS source hosts in the browser; no full-size photo is copied to the server or static release.
- Rehost or cache only thumbnails with explicit documented rights; source links remain for media without embedding permission.
- Preserve `/red-panda/` byte-for-byte and leave other project worktrees untouched.
- Keep production on Phase 4 until review, CI, release manifest, and smoke checks pass; retain immutable releases and use the checked rollback helper on failure.

## Review Focus

- Conflicting co-parent constraints or multiple candidate parents — deterministic feasible ordering and truthful violation metrics.
- Shared ancestry/pedigree collapse — one canonical node per animal and every real edge retained.
- Isolated records, disconnected families, and mixed-generation component sizes — deterministic non-overlapping 2D packing and legible family summaries.
- Narrow viewport, repeated zoom/pan, and filtered families — correct viewport culling, fit, keyboard/touch interaction, and no regressions.
- Missing, broken, ambiguous-identity, or uncleared media — source-only fallback; no accidental external image request or false confirmed-photo state.

---

### Task 1: Establish reproducible Phase 5 baseline and source evidence

**Files:**
- Create: `reports/phase5/baseline/layout-metrics.json`
- Create: `reports/phase5/baseline/screenshot-manifest.json`
- Create: `reports/phase5/baseline/bandit-focus-1440x900.png`
- Create: `reports/phase5/baseline/bandit-focus-390x844.png`
- Modify: `tools/measure_layout_phase4.mjs` or a new Phase 5 measurement tool
- Modify: `tools/capture_phase4_screenshots.mjs` or a new Phase 5 capture tool
- Modify: `docs/PHASE5_PROGRESS.md`

**Interfaces:**
- Consumes: canonical Atlas JSON, current Phase 4 renderer route metrics, and the Phase 4 after screenshot set.
- Produces: repeatable baseline measurements for Futa, Rakesh, Bandit, largest component, and all red pandas; endpoint and viewport evidence.

- [x] Confirm production Atlas and `/red-panda/` HTTP status; verify baseline captures match deployed UI revision.
- [x] Add Bandit depth-3/all-known rendered-route metrics and desktop/mobile screenshots using one Chromium process.
- [x] Record animal/edge counts, 24-segment crossing pairs, route lengths, collisions, bounds, capture hashes, and repeatability.
- [x] Update `docs/PHASE5_PROGRESS.md` with verified baseline and photo-source audit.

### Task 2: Optimize pairwise focused ordering and compact family coordinates

**Files:**
- Modify: `packages/genealogy/optimizer.ts`
- Modify: `packages/genealogy/layout.ts`
- Modify: `tests/genealogy.test.mjs`
- Modify: `tools/measure_layout_phase4.mjs` or Phase 5 measurement tool

**Interfaces:**
- Consumes: `GenerationRow[]`, `GraphEdge[]`, and positioned `GraphNode` records.
- Produces: deterministic within-generation order and x coordinates; exact violation, crossing, and rendered-length metrics.

- [ ] Add tests for distinct couples at every ancestor level, siblings, multiple partners, shared ancestors, missing genders, input permutation, impossible parent constraints, and no global sex partition.
- [ ] Confirm no-avoidable-crossing tree fixtures and that a lower-crossing candidate wins over a shorter higher-crossing candidate.
- [ ] Implement deterministic couple-local precedence, couple-spacing tie-breaks, and bounded within-row coordinate improvement with minimum card spacing.
- [ ] Run focused fixtures and full red-panda baseline cases; preserve exact animal IDs, edge endpoints, and generations.

### Task 3: Tile global families in 2D and render useful levels of detail

**Files:**
- Modify: `packages/genealogy/layout.ts`
- Modify: `packages/ui/global-genealogy-view.ts`
- Modify: `packages/i18n/*` as required for visible labels
- Modify: `tests/genealogy.test.mjs`
- Modify: `tests/ui-contract.test.mjs`
- Modify: relevant stylesheet(s)

**Interfaces:**
- Consumes: fully populated `GenealogyGraph` and existing global pan/zoom/filter state.
- Produces: non-overlapping deterministic family tiles, family summary geometry, generation guides, and visible animal cards at close zoom.

- [ ] Add deterministic layout tests for a large component plus many small/disconnected components, preserving exact node and edge sets and non-overlapping component bounds.
- [ ] Replace one-axis component packing with bounded 2D family-tile placement; leave country filtering semantic and keep cross-country descendants in one lineage.
- [ ] Add far-zoom family aggregate summaries and click-to-zoom/family focus while retaining all animals and relationships in the complete graph.
- [ ] Keep medium-zoom family separation/generation levels and near-zoom cards/edges; verify desktop/mobile pan, fit, keyboard, and touch behavior.
- [ ] Benchmark 1,554 animals / 2,394 edges and report actual rendered route metrics separately from summary-map geometry.

### Task 4: Render approved identified images directly from source

**Files:**
- Modify: `packages/media/resolver.ts`
- Modify: `packages/ui/profile-dialog.ts`
- Modify: `packages/ui/global-genealogy-view.ts`
- Modify: `atlases/red-panda/atlas.json` only for individually evidenced records
- Modify: `packages/media/approved-media-v1.json` only if required for public attribution/variants
- Modify: `tests/search-media.test.mjs`, `tests/media-relay.test.mjs`, and/or UI tests
- Create: `reports/phase5/photo-coverage.json`

**Interfaces:**
- Consumes: per-animal media reference with canonical animal ID, original HTTPS URL, source page, license, creator, rights, identity confidence, and embedding state.
- Produces: browser-direct `<img>` URLs for allowed references, visibly attributed gallery/profile cards, and source-only fallback otherwise.

- [ ] Recheck upstream export version and terms; test candidate individual photo pages using metadata only (no photo downloads).
- [ ] Add direct-original and allowed thumbnail metadata only for files with per-file reuse rights, credit, and unambiguous identity evidence.
- [ ] Add gallery attribution, source click-through, responsive/lazy loading, and fallback; retain approved Futa relay as fallback where needed.
- [ ] Confirm no full-size image or uncleared thumbnail binaries enter git, static build, or server cache.
- [ ] Record photo coverage by species and direct/thumbnail/source-only state without overstating identity.

### Task 5: Visual QA, independent review, CI, and safe release

**Files:**
- Create: `reports/phase5/after/layout-metrics.json`
- Create: `reports/phase5/after/screenshot-manifest.json`
- Create: `docs/PHASE5_RELEASE.md`
- Modify: `docs/PHASE5_PROGRESS.md`
- Update: approved tests, capture scripts, and no-photo scanner manifest as needed

**Interfaces:**
- Consumes: finished layout, photo metadata, build output, and release/rollback helpers.
- Produces: independently reviewed merge tree, CI result, deployed SHA, live smoke evidence, and rollback record.

- [ ] Run deterministic metrics twice; capture before/after desktop and mobile for all required views, plus actual image natural dimensions and page errors.
- [ ] Run serial full verification: Node/Python tests, data/schema checks, lint, typecheck, build, no-photo scan, Playwright.
- [ ] Obtain independent read-only review; correct findings and rerun affected verification.
- [ ] Commit and push progress in milestones; open PR, wait for green CI and review, merge exact reviewed tree.
- [ ] Record current release targets, legacy manifest, and rollback manifest before deployment; deploy atomically only after checks pass.
- [ ] Verify all four Atlas URLs and `/red-panda/`, live Chromium behavior, photo source requests, and legacy byte digest; rollback immediately if smoke checks fail.
- [ ] Complete release and progress docs with before/after crossings, route lengths, screenshots, photo-source coverage, CI, deployment and rollback commands.
