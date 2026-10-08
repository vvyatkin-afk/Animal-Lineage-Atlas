# Data model

Each canonical `atlases/<species>/atlas.json` file contains release metadata, coverage, and records for animals, relationships, events, claims, institutions or places, media references, and sources. `packages/schema/atlas.schema.json` describes record shapes; `tools/validate_atlas.py` adds cross-record checks.

Each source has a required evidence tier: A for open primary datasets with stated reuse terms, B for official institutional records and publications, C for peer-reviewed research, D for public community-curated data, or `discovery_only` for secondary material used only to locate primary evidence. Tiers describe the source class and never replace record-level citations.

## Identity and names

- Every animal has a stable species-prefixed ID such as `red-panda:futa`.
- `name.canonical` retains the name used by its cited record. Aliases and localized names are separate fields and are added only when a source supports them.
- External IDs include a namespace so IDs from different source systems do not collide.
- Unknown animals and unknown parents are not materialized as records.
- `population` distinguishes `wild`, `zoo_captive`, `other_managed`, and `unknown` where the source and atlas scope support it. The polar-bear records identify zoo populations explicitly; access-denied wild research rows remain outside that atlas.

## Family and claims

Relationships identify real subject and object animal IDs, relationship type, evidence status, and source IDs. Biological parentage is distinct from social, foster, and adoptive relationships. A probability or dispute is represented in status and evidence instead of being converted into certainty.

Claims preserve sourced facts that do not fit a relationship edge, including conflicting reports, sibling statements, unknown-status notes, and unresolved co-parent names. Conflicting claims coexist; validation rejects dangling IDs and ancestry cycles.

## Events and dates

Births, deaths, transfers, releases, and observations are individual events. Transfer records can name both the origin and destination; an unknown institution stays unknown. Date objects retain exact, month, year, approximate, or unknown precision. A year-only source is never silently expanded into an exact date.

## Sources and media

Every source has a stable source ID, title, direct URL, publisher or source type where available, and access/review metadata. Animals, claims, relationships, events, and media can refer to one or more source IDs.

Media records distinguish an original source page from a direct image URL. Embedding and rights states are explicit. Local media is resolved only through an injected manifest with source, credit, rights, path, checksum, and archive-status metadata; the public site does not fetch from a hidden proxy.
