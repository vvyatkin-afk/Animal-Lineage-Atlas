# Phase 5 Progress — Readable Genealogies and Identified Photos

Updated: 2026-10-20 UTC

## Scope and production baseline

Execution follows the user-authorized [Phase 5 brief](PHASE5_PHOTO_LAYOUT_BRIEF_20261021.md) on isolated branch `phase5/legible-tree-and-identified-photo-20261021`. Production remains on Phase 4 release `6dfdb34b26f8f8ee574e40cff6e9e661779a19a7`; its four Atlas routes and legacy `/red-panda/` were not changed during local implementation. The starting branch commit was `6ddcaf9995db87c08b56da0721f6c2ae5d8ca905`.

Phase 4 desktop/mobile captures and the live Bandit baseline are preserved with hashes in `reports/phase5/baseline/`. They show the original all-animal ribbon and record the prior rendered crossing and route-length measurements. The current Phase 5 local screenshots and hashes are in `reports/phase5/after/screenshot-manifest.json`.

## Delivered in the Phase 5 candidate

- The red-panda Atlas has 1,555 animals and 2,394 relationships. Simon is a separate Commons-identified Jerusalem Biblical Zoo individual; unsupported sex, status, dates and parentage remain unknown. Polar bear remains 72 animals/63 relationships; hippopotamus remains 96 animals/86 relationships.
- The global fit-all view is a two-dimensional family mosaic. It labels named families with animal counts, uses count-only tiles for small components, and shows a thumbnail only for an identified, rights-cleared animal. Selecting a tile opens that full connected component; zooming further shows the actual cards and relationships. Pan, zoom, country grouping, filters, keyboard selection, and mobile resize behavior are retained. All 1,555 red pandas and all 2,394 recorded relationships remain in the graph.
- Focused genealogies preserve their generation rows and exact IDs/edges. Every feasible biological mother/father candidate is ordered mother-left-of-father within its own child's family. Couple adjacency is a preference after exact rendered crossing count and route length; the optimizer does not create a global female-left/male-right split. The global optimizer has no sex-side restriction.
- The bounded deterministic optimizer scores actual renderer routes. Cubic routes are sampled into 24 segments; the exact segment/intersection and opposite-side polyline checks now use a 256-world-unit spatial grid to avoid testing disjoint segment boxes. Shared-endpoint edge pairs are excluded; solid and dashed relationships are included; route lengths use complete rendered centerlines. Node spacing and readable component bounds are retained. Search remains heuristic and does not claim a mathematical optimum.
- A 1,555-animal graph build measured 1,764 ms and 1,381 ms in two repeated Node samples on this VPS. The full Node suite also passed the existing under-2-second global-layout assertion. Chromium measured a 1,083 ms layout and 1,200 ms first render in its desktop full-graph performance case.

## Rendered-layout comparison

The current exact results and comparison to the Phase 4 production baseline are reproducible with `node --import tsx tools/measure_layout_phase5.mjs`. Full two-run samples and the measurement method are in `reports/phase5/after/layout-metrics.json`.

| Case | Animals / relationships | Crossings before → after | Route length before → after | Notes |
|---|---:|---:|---:|---|
| Red-panda all-animal graph | 1,554→1,555 / 2,394 | 42,931→42,570 (−361) | 4,662,636.83→4,607,479.37 (−55,157.46) | Fit-all is now a family mosaic; dimensions 23,502×6,924 world units |
| Largest family component | 823 / 1,468 | 31,352→30,872 (−480) | 3,163,209.23→3,113,627.99 (−49,581.24) | All records and edges kept |
| Futa focused, depth 3 | 100 / 100 | 6→5 (−1) | 102,548.13→102,207.86 (−340.27) | Four parent-pair candidates ordered 4/4; adjacent 2/4 |
| Futa focused, all known | 121 / 121 | 18→9 (−9) | 121,431.54→128,285.83 (+6,854.29) | Crossing-first objective accepts longer routes to remove nine crossings |
| Rakesh focused, depth 3 | 14 / 13 | 4→4 | 2,908.52→2,908.52 | Unchanged exact graph |
| Bandit focused, depth 3 | 15 / 15 | 2→2 | 3,960.49→3,960.49 | Seven parent-pair candidates ordered 7/7 and adjacent 6/7 |
| Bandit focused, all known | 68 / 89 | 181→96 (−85) | 57,769.02→45,487.25 (−12,281.77) | Thirty-six parent-pair candidates ordered 36/36 and adjacent 21/36 |

The one non-adjacent Bandit depth-3 candidate remains ordered correctly; adjacency is not forced if conflicting lineage geometry makes it infeasible. The mobile screenshot shows the selected descendant and its nearest generations at useful card size; wider ancestor rows remain available by pan/zoom.

## Photo identity, rights, and delivery

`reports/phase5/after/photo-source-audit.json` inventories every media record, per-species coverage, all 12 approved files, original and thumbnail URLs, creator credits, licenses, and identity decisions.

| Species | Animals | Media references | Rights-cleared photo records / named individuals | Link-only references |
|---|---:|---:|---:|---:|
| Red panda | 1,555 | 5,929 | 12 / 2 (Futa 10, Simon 2) | 5,917 |
| Polar bear | 72 | 5 | 0 / 0 | 5 |
| Hippopotamus | 96 | 1 | 0 / 0 | 1 |

Futa's ten photos are individually described as Futa at Chiba Zoological Park. Six are CC BY 4.0 by Misei sen and four are CC BY-SA 4.0 by KQuhen. Simon's two separately sourced Jerusalem Biblical Zoo images are CC BY-SA 3.0 by SuperJew and CC0 1.0 by Masha Gutman. The Commons file pages retain the evidence and clickable source/license links. Other named upstream records have no evidenced image reuse permission and stay source-page links/placeholders; generic red-panda photos are not mapped to individuals.

The browser requests each approved full-size original directly from `upload.wikimedia.org`; the Atlas server never fetches, relays, or caches a full-size image. Cards and family previews use Commons thumbnails directly. The optional relay accepts only explicitly approved Commons-generated 330×220 or 960×640 JPEG variants and caches them in process memory for five minutes, with a 32-entry/5 MiB cap; it writes no thumbnail files. No animal-photo binary is in Git or the static release; local-media manifests are empty. Chromium confirmed nonzero `naturalWidth` for all ten Futa originals, both Simon originals, and the verified Commons thumbnail previews.

## Local verification

- `npm test`: **86/86 passed**, including the full 1,555-animal/2,394-relationship layout-budget case, focused pair constraints, and exact crossing metric fixtures.
- `npm run test:python`: **105/105 passed**.
- `npm run validate:data`, `npm run validate:schema`, `npm run check:no-photos`, `npm run lint`, `npm run typecheck`, and `npm run build`: passed. The build emitted all four configured static paths.
- `npm run test:browser -- --workers=1`: **22/22 passed** in serial Chromium. Coverage includes the 1,555-record overview, mobile full-graph pan/zoom, Bandit desktop/mobile, all four Atlas routes, Futa's ten direct-loaded originals, Simon's direct-loaded images, rights/source links, failure fallback, and viewport/memory measurements.
- Independent layout and source reviews found and resolved two issues before this run: mobile focused graphs now recompute their frame on resize, and pair adjacency candidates are restricted to focused mode so global order remains sex-unconstrained.
- Nine hash-registered after screenshots are in `reports/phase5/after/`, including desktop/mobile overview, a selected global component at card zoom, Bandit focus, Futa's profile, and Simon's profile.

## Acceptance and release tracking

- [x] Preserve Phase 4 baseline captures/metrics; add Phase 5 desktop/mobile captures with hashes.
- [x] Keep every canonical red-panda node/relationship, preserve the other species totals, and provide a 2D all-family overview with true component/card zoom levels.
- [x] Enforce focused mother-left-of-father precedence per feasible child pair without globally separating sexes; retain true IDs/edges and report measured crossings.
- [x] Reduce exact rendered crossings in the full red-panda graph, largest component, Futa focused cases, and Bandit all-known case; publish lengths including the Futa all-known increase.
- [x] Embed only individually identified/rights-cleared photos, load originals directly in Chromium, expose per-file credits/licenses/sources, and keep all unverified records link-only.
- [x] Pass full local data, Python, Node, lint, type, build, no-photo, and serial browser checks; complete independent reviews.
- [x] Push the branch and open Phase 5 PR [#11](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/pull/11).
- [x] GitHub Atlas CI run [39467295994](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/39467295994) passed on PR head `fdefeb479a2df21009d2c06b4ede3fd26dbfb4cc`.
- [ ] Merge the reviewed PR head after its current post-evidence-update CI run passes.
- [ ] Deploy all four Atlas routes atomically with a recorded rollback manifest; smoke-test them and confirm `/red-panda/` and unrelated projects remain unchanged.
- [ ] Write final production SHA, public route URLs, CI evidence, deployment manifest, and verified rollback commands to `docs/PHASE5_RELEASE.md`.

Production is still on Phase 4 until merge, deploy and live-smoke steps are complete. First Phase 5 branch commit: `6ddcaf9995db87c08b56da0721f6c2ae5d8ca905`. Phase 5 implementation commit: `42ada5f883f8950493a9d0215cb9254b24c95d60`. Evidence update: `b5b019e`. CI run `39467295994` passed at 2026-10-20 17:35 UTC on head `fdefeb479a2df21009d2c06b4ede3fd26dbfb4cc`; the progress update adding that result starts a new CI run before merge.
