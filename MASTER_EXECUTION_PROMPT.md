# Animal Lineage Atlas — Master Execution Brief

## Objective
Build and release a new multi-species Animal Lineage Atlas platform in the clean repository vvyatkin-afk/Animal-Lineage-Atlas. Work continuously to a verified production release. Use the existing red-panda project only as a reference/source for migration; do not replace or damage it.

Production paths:
- /atlas/ — mother/hub site
- /atlas.red-panda/ — new red-panda atlas
- /atlas.polar-bear/ — polar-bear atlas
- /atlas.hippopotamus/ — hippopotamus atlas

The current legacy red-panda site must remain at its existing URL and continue to work independently.

## Operating mode
Act as lead engineer/researcher. Use subagents when useful for parallel research, migration, QA, design review, and code review. Keep work isolated with branches/worktrees where needed. Integrate, test, and verify delegated results yourself. Do not stop at scaffolding, partial implementation, a PR, or a successful build. Completion means deployed sites, production smoke tests, documentation, and rollback instructions.

The server disk is tight. Monitor disk usage. Remove only recreatable caches/temp/build artifacts when necessary. Do not remove unrelated projects, production data, legacy red-panda files, or important backups. Prefer GitHub Actions for expensive builds/tests and avoid large retained artifacts.

## Strategic architecture
Create one shared engine/design/data model, not three copied applications. Adding a future species should primarily mean adding data, configuration, source policy, translations, and species-specific text.

Recommended separation:
apps/hub
apps/atlas
packages/schema
packages/genealogy
packages/ui
packages/media
packages/i18n
packages/search
atlases/red-panda
atlases/polar-bear
atlases/hippopotamus
tools/import
tools/validate
tools/audit
docs

Adjust if needed, but preserve separation of shared engine from species datasets.

Use a maintainable static-first architecture unless a server-side component is truly required. TypeScript is preferred for shared web code; Python is fine for data pipelines/validation. Keep one clearly defined canonical source of truth and generate runtime indexes/assets from it.

## Public photo policy
The new repository and new deployed platform must not store copies of animal photographs. No local JPG/PNG/WebP animal portraits, generated thumbnails, Base64 copies, image caches, or copied remote photos in release bundles. Generic interface assets such as flags, icons, logos, and placeholders are allowed.

Public pages may display an external photograph only when its source/rights situation reasonably permits embedding. Otherwise show a neutral placeholder plus a link to the original source page.

Do not use the old red-panda site as a hidden image host for the new platform. Do not proxy remote photographs merely to bypass remote restrictions.

For each media reference support metadata such as media_id, animal_id, source_page_url, direct_remote_url when appropriate, credit, rights/license status, embedding status, offline-archive eligibility, identity confidence, checked date, and notes.

Add automated validation so CI catches accidental local animal-image additions.

## Future personal offline archive
Do not build a mass photo downloader in v1. Do prepare the architecture.

UI components must request media via a shared resolver abstraction rather than hardcoding remote URLs throughout the app. Implement:
- a public remote resolver;
- a small test/local resolver proving that the same card/tree UI can use a local media manifest later.

Document a future offline package format containing an app build, data snapshot, local media manifest, original source URL, credit/rights metadata, relative local file path, checksum, and archive status. The future offline version should be able to work without the network, but only the interface/contract and tests are required now.

## Canonical data model
Represent at least:

Animal:
- stable internal ID;
- taxon;
- sex/status;
- canonical display name;
- aliases/transliterations/localized names;
- external identifiers with namespace;
- review metadata.

Claim:
- subject;
- claim type;
- value/object;
- status: confirmed, probable, disputed, unknown;
- source/evidence;
- review metadata.

Relationship:
- biological mother/father;
- foster/adoptive/social relationships as distinct types;
- evidence/status.

Never represent unknown parents as one shared fake animal.

Event:
- birth, death, move/transfer, release, observation;
- exact, approximate, range, or unknown dates;
- place/institution;
- source.

Institution/place:
- stable ID;
- name variants;
- country/location;
- distinguish ownership from physical location when data supports it.

MediaReference:
- metadata only; no stored photo bytes.

Source:
- stable source ID;
- title;
- publisher/organization;
- URL;
- publication/access dates when known;
- source type;
- notes and data-use metadata.

Release metadata:
- schema version;
- data version;
- engine version;
- build date/provenance.

Validators must detect dangling IDs, invalid duplicate external IDs within a namespace, self-ancestry, malformed dates, and accidental loss of uncertainty. Preserve conflicting claims instead of silently overwriting them.

## Source quality rules
Use web research for polar bears and hippopotamuses. Prefer authoritative public sources: zoos/aquariums, conservation bodies, official studbook publications when openly accessible and reusable, government/research institutions, reputable scholarly sources, and official animal announcements.

Secondary sites can be discovery aids but should not silently become the only support for important pedigree claims if better evidence exists.

Do not assume that existence of a studbook means its full contents can be republished. If a comprehensive source is restricted, build a clearly scoped public-source atlas rather than claiming global completeness. Every atlas needs a visible Coverage and Limitations page.

## Phase 0 — audit before coding
1. Inspect current disk and safely recover only recreatable space as needed.
2. Inspect all red-panda worktrees/repositories under /home/codex/projects, especially FFJ-Red-Panda-Atlas, FFJ-Red-Panda-Atlas-card-ui-20261007, and FFJ-Red-Panda-Atlas-runtime-work.
3. Determine the exact production source/revision, current URL, deployment tree, and Nginx routing.
4. Inventory current features, data files, IDs, links, local photographs, external media, search behavior, mobile behavior, and direct-profile behavior.
5. Inspect production Nginx before changing it.
6. Commit a short execution checklist to the new repository, then proceed immediately.

## Red-panda migration
This is the first production-grade atlas and should preserve the best current behavior.

Preserve or improve:
- large pedigree tree;
- generation rows;
- country grouping;
- family/clan grouping without redefining biological family when an animal changes country;
- direct profile URLs;
- opening details without losing tree position, zoom, filters, or selected family;
- clean square media area and captions/metadata layout;
- Japanese, English, and Russian search/name support;
- country flags at distant zoom and useful detail at closer zoom;
- mobile UX;
- stable relationship edges;
- original source links;
- fast runtime data loading rather than forcing the whole research dataset on every user.

Migrate the structured data into the new canonical schema. Preserve stable IDs when practical; otherwise maintain explicit legacy-ID mapping. Generate a machine-readable migration report: source counts, target counts, relationships, changed/unmapped IDs, warnings, and unresolved issues.

Do not silently delete suspicious genealogy while "cleaning" data. Preserve provenance and flag questionable records.

Local legacy photos must not be copied into the new repository. Where the original external source can be identified and public embedding is appropriate, create a MediaReference. Otherwise use a placeholder while retaining whatever source/provenance information is known.

## Polar-bear atlas
Create a real useful initial atlas, not a demo shell.

Research a defensible corpus of individually identified polar bears, prioritizing zoo-managed individuals and public authoritative sources where parentage/life history is explicit. Build enough records to demonstrate real families, multi-generation relations where available, moves among institutions, aliases, search, profiles, institution/country filters, citations, and external-media references.

Clearly state the exact scope and known gaps. Never claim global completeness unless evidence genuinely supports that claim.

Create reproducible research/source notes so future contributors can extend the dataset without starting over.

## Hippopotamus atlas
Create a real useful initial hippopotamus atlas in the same engine.

Treat common hippopotamus and pygmy hippopotamus as distinct taxa. After research, choose the most defensible v1 scope. If both taxa can be supported cleanly, allow filtering; otherwise launch one clearly defined scope and document why.

Populate meaningful sourced individual records and relationships. Demonstrate families, institution history, search, profiles, evidence, and remote-media behavior. No fabricated completeness claim.

## Mother/hub site
Create a polished hub at /atlas/ explaining:
- project mission;
- difference between the atlas and official studbooks;
- how source evidence and uncertainty are handled;
- why public production does not archive photographs;
- the future private/offline archive concept;
- corrections/contributions;
- data/versioning philosophy;
- available atlases and their scope.

For every child atlas show computed record/relationship counts, data version, last review/update, source categories, and concise coverage warning. Never invent confidence percentages.

## UX/design
Use one coherent visual system with optional species accents. Aim for a calm professional natural-history/scientific appearance.

Requirements:
- responsive desktop and mobile;
- keyboard accessible;
- useful with all remote images blocked;
- fast initial load;
- durable shareable animal URLs;
- profile close/back restores tree state;
- accessible placeholders;
- clean credit/source links;
- language-ready architecture.

The engine and core descriptions should support English, Japanese, and Russian. Do not invent translated proper names; fall back to canonical source names when a reliable localized form is not available.

## Search
Search names, aliases, EN/JA/RU forms where supported, institutions, stable IDs, external IDs, and useful facets such as country/taxon. Normalize case/spacing/diacritics without changing stored display values.

## Genealogy engine
Build as a reusable shared package/component. Support:
- parents/children;
- multiple generations;
- pedigree convergence/repeated ancestors;
- independent unknown parents;
- country grouping;
- family/clan grouping as visualization, not hard biological truth;
- zoom/pan;
- clear edges;
- selected/focused animal;
- state preservation when profiles open;
- large-graph performance.

Tests must include simple family, multi-generation family, independent unknown parents, convergence, impossible self-ancestry, and an animal changing country without changing family.

## Deployment isolation
Deploy four independent path-based applications:
- /atlas/
- /atlas.red-panda/
- /atlas.polar-bear/
- /atlas.hippopotamus/

Keep legacy red panda unchanged.

Namespace browser storage/cache keys because all path apps share the same origin. Avoid service workers in v1 unless there is a strong need and scope isolation is proven.

Use atomic release directories/symlinks or an equivalently safe deployment. Before server config changes, save a targeted backup, validate Nginx, and make rollback straightforward.

## GitHub / CI
Make vvyatkin-afk/Animal-Lineage-Atlas the source of truth. Configure workflows for lint/typecheck, unit tests, schema/data validation, no-photo checks, build-all, and browser smoke tests where practical.

Do not retain large build artifacts unnecessarily. Keep main deployable. Use meaningful commits and merge reviewed delegated work.

## Suggested parallel agents
Use additional GPT-6 Luna agents where helpful:
A. legacy red-panda audit and migration;
B. schema/validators/genealogy;
C. hub/shared UI/i18n;
D. polar-bear source research/data;
E. hippopotamus source research/data;
F. media/offline-resolver policy;
G. independent QA/release review.

Use separate branches/worktrees or non-overlapping areas. Review every delegated diff before integration.

## Acceptance tests
Data:
- schemas validate;
- no dangling relationships;
- no self-ancestry;
- migration report exists;
- unresolved records are explicit;
- polar-bear and hippo profiles cite sources;
- dates preserve uncertainty;
- no fabricated genealogy/localized names.

Media:
- new Git history and new production release intentionally contain no animal-photo files;
- remote image failure leaves search/cards/tree usable;
- non-embeddable media falls back to source link/placeholder;
- local resolver fixture proves future archive substitution;
- no hidden image proxy.

UI:
- hub and all three atlases work;
- search works;
- direct profiles work;
- genealogy works;
- profile open/close preserves state;
- mobile works;
- EN/JA/RU interface switching works;
- keyboard/basic accessibility works;
- links/base paths are correct;
- each child atlas works without depending on hub runtime.

Performance:
measure HTML, JS/CSS bundles, runtime data payloads, representative search/tree responsiveness. Avoid loading research-size datasets when smaller runtime indexes can serve the page.

Production:
- legacy red-panda URL still works;
- all four new paths return healthy responses;
- representative direct profiles show the expected animal;
- Nginx validation passes;
- rollback is documented;
- GitHub main SHA matches deployment;
- working tree is clean.

Use browser automation and visual inspection at desktop/mobile sizes. For screenshots committed to the repository, block remote photos or use placeholders so third-party animal photos are not stored.

## Documentation
Create:
README.md
docs/ARCHITECTURE.md
docs/MISSION_AND_SCOPE.md
docs/DATA_MODEL.md
docs/SOURCE_AND_EVIDENCE_POLICY.md
docs/MEDIA_AND_RIGHTS_POLICY.md
docs/OFFLINE_ARCHIVE_FUTURE.md
docs/RED_PANDA_MIGRATION.md
docs/POLAR_BEAR_SOURCES.md
docs/HIPPOPOTAMUS_SOURCES.md
docs/DEPLOYMENT_AND_ROLLBACK.md
docs/RELEASE_V1.md
plus a machine-readable QA/release summary.

Release documentation must include repository/commit, production paths, record/relationship counts, source scope, known gaps, no-photo verification, tests/CI, legacy-site status, disk usage, and rollback instructions.

## Work order
1. Preflight/audit.
2. Shared foundation.
3. Red-panda migration.
4. Polar-bear and hippo research in parallel.
5. Hub and UX polish.
6. Independent code/data/browser review.
7. Fix findings.
8. Production deployment.
9. Smoke test old and new.
10. Final repository/release verification and safe cleanup of task-created temporary data.

## Definition of done
Do not stop at a prototype or "ready to deploy". Done means:
- the new public GitHub repository contains the shared platform;
- red panda has been migrated to the new engine;
- polar-bear atlas contains real sourced data and is deployed;
- hippopotamus atlas contains real sourced data and is deployed;
- hub is deployed;
- all four new paths work;
- the old red-panda site still works;
- the new platform stores no animal-photo copies;
- future offline archive media abstraction is implemented/tested/documented;
- tests/data validation pass or any unavoidable external limitation is explicitly documented with equivalent verification;
- release and rollback docs are committed;
- deployed revision matches GitHub main.

When a source blocks access or reuse, do not defeat the restriction. Narrow the atlas scope and document it. Provenance and correctness matter more than inflated record counts.

At completion provide a compact release summary with repository/commit, four production paths, record and relationship counts, test/CI results, legacy-site check, no-photo verification, key data limitations, disk usage, and rollback location/instructions.
