# Animal Lineage Atlas v1 design

## Goal and audience

Publish a source-grounded public hub and three independent animal lineage atlases at `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/`. The pages are for visitors comparing individual animal histories and for contributors extending a cautious, evidence-linked public dataset. The existing `/red-panda/` site remains untouched.

The supplied `MASTER_EXECUTION_PROMPT.md` is the controlling release brief. This design resolves its implementation choices and records source-use limits discovered during preflight.

## Architecture

Use one static-first TypeScript engine, one canonical JSON dataset per atlas, and a small Python data-validation/build pipeline. The hub and each child atlas are built as static directories. Each child ships its own UI bundle and compact runtime data, so it works without loading the hub. There is no application server, database, proxy for animal images, or service worker.

Shared code is separated into schema, genealogy, search, media, i18n, and UI packages. Species-specific files hold data, source policy, coverage text, localized interface copy, and accent configuration. Build output lives in ignored `dist/`; GitHub Actions runs validation and builds. Public paths use query-based profile URLs, so the existing generic Nginx static root needs no route rewrite.

## Canonical data

Each atlas document has release metadata (`schema_version`, `data_version`, `engine_version`, build provenance), coverage, animals, claims, relationships, events, institutions/places, media references, and sources.

- An animal has a stable ID, taxon, sex/status, canonical name with its source language, verified aliases/localized forms, namespaced external IDs, claims, and review metadata.
- A claim has subject, type, value, one of `confirmed`, `probable`, `disputed`, or `unknown`, one or more sources, and review metadata. Conflicts remain separate claims.
- A relationship names two real animal IDs and a relationship type such as biological mother/father, foster, adoptive, or social. Status and evidence are explicit. Unknown parents are absent links, never shared placeholder animals.
- Events include birth, death, transfer/move, release, and observation. Dates are exact, approximate, ranges, or unknown. Institution ownership and physical location remain separate when evidence supports both.
- Institutions have stable IDs, name variants, and country/location. Sources have stable IDs, title, publisher, URL, known publication/access dates, type, notes, and reuse context.
- Media references contain metadata only: media/animal IDs, source page, optional direct remote URL, credit, rights status, embedding status, offline eligibility, identity confidence, checked date, and notes. No animal-photo bytes, thumbnails, caches, or encoded copies enter Git or production.

The validator checks required fields/enums, valid and unique IDs, namespaced external-ID collisions, dangling references, self-ancestry and cycles, date formats and ordering, source evidence, uncertain-claim preservation, and media restrictions. Unknown or incomplete data stays explicit.

## Data scope and source decisions

### Red panda

Migrate the locally curated Futa-family data from `FFJ-Red-Panda-Atlas-card-ui-20261007` at `fe97aff63d87948232462ea4b60873460de96948`, recording the production baseline from its release report (`efb54a683f51728378bb513ab05cf7feea23ca62`). Its cited 83-node tree and 21 source records are the v1 red-panda corpus. Preserve stable source IDs through a mapping; translate its seven unnamed-outcome entries (eight reported outcomes) and one unquantified birth episode into events, not invented animal records. Retain uncertain identity/relationship provenance and flag unresolved values.

Do not copy the separate 1,559-record Red Panda Lineage profile snapshot. GitHub reports no declared license for `wwoast/redpanda-lineage`; the output will document its 1,559 profile, 2,386 family-edge, and 1,049 litter-edge counts as excluded input and list legacy IDs without copying its names, records, edges, media URLs, or photos. The exclusion reason and future permission path appear in the migration report and red-panda coverage page.

The new dataset may retain source-page links from the curated Futa layer as link-only media references. Legacy local photos are not copied. No English or Russian proper-name transliterations are invented; verified aliases are searchable and the source name remains the fallback in all interface languages.

### Polar bear

Scope v1 to publicly documented zoo individuals, not a global studbook: Tallinn Zoo's named history (Franz, Joosep, Vaida, Jasper, Marta, Mart, Friida, Nord, Nora, Aron); the directly documented Tierpark Berlin family (Tonja, Wolodja, Fritz, Hertha); and Prague Zoo's documented bears (Bora, Alík, Pú, Berta, Tom) where each included link/event is explicitly supported. Keep the parental pair of Tonja and Wolodja unknown rather than creating ancestor records where sources do not identify them. Preserve approximate dates, historical locations, and source-stated transfers. Coverage warns that these are public zoo histories, not complete European or international studbook data.

### Hippopotamus

Scope v1 to common hippopotamuses at Cincinnati Zoo: Bibi, Henry, Fiona, Tucker, and Fritz. Use Cincinnati Zoo sources to assert Bibi/Henry as Fiona's parents and Bibi/Tucker as Fritz's parents. Record dates and institution history only as the zoo reports them. Pygmy hippopotamuses are a later, separate taxon; public studbook pages do not expose the individual pedigree needed for a comparable sourced corpus. State that limitation clearly.

## Media and offline contract

All v1 animal media references are link-only unless a source's rights and embedding terms are explicit. In that case the public resolver may return a remote URL; otherwise it returns an accessible neutral placeholder and a link to the original page. The image element has a failure fallback and never blocks search, tree, or profile content.

Components use an injected resolver. Tests exercise the public resolver and a local resolver backed by a small manifest pointing to a generic test swatch, with original URL, credit/rights metadata, relative path, checksum, and archive status. The future offline package contract is documented; no photo downloader is included.

## Shared experience

The hub explains mission, source evidence/uncertainty, official studbooks versus this atlas, public photo policy, future private/offline archive, corrections, versioning, and each atlas' computed counts, update date, source categories, and scope warning.

Atlas pages share a calm natural-history interface with species accent colors, responsive behavior, keyboard-accessible controls, EN/JA/RU interface strings, accessible placeholders, searchable animal profiles, source links, and a multi-generation SVG genealogy. Search covers canonical names, aliases and verified EN/JA/RU forms, institutions, stable/external IDs, country, and taxon. Normalize case, spacing, and diacritics only in the search key.

The graph shows biological/social edge types distinctly, generation rows, country groupings, repeated ancestors once, pan/zoom, a selected animal, and bounded graph loading for larger records. Country is a display/filter facet, not biological family. Profile URLs use `?animal=<stable-id>` and opening/closing a profile leaves graph position, zoom, filters, focus, and selected group intact. Any persisted browser key includes app and version namespaces.

## Build, validation, and deployment

One build command emits four static directories under `dist/`, each with a small runtime payload. Measure output HTML/JS/CSS, runtime payload sizes, and graph/search interaction time. CI performs lint/typecheck, unit/schema/data tests, the no-local-animal-photo check, all-app builds, and browser smoke tests where available.

Deploy a reviewed commit to four separate `/var/www/html` path symlinks targeting a versioned release directory. Stage and validate before atomically swapping each symlink; retain the previous target and provide rollback instructions. Do not alter `/red-panda/` or its data. The current Nginx config serves static paths directly; validate it before and after release. Production smoke checks cover the old route, each new route, child direct profiles, links, and basic responsive behavior. GitHub `main` and deployed commit must match.

## Acceptance

All four paths are useful and independent; schemas/data validate; source links and uncertainty display; tree/profile/search work; keyboard/mobile/language behavior is verified; resolvers and no-photo checks pass; no local animal-photo bytes occur in release history/bundle; CI is green or external failures are documented with equivalent local evidence; legacy `/red-panda/` still returns the known release; repository is clean; and release/rollback docs record exact commit, counts, limits, checks, disk, and rollback target.
