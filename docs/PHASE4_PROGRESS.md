# Phase 4 Progress

Updated: 2026-10-20 12:12 UTC

## Approved scope and baseline

Execution follows the approved [Phase 4 brief](PHASE4_LAYOUT_MEDIA_BRIEF_20261020.md) in the isolated branch worktree. Baseline production release: 5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed. Current feature branch starts from c030628; origin/main at start is 293876d14411b3ffb8d7400da9688174165ca243.

All four approved production URLs returned HTTP 200 before changes: [hub](http://204.168.161.237/atlas/), [red panda](http://204.168.161.237/atlas.red-panda/), [polar bear](http://204.168.161.237/atlas.polar-bear/), and [hippopotamus](http://204.168.161.237/atlas.hippopotamus/). No production files or routes have been changed.

Baseline Chromium screenshots were captured from production at 1440×900 and 390×844 in reports/phase4/baseline/. The set includes Futa and Rakesh focused trees, Futa's current profile fallback, the largest-family initial view and fit-all red-panda graph, and the polar-bear and hippo graphs. There were zero browser page errors. Screenshot hashes and capture details are in baseline/screenshot-manifest.json.

The initial geometry report is reports/phase4/baseline/layout-metrics.json. It samples the cubic routes used by the live renderer into 24 segments and counts transverse curve crossings once per edge pair, excluding tangencies and pairs with a shared animal endpoint. Solid and dashed routes are both included. Baseline:

| View | Nodes | Edges | Crossing pairs | Rendered route length |
|---|---:|---:|---:|---:|
| Futa focused, 3 generations | 100 | 100 | 277 | 126,772.03 |
| Futa focused, all known | 121 | 121 | 286 | 142,595.56 |
| Rakesh focused, 3 generations | 14 | 13 | 10 | 4,049.75 |
| Red panda largest component | 823 | 1,468 | 35,210 | 3,428,194.25 |
| Red panda all animals | 1,554 | 2,394 | 48,041 | 5,472,576.87 |
| Polar bear all animals | 72 | 63 | 33 | 16,217.28 |
| Hippo all animals | 96 | 86 | 39 | 27,100.89 |

The baseline has no node overlaps or generation-order violations. The full red-panda graph has 4,080 edge/node collision pairs. Measurements use world-coordinate centerlines; dash gaps do not alter crossing or length totals. This report is a bounded heuristic baseline, not a claim of exact global optimality.

## Media rights investigation

At the Phase 4 baseline, the production atlases contained zero media records, so the existing resolver had no image to display. A newly verified Futa image is available from Wikimedia Commons: File:Futa 20261004 3.jpg, by Misei sen, CC BY 4.0. The file page identifies the subject in Japanese as Chiba City Zoo's Futa, and Chiba Zoo's official 2026 page identifies Futa and says he will turn 23 on 2026-07-05. Required attribution is photographer credit, license link, and notice of changes. Sources: [Commons file/license](https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg) and [Chiba City Zoo 23rd-birthday page](https://www.city.chiba.jp/zoo/event/0705futabirthday.html). No image bytes have been downloaded or stored. Rights for additional red pandas, polar bears, and hippos remain under review; unverified records stay link-only.

Phase 4 rechecked the Commons source on 2026-10-20 and confirmed the two published thumbnail variants respond as JPEG: 330×220 at 39,751 bytes and 960×640 at 247,773 bytes. The approved server manifest caps them at 65,536 and 393,216 bytes respectively. The client receives only an opaque ID, fixed variant names, and attribution metadata; direct fetch URLs remain out of static builds. The profile and visible genealogy cards display Misei sen and CC BY 4.0; the profile links the source page and license and states that no changes were made. The client attribution test uses a generic non-animal SVG fixture. Task 5 also relayed both real variants from Wikimedia through the service in memory and verified JPEG type, exact byte count, and dimensions; no image body was written to disk.

## Layout optimizer checkpoint

The optimizer keeps generation rows, IDs, and relationship records fixed. Focused mode enforces mother-left/father-right using stable precedence ordering; contradictory constraints terminate deterministically and report the violations that cannot be satisfied together. Global mode has no sex-side constraint. The family view optimizes each relationship-connected component as a block, including its social edges, to avoid creating crossings between unrelated groups.

For interactive performance, candidate search on a global graph above 500 nodes uses generation-span inversion counts and sampled route length. Exact rendered-route crossings are measured for the resulting release layout; exact crossing counts choose among candidates for focused and smaller global graphs. The 1,554-node global red-panda build completes in about 0.95 seconds, and a 5,000-node row-only fixture in about 0.22 seconds. This is a bounded heuristic, not a global-optimality claim.

| View | Baseline crossings | After crossings | Change | Baseline route length | After route length | Change |
|---|---:|---:|---:|---:|---:|---:|
| Red panda, all 1,554 animals | 48,041 | 43,050 | −10.4% | 5,472,576.87 | 4,657,060.61 | −14.9% |
| Red panda, largest 823-animal component | 35,210 | 31,352 | −11.0% | 3,428,194.25 | 3,163,209.23 | −7.7% |
| Futa focused, depth 3 | 277 | 6 | −97.8% | 126,772.03 | 102,548.13 | −19.1% |
| Futa focused, all known | 286 | 18 | −93.7% | 142,595.56 | 121,431.54 | −14.8% |
| Rakesh focused, depth 3 | 10 | 4 | −60.0% | 4,049.75 | 2,908.52 | −28.2% |
| Polar bear, all | 33 | 28 | −15.2% | 16,217.28 | 15,820.18 | −2.4% |
| Hippopotamus, all | 39 | 35 | −10.3% | 27,100.89 | 26,477.58 | −2.3% |

These measurements use 24-segment renderer curves, transverse-intersection rules, shared-endpoint exclusions, and full centerline lengths. The optimized cases have no node overlaps, generation-order violations, or focused parent-side violations. Interim machine-readable output: `/tmp/phase4-after-layout-metrics.json`. Task 6 will commit the reproducible after report and screenshot comparisons.

## Milestones

- [x] Read the full approved brief and media-rights policy.
- [x] Capture production baseline screenshots and graph metrics before implementation.
- [x] Prepare bounded architecture and test-first implementation tasks in docs/superpowers/plans/2026-10-20-phase4-layout-media.md.
- [x] Implement shared rendered-route metrics; 57/57 Node tests and TypeScript checks pass. The expected-red log and API-missing failure are recorded in the ignored SDD ledger.
- [x] Implement deterministic focused/global layout optimization; 27/27 genealogy tests and TypeScript checks pass.
- [x] Add focused-only parent ordering, regression fixtures, and opt-in diagnostics. The panel is hidden by default and enabled only with `layoutDiagnostics=1`; focused views show mother/father side violations, while global views say parent-side ordering is unconstrained. `npm run build`, the UI contract tests (11/11), and serial Playwright suite (18/18) pass. A mobile canvas test pixel probe was updated to tolerate antialiasing at the full-graph fit scale.
- [x] Add verified Futa media metadata and same-origin profile/gallery/tree-card references; profile tests support multiple approved images. The actual relay service and production path are Task 5.
- [x] Add a hash-manifest-only screenshot exception to the no-photo scanner. All 14 baseline PNGs are individually listed under the required baseline capture directory; modified, unlisted, or out-of-scope images still fail the scan.
- [x] Implement the loopback-only HTTPS image relay, with fixed-ID lookup, DNS pinning and all-answer validation, same-host redirects, byte and image-dimension checks, MIME sniffing, rate/concurrency limits, memory-only cache, ETags, and generic failure responses. Node 20.19 exposed a live integration bug: its network lookup callback requested the `all` form; the pinned callback now handles both documented signatures. The official [Node 20.19 DNS docs](https://nodejs.org/download/release/v20.19.0/docs/api/dns.html) describe that callback difference.
- [x] Stage full relay code and allowlist under `/var/lib/animal-lineage-atlas`, outside Nginx's document root. Release manifests record previous relay targets and enablement; failed activation restores the prior service state. Rollback also restores the four Atlas symlinks and stops/disables the service when no earlier relay existed.
- [x] Add a reversible Nginx manager. It inserts one include into the existing Atlas server block, saves a mode-0700 backup, validates and reloads, and restores only when installed file hashes still match. It does not rewrite any `/red-panda/` location.
- [x] Focused relay tests pass (8/8); deploy/rollback, Nginx manager, and screenshot-scanner Python tests pass (29/29); ESLint passes. Live in-memory service verification returned 330×220 JPEG (39,751 bytes) and 960×640 JPEG (247,773 bytes). Production Nginx/service installation remains for the release phase.
- [ ] Run serial browser and full Node/Python/schema/lint/type checks; capture before/after comparisons.
- [ ] Complete independent review and green GitHub CI; push and merge reviewed commits.
- [ ] Back up release state, deploy the four Atlas paths and relay integration, verify image HTTP bytes and Chromium rendering, and record rollback evidence.
- [ ] Confirm legacy /red-panda/ unchanged and publish docs/PHASE4_RELEASE.md.
