# Red panda migration

The atlas started with the cited Futa-family layer from `FFJ-Red-Panda-Atlas-card-ui-20261007`, source commit `fe97aff63d87948232462ea4b60873460de96948`. Its 83 animal records, source-linked claims, relationships, events, institutions, media references, and sources are preserved in [`curated-atlas.json`](../atlases/red-panda/curated-atlas.json). The original ID mapping remains in [`legacy_id_map.json`](../atlases/red-panda/legacy_id_map.json).

The current canonical [`atlas.json`](../atlases/red-panda/atlas.json) combines the curated layer with the pinned `wwoast/redpanda-lineage` export. It contains 1,554 animals: all 83 curated identities and 1,471 additional upstream profiles. Four reviewed crosswalks match upstream Futa (`34`), Nara (`49`), Fu-Fu (`50`), and Kelú (`200`) to curated IDs `red-panda:futa`, `red-panda:nara`, `red-panda:fufu`, and `red-panda:kelu`. S02 supports Futa's named parents; S22 confirms Futa's Nihondaira birth and arrival in Chiba. S24, the official Zoo account post, confirms Kelú's name, exact birth date, and Parquemet birthplace; its public Instagram oEmbed caption was verified. Seventy-one other near-match candidates remain separate. The two upstream parent edges for Kelú are mapped but excluded from canonical parentage because no cited primary source establishes those parents.

The importer preserves curated values as preferred. Where an upstream value conflicts with a matched curated fact, it adds a source-linked alternate claim and records the conflict. Every upstream animal, zoo, and edge in all four source classes has a mapping or explicit exclusion in [`upstream_sync_report.json`](../atlases/red-panda/upstream_sync_report.json). Unknown-offspring and unknown-litter-member markers are reported without creating animals. Family edges are inverted from upstream child-to-parent direction into Atlas parent-to-child direction; litter associations are claims, not social-partner relationships. Undated current-holding zoo edges are mapped for identity review without becoming timeline events.

The current curated layer has 94 relationships (77 biological and 17 social) and 167 events. A source-tier audit in the sync report checks every animal name, claim, relationship, and event for at least one A/B/C/D source. Eight inherited assertions or details supported only by discovery-only sources are explicitly resolved in that report; they are removed or reduced rather than left as unsupported facts:

| Source ID and tier | Prior assertion or review | Current resolution |
| --- | --- | --- |
| S07 (`discovery_only`) | ChiiChii's exact 2015 death date and cause | Event removed; status is unknown. |
| S07 (`discovery_only`); S23 (`B`) | 2011 litter sire and reported maternal behavior | The litter event remains with S23 support for two births and both cubs' deaths in May 2011; sire and cause/behavior are not asserted. |
| S09 (`discovery_only`) | Yuka Tobe birth, transfer, and death events | All three events removed; status is unknown. |
| S12 (`discovery_only`) | Kouta's transfer to Chile and 2017 death | Both events removed; status is unknown. |
| S12 (`discovery_only`); S24 (`B`); export (`D`) | Kelú identity and birth/death; proposed Kouta/Lili parentage | S24 confirms the name, exact birth date/place, and August 2023 death announcement; S25 separately describes an unnamed cub born on that date. The two upstream parent edges remain auditable but are excluded from canonical parentage, which remains unconfirmed. |

S23 is Chiba Zoo's [2011 diary](https://www.city.chiba.jp/zoo/guide/documents/vol81.pdf). S24 is the [official Zoológico Nacional de Chile post](https://www.instagram.com/p/Cv7skWKuggY/); its public oEmbed response identifies the account and returns the caption with Kelú's name, birth date, and birthplace. S25 is the [official Chilean government release](https://www.gob.cl/noticias/minvu-presenta-al-primer-panda-rojo-nacido-en-chile-y-anuncia-concurso-para-buscarle-nombre/), which described the cub as unnamed when published. The official sources do not name Kelú's parents. The complete item-by-item history, source IDs, tiers, and reasons are in `unresolved_curated_source_review` and `canonical_source_tier_audit` in the sync report.

The GitHub metadata license field was null, its dedicated license endpoint returned HTTP 404, and the complete tree at the pinned commit contained no `LICENSE`, `COPYING`, or `COPYRIGHT` file. No explicit license was found during this retrieval; this is an audit result, not a legal conclusion. The canonical atlas retains only link metadata for attributable photo pages and direct remote URLs. All 5,839 imported upstream media records have `rights_status: "unknown"`; the 78 inherited curated media records use the descriptive value `link-only; source-specific rights are not cleared for reuse`. Both groups have `embedding_status: "link_only"` and `offline_archive_eligible: false`. The runtime resolver returns a placeholder unless explicit embedding permission and eligible rights are recorded. No image bytes or local paths are included.

Source tiers record evidence type: the community export is `D`, official zoo and institutional records are `B`, peer-reviewed research is `C` when present, and secondary material used for discovery is `discovery_only`. No `A` tier is assigned without stated open reuse terms.

## Historical first-stage migration

The first migration report, [`migration_report.json`](../atlases/red-panda/migration_report.json), records the curated Futa-family import before the global profiles were merged. Its section describing the upstream snapshot as excluded is historical; the current upstream state, pin, counts, exclusions, and media handling are recorded in [`RED_PANDA_UPSTREAM_SYNC.md`](RED_PANDA_UPSTREAM_SYNC.md) and `upstream_sync_report.json`.

The initial migration validated 83 source and target IDs and preserved 76 explicit parent relationships. Seven unnamed-outcome events covered eight outcomes, with one additional unquantified birth event. Unresolved co-parent names remain claims rather than invented animal records.

## Rebuild and checks

The current sync command fetches the export URL linked from the upstream README, records the effective URL, UTC retrieval time, SHA-256, byte length, and current repository commit, then deterministically rebuilds the atlas and report:

```sh
python3 tools/import/sync_red_panda_upstream.py
```

To replay a locally held export, pass its file and the pinned metadata. The importer verifies the file hash and byte length before processing it; the raw upstream file is not committed because the repository provides no explicit reuse license.

```sh
python3 tools/import/sync_red_panda_upstream.py \
  --input-json /path/to/redpanda.json \
  --snapshot-json atlases/red-panda/upstream_snapshot.json
```

The old aggregate report remains a historical audit. Use the current sync report for present-day source counts, match decisions, conflicts, edge mappings, and media exclusions.
