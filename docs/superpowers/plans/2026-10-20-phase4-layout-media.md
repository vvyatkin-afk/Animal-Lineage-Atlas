# Phase 4 Pedigree Layout and Licensed Media Implementation Plan

> For agentic workers: use the executing-plans workflow for this approved plan. Work task by task with test-first changes and small commits.

**Goal:** Ship a deterministic layered pedigree optimizer with measured rendered-route geometry and a secure same-origin relay for explicitly redistributable animal images.

**Architecture:** Keep canonical animal and relationship records unchanged. Share route geometry between the renderers and metrics; optimize only horizontal positions in fixed generation rows, with maternal-left/paternal-right enforced only in focused layouts. Load a versioned, rights-reviewed media manifest in the UI and a bounded Node relay that resolves opaque IDs from the same manifest; keep image bytes in memory only.

**Tech Stack:** TypeScript, Node.js 20, existing Python build and release tooling, Playwright Chromium, Nginx, systemd.

**Spec:** docs/PHASE4_LAYOUT_MEDIA_BRIEF_20261020.md

## Global Constraints

- Preserve every animal, relationship, source claim, and uncertainty; baseline corpus is 1,554 red pandas / 2,394 relationships, 72 polar bears / 63 relationships, and 96 hippos / 86 relationships.
- Keep generation rows fixed; crossing count is the primary objective, then rendered route length, width, and stable movement.
- Apply mother-left/father-right to focused pedigrees only; impose no parent-sex side constraint on the global graph.
- Do not duplicate individuals or drop/redirect edges to manufacture zero crossings; bound the heuristic and report unavoidable crossings.
- Ship no local animal-photo files or image cache. Relay only manifest-approved media with verified identity and redistribution rights.
- Keep the legacy /red-panda/ route byte-for-byte unchanged; production scope is the four new Atlas paths.
- Validate redirects and DNS/IP on every hop, bound bytes and time, sniff MIME and image headers, forward no credentials, and use memory-only caching.
- Run browser workers serially and keep build/test memory within the 4 GB host limit.
- Do not switch production paths until QA, review, CI, and rollback evidence are ready.

## Review Focus

- Multiple mating and pedigree collapse can make the focused side constraint infeasible; test shared ancestors and preserve unique IDs and every edge.
- Biological parent edges can span non-adjacent generations; test depth and row assignment across all known levels.
- Global grouping must not gain a hidden sex-side rule; test a global fixture whose best order conflicts with focused parent-side order.
- Curve crossings and route lengths must match the renderer for solid and dashed relation styles; test endpoint exclusions and social curves.
- Relay inputs and upstream behavior are untrusted; test unknown IDs, redirects to private hosts, DNS answers, byte caps, content-type/magic mismatches, timeout, and cache behavior.

---

### Task 1: Shared rendered routes and measurable layout metrics

**Files:**
- Create: packages/genealogy/edge-route.ts
- Create: packages/genealogy/metrics.ts
- Modify: packages/ui/genealogy-view.ts
- Modify: packages/ui/global-genealogy-view.ts
- Test: tests/genealogy.test.mjs

**Interfaces:**
- Produce routeGenealogyEdge(edge, nodesById, mode), returning the renderer's control points and sampled polyline or null.
- Produce measureGenealogyGraph(graph, mode), reporting route crossings, sampled route length, node overlaps, edge-node collisions, generation violations, parent-order violations, and bounds.

- [x] Add tests for cubic and social routes, shared-endpoint exclusions, dashed-edge inclusion, node collisions, and mother/father ordering.
- [x] Run the focused tests and confirm the missing metric API fails for the expected reason.
- [x] Implement shared route construction and measurements, then use the same route function in both renderers.
- [x] Run the focused tests and current UI contract tests.
- [x] Commit the metric/route change.

### Task 2: Deterministic layered layout optimizer

**Files:**
- Create: packages/genealogy/optimizer.ts
- Modify: packages/genealogy/layout.ts
- Modify: tests/genealogy.test.mjs

**Interfaces:**
- Produce optimizeGenerationRows(rows, edges, nodesById, mode, options), preserving the input generations and animal IDs.
- Focus mode uses alternating barycenter/median sweeps, bounded adjacent swaps, mother-left/father-right constraints, and exact rendered-route crossing evaluation for accepted candidates.
- Global mode uses the same crossing-first objective with no parent-sex ordering; country grouping remains an explicit view choice.
- Route-length refinement runs only among layouts with the best crossing count; horizontal spacing remains non-overlapping and width/movement break ties.

- [ ] Add failing tests for zero-crossing feasible pedigrees, shared ancestors, related/polygamous conflict, deterministic output, and no global sex-side enforcement.
- [ ] Run the focused tests and verify they fail before implementation.
- [ ] Implement bounded sweeps, local swaps, and horizontal compaction without changing relationship records.
- [ ] Run genealogy tests and the 5,000-record scale fixture.
- [ ] Commit the optimizer change.

### Task 3: Focused/global UI diagnostics and tree rendering

**Files:**
- Modify: packages/ui/genealogy-view.ts
- Modify: packages/ui/global-genealogy-view.ts
- Modify: apps/atlas/main.ts
- Modify: apps/atlas/styles.css
- Modify: packages/i18n/messages.json
- Test: tests/browser/atlas.spec.ts
- Test: tests/ui-contract.test.mjs

**Interfaces:**
- Add diagnostics behind the explicit layoutDiagnostics=1 query flag; display measured crossings, route length, generation width, and focused parent-side violations.
- Preserve pan/zoom, hit testing, virtualization, relation colors, confidence dashes, and the default uncluttered UI.

- [ ] Add failing browser tests for focused mother-left/father-right, no global ordering, diagnostic visibility, and hidden-by-default behavior.
- [ ] Run the affected browser tests and confirm expected failures.
- [ ] Implement the diagnostics and rerender the optimized row positions.
- [ ] Run desktop and mobile browser cases serially and capture the same baseline cases.
- [ ] Commit the UI change.

### Task 4: Rights-reviewed media metadata and profile/gallery integration

**Files:**
- Create: packages/media/approved-media-v1.json
- Modify: packages/media/resolver.ts
- Modify: apps/atlas/main.ts
- Modify: packages/ui/profile-dialog.ts
- Modify: packages/ui/global-genealogy-view.ts
- Modify: tools/build_atlases.py
- Modify: packages/i18n/messages.json
- Test: tests/search-media.test.mjs
- Test: tests/browser/atlas.spec.ts

**Interfaces:**
- Each approved item has an opaque ID, verified animal ID/confidence, page and direct HTTPS URLs, creator/credit, license/version/terms, rights status, checked date, MIME/size limits, and fixed thumb/profile variants.
- The UI builds same-origin URLs from the Atlas base path and opaque ID; profile attribution links to the original page and license.
- Futa's 2026 Commons image may be used only with CC BY 4.0 attribution; other items remain link-only until independently verified.

- [ ] Add failing resolver and profile tests for approved relay IDs, attribution, multiple images, and honest link-only fallback.
- [ ] Run the focused tests and confirm they fail for missing manifest behavior.
- [ ] Implement the manifest load and same-origin image references; add a small avatar only to visible detail cards.
- [ ] Run media and browser tests at desktop/mobile sizes.
- [ ] Commit the metadata/UI change.

### Task 5: Secure media relay and operational integration

**Files:**
- Create: packages/media/relay-server.mjs
- Create: deploy/animal-atlas-media.service
- Create: deploy/nginx/atlas-media-relay.conf
- Modify: tools/deploy_release.py
- Modify: tools/rollback_release.py
- Modify: tools/check_no_animal_photos.py
- Modify: docs/MEDIA_AND_RIGHTS_POLICY.md
- Modify: docs/DEPLOYMENT_AND_ROLLBACK.md
- Test: tests/media-relay.test.mjs
- Test: tests/test_deploy_release.py
- Test: tests/test_no_animal_photos.py

**Interfaces:**
- The loopback-only HTTP service accepts GET /media/:opaque-id/:variant and performs fixed-manifest HTTPS retrieval with bounded redirects, DNS/IP validation, byte and timeout limits, image sniffing/dimension validation, rate limits, memory-only caching, ETag, and safe 4xx/5xx fallbacks.
- Nginx exposes only the same-origin Atlas media paths and relays client IP only through a trusted loopback proxy configuration.
- Release and rollback helpers record and restore the service/config activation state without touching legacy /red-panda/.

- [ ] Add failing endpoint tests for 200 image bytes and MIME, 404 bogus IDs, blocked hosts/redirects, over-size and bad-magic responses, and ETag/memory cache.
- [ ] Add failing deployment tests for rollback-safe service release metadata and scanner allowlisting for only hashed screenshot artifacts.
- [ ] Run the focused tests and verify each security case fails before implementation.
- [ ] Implement the service, tests, service unit, scoped Nginx snippet, deploy/rollback tracking, and policy documentation.
- [ ] Run all server/deployment tests and the no-photo scan.
- [ ] Commit the relay and operational change.

### Task 6: Full Phase 4 validation, review, CI, and release

**Files:**
- Modify: tools/measure_release.py
- Create: tools/measure_layout_phase4.mjs
- Create: reports/phase4/after/layout-metrics.json
- Create: reports/phase4/comparisons/
- Create: docs/PHASE4_PROGRESS.md
- Create: docs/PHASE4_RELEASE.md
- Modify: .github/workflows/ as needed

- [ ] Add reproducible post-change metric and screenshot capture on the same deterministic cases.
- [ ] Verify Node, Python, lint, typecheck, data/schema, build, no-photo scan, and serial desktop/mobile browser suites.
- [ ] Compare baseline and optimized screenshots/metrics, report objective crossing and length changes, and document residual causes.
- [ ] Obtain independent read-only review and green GitHub CI; fix Critical/Important findings before merge.
- [ ] Back up the active manifest and verify rollback targets, deploy only the four Atlas paths plus the approved relay integration, and smoke test actual image bytes in production Chromium.
- [ ] Verify the legacy path hashes, service health, all URLs, rollback readiness, and final release SHA; update the release record and commit.
