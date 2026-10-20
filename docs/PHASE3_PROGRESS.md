# Phase 3 Progress — Rich Genealogy and Verified Data

Last updated: 2026-10-20 09:12 UTC
Owner: repository owner
Working branch: `phase3/rich-trees-media-data-20261020`

## Initial audit

### Baseline and release state

- Feature worktree baseline: `daf7d2931a1560b5d25721eb6b90dd35c66da6bf` (clean before dependency installation; no tracked source changes).
- Source checkout: `133f7a5324a4095aeb922f77c4dce3e4c2a50b5a`; its untracked `PHASE2_EXPAND_GLOBAL_DATASETS.md` was read only and remains untouched.
- Production manifest: `/var/www/html/_animal-lineage-releases/133f7a5324a4095aeb922f77c4dce3e4c2a50b5a/release-manifest.json`; all four Atlas symlinks point to this immutable release. Its recorded rollback target is `ad24b3bb51c08242c731189040d15241d56ab3b4`.
- Live HTTP baseline: `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, `/atlas.hippopotamus/`, and legacy `/red-panda/` all returned HTTP 200 on 2026-10-20. No production files were changed.
- Disk baseline: 14 GB free on the 38 GB root filesystem. Runtime reports a 4 GB host; browser automation is serial with one worker.
- Canonical baseline counts: red panda 1,554 animals / 2,394 relationships; polar bear 64 / 58; hippopotamus 85 / 78 (60 common and 25 pygmy). Preserve all current IDs, source provenance, conflicts, uncertainty, and relations.

### Baseline verification

After `npm ci` from the lockfile, these baseline checks passed:

- `npm run lint`, `npm run typecheck`, `npm test`: 45 Node tests passed.
- `python3 -m unittest discover -v`: 79 Python tests passed.
- `npm run validate:data`, `npm run validate:schema`, and `npm run check:no-photos`: passed for the canonical datasets.
- `npm run build`: all four static paths built.
- `npm run test:browser -- --workers=1`: 10/10 passed, including all three child atlases, direct profiles, media failure fallback, locale controls, mobile layout, and performance probes.

The initial lint attempt used the system ESLint 6.4 because project dependencies were absent. Installing the locked dependencies resolved that environment issue; no source edits were needed.

### Product and implementation gaps

- `packages/genealogy/layout.ts` only lays out a selected neighborhood. Its defaults are depth 2 and 250 nodes. It already has a reusable adjacency/component index and preserves relationship IDs, but it has no all-record generation layout.
- `packages/ui/genealogy-view.ts` renders the unselected state as component dots and up to 12 representative family buttons. This is a useful index, not the requested lineage graph: nodes are not placed in generation rows and the graph edges are absent.
- Focus mode has generation rows and configurable depth, but its hard node cap can truncate large families. The UI is SVG/DOM-oriented and does not yet expose an all-known-generations option or family-versus-country grouping.
- Current species pages use the same packages and canonical files; there is no need to split red-panda data to implement the global mode.

### Read-only research prototype audit

The related worktree `/home/codex/projects/Animal-Lineage-Research/.worktrees/focused-pedigree-production-remediation` is dirty (about 60 modified/untracked files) at HEAD `d6c42425ffc2e88b1847e2b4f4ca7544e1bda470`. It was inspected read-only; no files, Git state, sessions, or generated artifacts were changed.

Useful ideas to adapt manually with Atlas-specific tests:

- Build one shared graph index, assign stable generation bands across disconnected components, and pack family/country groups horizontally without moving animals off their generation row.
- Keep global graph nodes/edges separate from profile detail, use compact overview rendering, viewport culling/spatial buckets, stable anchors, and avoid rebuilding layout during pan/zoom.
- Route visible relationships from canonical IDs and inspect edge/card intersections; keep social links visible without using them to infer ancestry.
- Use deterministic multi-generation, convergence, cross-country, dense-family, and large synthetic graph fixtures.

The latest prototype QA artifacts report a 3,515-animal runtime, 2,934 accepted relations, a 1,225-animal largest component, zero page errors, and synthetic 8,000-node layout/drag checks with no overview DOM cards. They also record four failed image requests. Other reports from October 15–16 differ in relationship and component counts, and the current prototype has uncommitted edits after the reviewed commit referenced by its release report. Treat those reports and all research-corpus facts as leads only; do not import their data or claim their current dirty state passed review. The Atlas suite and canonical sources remain the release authority.

### Source status: Western Hudson Bay polar-bear pedigree

Dryad's official DOI landing page is public and describes a 4,449-individual pedigree with a 76.74 KB `pedigree.txt`; Dryad's current End User Terms describe datasets as reusable under CC0. The official file link still returned HTTP 403 when followed on 2026-10-20. No file bytes were obtained or imported, and no alternate/authenticated endpoint was attempted. Retain the existing zoo/captive population and document this precise access blocker unless the ordinary public download becomes available.

## Prioritized Phase 3 backlog

1. **Shared graph foundation — verified locally.** Deterministic global generation alignment, exact edge IDs, family/country grouping, relation and confidence styling, and finite/all-depth focus use the shared genealogy engine.
2. **Scalable view and interaction — verified locally.** Canvas rendering uses spatial culling and hit testing; high-detail cards are capped and lazy; pan/zoom preserves layout; profile cards open exact URLs in a new tab. Sex, life-status, photo, country, species, and population facets narrow the global graph without changing canonical records.
3. **Regression coverage — verified locally.** 53 Node tests pass, including shared ancestors, multi-generation partner branches across countries, disconnected lineages, exact Futa family connectivity, full 1,554 / 2,394 graph counts, and lazy detail/media behavior. The serial browser run passes 14/14 at desktop/mobile.
4. **Data/source pass — additions and review complete for this pass.** Polar bears grew to 72 animals / 63 relationships and hippos to 96 / 86 (64 common, 32 pygmy). Red pandas remain 1,554 / 2,394; candidate additions were withheld where identity could not be resolved. Dryad remains unimported because the published file endpoint returned 403.
5. **Performance, review, and release — locally verified; review/release pending.** The full-graph benchmark report is recorded. Branch push, CI, independent PR review, merge, atomic deployment, production browser checks, and rollback evidence remain outstanding.

## Measurable acceptance criteria

- Global mode represents exactly all canonical animals and all canonical relationships for each taxon view, without invented links or silent truncation. Disconnected components each have generation rows, with component-local oldest-known generation at row 0 and descendants on increasing rows; this avoids implying a temporal relationship between unrelated components.
- Family grouping is derived from pedigree connectivity and may span countries. Country grouping partitions within each generation. Neither grouping changes records or edge endpoints.
- The renderer never creates a full card DOM node per canonical record. The 1,554-red-panda graph has stable IDs/positions and passes browser selection, pan, zoom, focus and exact edge endpoint checks.
- Layout is computed on data/mode/focus changes, not ordinary pan/zoom. Record global layout and render time, search p95, initial payload, visible DOM count, and browser heap where supported. Target: global graph layout under 2 seconds and search p95 under 100 ms in the one-worker browser run on this host; report any measured limit rather than hiding it.
- All baseline counts and identifiers remain; each new material relationship has source and confidence; common and pygmy hippos remain taxonomically separate; no-photo validators pass for source and built output.
- Node, Python, TypeScript, schema/data, build, and serial Playwright checks pass. Desktop and mobile browser QA covers all species, global/focused modes, deep links, multilingual search, alternate grouping, zoom/pan and profile state restoration.
- Before deployment, branch CI is green and release/rollback data is recorded. Production switches only the four Atlas symlinks; all four paths and representative profiles return/render correctly, and the legacy route remains HTTP 200 with representative files unchanged.

## Decisions and constraints

- The single shared Atlas genealogy engine remains the source of graph behavior for red panda, polar bear, common hippo, and pygmy hippo.
- Research prototype code and data are not copied wholesale. Algorithms may be adapted manually with source review, clear attribution where appropriate, and Atlas tests.
- No photo bytes are copied, cached, proxied, or added to the repository. Existing media permissions and link-only fallbacks remain authoritative.
- No production changes until the feature branch is tested and release checks are green. Legacy `/red-panda/`, Nginx configuration, and unrelated projects are outside scope.

## Current status

### Verified Phase 3 milestone — 2026-10-20 09:12 UTC

- Shared global and focused graph implementation is in place across all three canonical species indexes. The all-animal graph includes all canonical nodes and edges; disconnected family components start at generation 0, and family/country grouping does not change generation assignments or relationships.
- The initial view fits the largest component for readable detail; `Fit all` exposes every disconnected component across the generation rows. Layout is not rebuilt during ordinary pan or zoom. Graph filters change only the displayed node/edge set.
- The final serial Playwright run passed 14/14 at desktop 1440×900 and mobile 390×844, including the full red-panda graph, all three species, sex/life-status/photo filters, exact profile tabs, focus depth, and touch pan/zoom. The Futa mobile view shows readable multi-generation cards; global-detail and focused-mobile screenshots are under `/tmp/animal-lineage-atlas-qa/`.
- The complete Node suite passed 53 tests and the Python suite passed 82 tests. Lint, typecheck, all three data/schema validations, build of all four paths, and no-photo scans on source and `dist/` passed. The benchmark report is pinned to clean source revision `58c5e34f46b78422e5b9ba7dfc5cf9e4541d83e3`.
- The 1,554-animal global layout measured median 66.2 ms / p95 111.1 ms across 10 samples; the 823-animal largest component measured median 49.4 ms / p95 58.1 ms. In Chromium at 1440×1000, first global render was 161.2 ms and search render 11 ms; runtime index was 1.55 MB and measured heap 17.1 MB. Full details are in [the Phase 3 performance report](PERFORMANCE_REPORT_PHASE3.json).
- Canonical Phase 2 identities and red-panda counts remain. Source-backed additions are recorded in the polar-bear and hippo source docs; the [red-panda source review](RED_PANDA_PHASE3_SOURCE_REVIEW.md) records current candidates and why unresolved namesakes were not merged.
- No production files, symlinks, Nginx configuration, parent-checkout untracked files, or research-worktree files were changed.

## NEXT_ACTIONS

1. Commit the regenerated benchmark and final progress/release notes, then push the feature branch and open the review PR.
2. Obtain independent review and green CI, fix any findings, and merge only after both pass.
3. After approved merge and green CI, deploy only `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/`; verify all four plus legacy `/red-panda/`, capture screenshots and manifest, and record rollback evidence.

Continuation command:

```sh
cd /home/codex/projects/Animal-Lineage-Atlas/.worktrees/phase3-rich-genealogy
npm run lint && npm run typecheck && npm test && npm run test:python && npm run validate:data && npm run validate:schema && npm run build && npm run check:no-photos && npm run test:browser -- --workers=1
```
