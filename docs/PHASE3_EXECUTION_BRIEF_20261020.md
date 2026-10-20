# PHASE 3 AUTONOMOUS EXECUTION BRIEF -- Animal Lineage Atlas
Date: 2026-10-20. Owner: user. Target repository: https://github.com/vvyatkin-afk/Animal-Lineage-Atlas
Lead model: GPT-6 Luna, maximum reasoning, full access. Operate autonomously to a tested release.

## Exact scope and context
This job is in the separate main Atlas repository, NOT the legacy Red Panda site and NOT the Animal-Lineage-Research repository.
- Workspace: /home/codex/projects/Animal-Lineage-Atlas/.worktrees/phase3-rich-genealogy
- Source repo: /home/codex/projects/Animal-Lineage-Atlas (do not modify its untracked PHASE2_EXPAND_GLOBAL_DATASETS.md).
- Related advanced prototype, READ ONLY: /home/codex/projects/Animal-Lineage-Research/.worktrees/focused-pedigree-production-remediation. It has about 60 uncommitted changes and a separate running agent, so NEVER write to it, run destructive git commands there, or reset/copy files blindly. Review its architecture, tests, and useful features as inspiration only; copy/adapt source manually into Atlas with validation and proper attribution.
- Production paths you may update ONLY after tests: /atlas/, /atlas.red-panda/, /atlas.polar-bear/, /atlas.hippopotamus/.
- Legacy /red-panda/ must remain untouched, functional and unmodified. Preserve its actual files and runtime.
- Phase 2 release: commit 133f7a5324a4095aeb922f77c4dce3e4c2a50b5a. A documented known-good deployment exists at /var/www/html/_animal-lineage-releases/133f7a5324a4095aeb922f77c4dce3e4c2a50b5a.
- Current Phase 2 data: 1,554 red pandas / 2,394 relationships, 64 captive polar bears, 85 hippopotamuses (60 common, 25 pygmy). Preserve baseline data, IDs, provenance and test coverage.
- Read README.md, MASTER_EXECUTION_PROMPT.md, PHASE2_EXPAND_GLOBAL_DATASETS.md, docs/RELEASE_V2_EXPANDED_DATASETS.md, docs/DEPLOYMENT_AND_ROLLBACK.md and current source/tests. The local PHASE2 file may be untracked in the parent checkout, treat it as read-only input.

## User-requested Phase 3 product
The user repeatedly asks for a large true multi-generation lineage graph, much closer to the large older Red Panda project's functionality, rather than a disconnected-component dot map or just a two-generation ancestor/descendant slice. The same unified engine should power red pandas, polar bears, and both hippopotamus species.

### 1. First: audit current implementation and actual live sites
- Record baseline Git SHA, deployed manifest, health of all four Atlas routes, baseline scientific/data integrity and tests. Save rollout/rollback information.
- Identify specific gaps, including current shallow focused layout in packages/genealogy/layout.ts and overview dots in packages/ui/genealogy-view.ts.
- Examine the latest Animal-Lineage-Research research and focused routing read-only. Document reusable algorithms, quality findings, and blockers; do not copy unfinished results as truth.
- Inspect browser UI via scoped automated screenshot/tests, both desktop and mobile, without exceeding memory limits. Avoid Firefox with many concurrent workers.

### 2. Real large genealogy, not merely an overview
- All canonical animals searchable and navigable from ONE dataset per species. Red pandas are not split into Futa subset and separate global dataset.
- Offer a TRUE scalable "All animals" graph with generation rows even across disconnected clusters, with well-defined generation alignment and no misleading invented edges. Also offer selected-animal ancestors/descendants and focus mode with configurable depth and all known generations.
- Every parent-child edge must map to the correct IDs and appear correctly after pan, zoom, selection or focus changes. Visually disambiguate biological/foster/social and confirmed/probable/disputed relations; no crossings through card text when avoidable. Verify exact connectivity of documented test families, including Futa and other dense clusters.
- Group by FAMILY/CLAN horizontally while keeping each generation on its original row. A family can span countries! Country mode should group by country within the SAME generation; family mode groups by genealogical relationship rather than country. Make these alternate views, not different corpora.
- At distant zoom compact symbols/real SVG flag icons; at medium zoom small photos or country flags, sex and alive/deceased status, photo-confirmed checkmark; at high zoom portrait and name, zoo/institution, dates and badges. Do not render thousands of full DOM cards at once: use spatial indexing, virtualization, lazy detail, stable node positions and performant canvas/SVG hybrid as justified.
- Provide multiple representative externally hosted photos in profile UI and compact avatar on nodes, conditional on actual rights/embedding permissions. Media loads from DIRECT THIRD-PARTY URLs with suitable permission, never copied to local disk or GitHub/our server. Existing rights restrictions must be respected; when rights are unclear, show meaningful source links/placeholder, not a fake checked photo, and record licensing provenance. No proxies bypassing access restrictions.
- Clicking a profile card should open exact animal profile in a separate browser tab/window, preserve the main large tree pan/zoom/selection upon return, support deep links and history/back.
- Search by EN/JA/RU, alternate names and transliterations; country/sex/life status/photo filters; intuitive desktop/mobile controls including touch pan/zoom, keyboard and labels; useful fallback when URLs have no accessible media.
- Honor state: no redundant expensive full recomputation on ordinary zoom/pan.

### 3. Data growth with provenance
- Red pandas: retain >=1554 canonical records, their external IDs and reviewed ambiguous matches, no regressions; research defensible new names/parentage from open sources only, cross-check duplicates.
- Polar bears: grow named zoo lineages significantly using official open sources. Investigate Western Hudson Bay 4,449-individual scientific pedigree via published Dryad repository DOI 10.5061/dryad.23d8v ONLY through legitimate openly permitted access. Previous Dryad endpoints gave 401/403; do not bypass authentication/robots/paywalls. If not obtainable, provide a precise source/status note and proceed with defensible zoo data.
- Hippos: expand common AND pygmy named pedigrees using official pages and openly reusable material. Keep taxa distinct, no cross-species parentage, clear separate filters.
- Each material new relationship needs source and confidence; do not invent dates, parents, sexes, status, zoo, photographs, or coverage.
- Preserve provenance/conflicts/uncertainty. Capture source check dates and attribution. Add quality & duplicate checks.
- Do not sacrifice successful UI release waiting for unattainable full studbooks; prioritize valuable verified improvements and report limitations.

### 4. Engineering, QA, release requirements
- Shared reusable engine; no three divergent tree engines. Keep canonical JSON and releases reproducible.
- Tests: data/schema validations; no-photo bytes; Node and Python; TypeScript; build; browser regression for selected/focus/global/all species; deep links, multilingual search, country/clan views, zoom, layout; mobile viewport 390x844 and desktop 1440x900. Add deterministic fixtures with tricky multi-generation shared parents, several countries and multiple partner branches.
- Benchmark ALL 1554+ red pandas in global mode and largest component on this 4GB server. Run browser QA serially (one worker), avoid memory or disk exhaustion. Use CI for heavy work if appropriate.
- Correct broken/incorrect lines or loading errors immediately. Measure initial load, responsiveness, memory bounds and no unavailable photo errors causing blank trees.
- No direct changes to production until branch tested, independently reviewed and CI green. Work in dedicated feature branch and worktree. Commit/push small coherent increments, and create PR for review. Keep original stable main and existing site unchanged until acceptance checks pass.
- On final release, merge validated PR into main, deploy atomically via documented tools using existing versioned release/symlinks, verify all four pages (and actual browsers), check old /red-panda/ HTTP and representative structure unchanged. Retain prior release and provide rollback, SHA, URLs, screenshots/performance reports. On any failed smoke, roll back all four Atlas links immediately. Do not update nginx config or other sites.
- Avoid publishing private credentials, protected records or copyrighted image assets. No blanket deletion of files, git branches, tmux sessions or unrelated projects.

## Continuous progress / resilience
- Start by writing docs/PHASE3_PROGRESS.md with initial audit, explicit prioritized backlog, decisions, baseline counts, acceptance criteria and timestamp. Update and commit it after each verified phase.
- Maintain docs/PHASE3_RELEASE.md with precise build/release status, verified links and outcomes. Do not claim a step finished before testing.
- Use subagents only when supported and appropriate, with separate worktrees/branches, no collisions. Total memory is constrained to 4GB; avoid many simultaneous Chrome/Firefox, Codex sessions or Playwright workers.
- Do not pause to ask permission for ordinary safe steps. User has explicitly requested hands-off full-access operation through final verified release. If an externally blocked source cannot be accessed lawfully, document it and continue other work.
- Continue while session/time/context allows; before stopping, push all code and progress, leave concise NEXT_ACTIONS in docs/PHASE3_PROGRESS.md, provide an exact continuation command. Never lose a partial development result.
- At each significant milestone print a clear single-line progress marker in stdout of the form: PHASE3_PROGRESS: phase=<name> status=<done|working|blocked> summary=<short_text>. The outer tmux log watcher needs this.

First task: quick baseline audit, outline minimum viable Phase 3 release, record plan, implement tree/UI priority with measurable regression tests. Then expand datasets and fully integrate/release. Work through to the final validated outcome rather than stopping at a plan.

