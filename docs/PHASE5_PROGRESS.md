# Phase 5 Progress — Readable Genealogies and Identified Photos

Updated: 2026-10-20 UTC

## Scope and baseline

Execution follows the user-authorized [Phase 5 brief](PHASE5_PHOTO_LAYOUT_BRIEF_20261021.md) on branch `phase5/legible-tree-and-identified-photo-20261021` in this isolated worktree. Production is Phase 4 release `6dfdb34b26f8f8ee574e40cff6e9e661779a19a7`. The worktree starts at `6ddcaf9995db87c08b56da0721f6c2ae5d8ca905`, a docs-only scope commit after that release. No production paths, `/red-panda/` files, or other project worktrees have been changed.

The current production-layout screenshots are the Phase 4 after captures, whose rendered UI source was `e1920337fdda82f9449dadc6d11d8420168a26db`; the only code difference from that source to deployed release `6dfdb34b26f8f8ee574e40cff6e9e661779a19a7` is a relay startup fix in `packages/media/relay-server.mjs`. They provide exact desktop/mobile captures and SHA-256 values in `reports/phase4/after/screenshot-manifest.json`. The 1440×900 all-red-panda screenshot confirms the reported thin ribbon. All four production Atlas URLs and `/red-panda/` returned HTTP 200 on 2026-10-20. Bandit's production page was captured at 1440×900 and 390×844; both captures contain 15 nodes and 15 relationships with no browser errors. Reproducible rendered-route measurements for Bandit depth-3 and all-known views were repeated twice. Full baseline records, capture hashes, method, and production revisions are in `reports/phase5/baseline/`.

| View | Animals | Relationships | Generations | Crossings | Rendered route length | Bounds |
|---|---:|---:|---:|---:|---:|---:|
| Red panda, all | 1,554 | 2,394 | 14 | 42,931 | 4,662,636.83 | 98,418 × 2,934 |
| Largest family component | 823 | 1,468 | 14 | 31,352 | 3,163,209.23 | 23,502 × 2,934 |
| Futa focused, depth 3 | 100 | 100 | 7 | 6 | 102,548.13 | 8,376 × 1,034 |
| Futa focused, all known | 121 | 121 | 9 | 18 | 121,431.54 | 8,376 × 1,354 |
| Rakesh focused, depth 3 | 14 | 13 | 4 | 4 | 2,908.52 | 1,376 × 554 |
| Bandit focused, depth 3 | 15 | 15 | 4 | 2 | 3,960.49 | 1,576 × 554 |
| Bandit focused, all known | 68 | 89 | 10 | 181 | 57,769.02 | 2,976 × 1,514 |

Measurements use the rendered cubic routes sampled into 24 segments; solid and dashed edges are included, shared-endpoint pairs are excluded, and lengths use complete centerlines. These bounded heuristic measurements do not claim a global optimum. The existing all-animal fit is about 33.5:1 wide-to-tall, explaining the ribbon at fit-all scale. Bandit's known mother is Kora (`red-panda:upstream-999`) and father is Gen Tso (`red-panda:upstream-394`); both upstream relationship records say `probable`. Their rendered positions already satisfy the local mother-left-of-father direction, while the depth-3 tree still has two crossings and the all-known graph has 181.

## Photo and provenance audit

Current canonical coverage: 1,554 red pandas, 2,394 relationships, 5,918 photo/media references attached to 866 animals; 5,917 references are `link_only`, and one is rights-cleared. Five polar-bear references and one hippopotamus reference are also link-only. Across red-panda references, 5,721 source pages are Instagram; the remaining references span 50 other hosts. Existing media policy and the resolver correctly reject direct URLs without explicit rights/embedding permission.

The pinned upstream audit in `docs/RED_PANDA_UPSTREAM_SYNC.md` records 54,004 upstream photo references, 17,740 retained URL references, 425 direct image URLs, no declared upstream reuse license, and no image payloads imported. A metadata-only recheck on 2026-10-20 found the current export at `https://redpandafinder.com/export/redpanda.json`, last modified `2026-10-19T07:14:00Z`, with SHA-256 `a5c85ebab73d6742f88b1af4f27b7c7a382b185dbd3ad1b7d7048f83f02a83c7`, export commit `3bb4d45d7d1d04bc18110d41f52b944c40cd6514`, and GitHub repository commit `7b3c4510e795368941cd5133e3b2e8afaf62a6ef`. The live repository still has no license metadata and no `LICENSE`, `COPYING`, or `COPYRIGHT` file. Its 54,004 photo references include 428 HTTP(S) direct URL fields and 18,188 HTTP(S) source fields; the direct URL count spans zoo/other vertices as well as animals. Four manually reviewed external-ID crosswalks remain documented in `docs/RED_PANDA_UPSTREAM_SYNC.md`. Upstream direct URLs remain link-only because these metadata do not grant photo reuse or embedding rights.

One positive-control image is fully verified: Chiba City Zoo's red panda Futa in Misei sen's Wikimedia Commons photo, CC BY 4.0, with source and creator recorded in `packages/media/approved-media-v1.json`. A metadata-only Commons audit found eight additional actual Futa photos with captions naming Futa and per-file CC BY 4.0 or CC BY-SA 4.0; a statue image was excluded. Commons also has a photograph whose file description explicitly identifies the pictured red panda as Simon at Jerusalem Biblical Zoo, licensed CC BY-SA 3.0 by SuperJew. The import ruling is to preserve this as an isolated source-backed record, with only the name, taxon and photo set and unsupported traits unknown. Other generic zoo red panda photos are not mapped to canonical individuals. No image bytes were fetched or stored during this audit.

## Acceptance checklist

- [x] Record exact Phase 5 desktop/mobile production baselines, including Bandit, Futa, Rakesh, largest family, and all animals.
- [ ] Focused ordering keeps each feasible biological mother immediately left of her own biological father; no sex-wide split; stable under input order and truthful on conflicting constraints.
- [ ] Minimize measured crossings first and rendered route length second, with readable minimum spacing; preserve every canonical ID and edge.
- [ ] Global graph is no longer a fit-all ribbon: 2D family/clan overview, clear levels and family separation, useful responsive framing, no dropped records, and usable pan/zoom and filters.
- [ ] At far zoom, render family summaries instead of a cluttered field of dots/lines; at medium zoom show family/generation structure; at close zoom show animal cards and edges.
- [ ] Only show identified photos when identity and embedding/reuse permission are evidenced. Browser loads approved original images directly; attribution, license and source link stay visible; source-only links remain available otherwise. No full-size image files or unapproved thumbnail binaries enter the server or release.
- [ ] Deterministic unit/data tests, full-dataset benchmarks, build/type/lint/data validation, serial desktop/mobile Chromium checks, direct-photo natural dimensions, screenshots, and independent review pass.
- [ ] GitHub CI passes on the exact reviewed merge tree; release manifest and rollback steps are recorded; live Atlas endpoints and legacy `/red-panda/` remain healthy and unchanged.
- [ ] Commit, push, open/review/merge PR, deploy atomically only after green checks, and verify live behavior before documenting release.

## Milestones

- [x] Read the complete Phase 5 brief and Phase 4 release/rollback/media-rights records.
- [x] Confirm isolated branch/worktree and clean starting state.
- [x] Inspect current desktop/mobile screenshot evidence and record source coverage counts.
- [x] Recheck current external-source version and license state using metadata only; confirm all five production routes return HTTP 200.
- [x] Add Bandit desktop/mobile live captures and current renderer metrics.
- [ ] Implement and benchmark focused pair constraints and 2D global overview.
- [ ] Implement direct-source photo rendering only for individually verified, permitted media; record remaining link-only coverage.
- [ ] Complete local and independent QA, CI, PR and production release/rollback verification.

## Release tracking

- First Phase 5 branch commit: `6ddcaf9995db87c08b56da0721f6c2ae5d8ca905`.
- Baseline evidence commit: pending in this milestone.
- Last Phase 5 commit: `6ddcaf9995db87c08b56da0721f6c2ae5d8ca905` before this baseline evidence milestone.
- Production remains on Phase 4 `6dfdb34b26f8f8ee574e40cff6e9e661779a19a7` until a reviewed Phase 5 release passes CI and smoke checks.
