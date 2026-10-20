# Phase 4 Progress

Updated: 2026-10-20 11:18 UTC

## Approved scope and baseline

Execution follows the approved [Phase 4 brief](PHASE4_LAYOUT_MEDIA_BRIEF_20261020.md) in the isolated branch worktree. Baseline production release: 5ad2d2480ae2a7789fab81445a0f1961cdcbd2ed. Current feature branch starts from c030628; origin/main at start is 293876d14411b3ffb8d7400da9688174165ca243.

All four approved production URLs returned HTTP 200 before changes: [hub](http://204.168.161.237/atlas/), [red panda](http://204.168.161.237/atlas.red-panda/), [polar bear](http://204.168.161.237/atlas.polar-bear/), and [hippopotamus](http://204.168.161.237/atlas.hippopotamus/). No production files or routes have been changed.

Baseline Chromium screenshots were captured from production at 1440×900 and 390×844 in reports/phase4/baseline/. The set includes Futa and Rakesh focused trees, Futa's current profile fallback, the largest-family initial view and fit-all red-panda graph, and the polar-bear and hippo graphs. There were zero browser page errors. Screenshot hashes and capture details are in baseline/screenshot-manifest.json.

The initial geometry report is reports/phase4/baseline/layout-metrics.json. It samples the cubic routes used by the live renderer into 24 segments and counts proper curve crossings once per edge pair, excluding pairs with a shared animal endpoint. Solid and dashed routes are both included. Baseline:

| View | Nodes | Edges | Crossing pairs | Rendered route length |
|---|---:|---:|---:|---:|
| Futa focused, 3 generations | 100 | 100 | 256 | 126,772.03 |
| Futa focused, all known | 121 | 121 | 265 | 142,595.56 |
| Rakesh focused, 3 generations | 14 | 13 | 8 | 4,049.75 |
| Red panda largest component | 823 | 1,468 | 34,888 | 3,428,194.25 |
| Red panda all animals | 1,554 | 2,394 | 47,473 | 5,472,576.87 |
| Polar bear all animals | 72 | 63 | 20 | 16,217.28 |
| Hippo all animals | 96 | 86 | 33 | 27,100.89 |

The baseline has no node overlaps or generation-order violations. The full red-panda graph has 4,080 edge/node collision pairs. Measurements use world-coordinate centerlines; dash gaps do not alter crossing or length totals. This report is a bounded heuristic baseline, not a claim of exact global optimality.

## Media rights investigation

The production atlases contain zero media records, so the existing resolver has no image to display. A newly verified Futa image is available from Wikimedia Commons: File:Futa 20261004 3.jpg, by Misei sen, CC BY 4.0. The file page identifies the subject in Japanese as Chiba City Zoo's Futa, and Chiba Zoo's official 2026 page identifies Futa and says he will turn 23 on 2026-07-05. Required attribution is photographer credit, license link, and notice of changes. Sources: [Commons file/license](https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg) and [Chiba City Zoo 23rd-birthday page](https://www.city.chiba.jp/zoo/event/0705futabirthday.html). No image bytes have been downloaded or stored. Rights for additional red pandas, polar bears, and hippos remain under review; unverified records stay link-only.

## Milestones

- [x] Read the full approved brief and media-rights policy.
- [x] Capture production baseline screenshots and graph metrics before implementation.
- [x] Prepare bounded architecture and test-first implementation tasks in docs/superpowers/plans/2026-10-20-phase4-layout-media.md.
- [ ] Implement shared rendered-route metrics and deterministic focused/global layout optimization.
- [ ] Add focused-only parent ordering, regression fixtures, and opt-in diagnostics.
- [ ] Add verified media metadata, same-origin UI references, and secure relay service.
- [ ] Run serial browser and full Node/Python/schema/lint/type checks; capture before/after comparisons.
- [ ] Complete independent review and green GitHub CI; push and merge reviewed commits.
- [ ] Back up release state, deploy the four Atlas paths and relay integration, verify image HTTP bytes and Chromium rendering, and record rollback evidence.
- [ ] Confirm legacy /red-panda/ unchanged and publish docs/PHASE4_RELEASE.md.
