# Red-panda upstream sync audit

This document describes the current import of `wwoast/redpanda-lineage` into the red-panda Atlas. The merge produces one canonical atlas with a single canonical `animals` array in [`atlas.json`](../atlases/red-panda/atlas.json); [`curated-atlas.json`](../atlases/red-panda/curated-atlas.json) remains the stable merge input. The machine-readable snapshot is [`upstream_snapshot.json`](../atlases/red-panda/upstream_snapshot.json); the complete record and edge mappings are in [`upstream_sync_report.json`](../atlases/red-panda/upstream_sync_report.json). The raw 10 MB export was inspected outside tracked files and is not committed.

## Pinned source

| Field | Retrieved value |
| --- | --- |
| README export link | <https://wwoast.github.io/redpanda-lineage/export/redpanda.json> |
| Effective export URL | <https://redpandafinder.com/export/redpanda.json> |
| Retrieval time | `2026-10-08T02:32:54Z` |
| Export SHA-256 | `8439cf1bb89cea314e4d59f91f995847572c7bf03e393f2dc6430d2d0d7e4d3b` |
| Export size | 10,267,146 bytes |
| Export `Last-Modified` | `Mon, 05 Oct 2026 21:45:29 GMT` |
| Repository commit at retrieval | [`8d4eb19aeca4b6b9c6656318625f0c0acb618d4d`](https://github.com/wwoast/redpanda-lineage/commit/8d4eb19aeca4b6b9c6656318625f0c0acb618d4d), committed `2026-10-05T21:45:05Z` |
| Commit embedded in export | `a6f698d7fa5ed10e5b6e4076a38d1654cd05645b` |
| License audit | Repository metadata returned `license: null`; `/license` returned HTTP 404; the complete, untruncated recursive tree at the pinned commit had no `LICENSE`, `COPYING`, or `COPYRIGHT` path |

The export link in the upstream README redirects to `redpandafinder.com`. No explicit license was found during this retrieval; that records the audit result without making a legal conclusion or treating the missing declaration as a grant of media or data reuse rights. The import retains source-linked factual records and keeps media link-only; the export bytes and image files are not bundled.

Every source record carries a provenance tier: the community lineage export is `D`, official zoo or institutional evidence is `B`, peer-reviewed research is `C` when present, and secondary or discovery-only material is `discovery_only`. No source is assigned `A` without stated open reuse terms.

## Source inventory

| Source record type | Count |
| --- | ---: |
| Panda profiles | 1,475 |
| Zoo vertices | 320 |
| Media vertices | 450 |
| Wild population/location markers | 6 |
| `links` attribution vertices | 4 |
| `none` sentinel vertices | 1 |

Photo references are counted separately from media vertices and URL links:

| Vertex type | Photo references |
| --- | ---: |
| Panda profiles | 50,982 |
| Media vertices | 2,568 |
| Zoo vertices | 453 |
| Wild markers | 1 |
| **Total** | **54,004** |

The four `links` vertices are source attribution nodes, not the total URL count. Across vertices, HTTP(S)-prefixed URL strings occur 19,402 times with 2,566 distinct values; one string is malformed as an HTTP URL and is counted separately in the report. Within photo `source` fields there are 18,188 HTTP(S)-prefixed references with 1,422 distinct values, including that malformed string. Photo `url` fields contain 428 HTTP(S) references and 428 distinct values. The report retains these counts separately from source-link vertices and photo-reference totals.

## Matching and record outcomes

Matching is deterministic and conservative:

1. Match an upstream profile ID to an exact curated external ID in the `wwoast-redpanda-lineage` namespace.
2. Otherwise require an exact normalized name, birth date, current zoo, and the same fully mapped set of known parents.
3. If more than one curated record meets the key, do not merge. If name, birth date, and zoo match but known-parent sets differ, record a near match and do not merge. A separately reviewed external-ID crosswalk may resolve an identity when direct primary evidence confirms the individual; each source relationship still receives its own evidence review.

Four reviewed external-ID crosswalks match upstream records to curated identities:

| Upstream ID | Curated animal ID | Evidence used for review |
| --- | --- | --- |
| `34` | `red-panda:futa` | S02 (B) identifies Futa's parents Nara and Fu-Fu; S22 (B) confirms Futa's Nihondaira birth and 2004-03-30 arrival in Chiba. |
| `49` | `red-panda:nara` | S02 (B) identifies Nara as Futa's mother; S08 (D) supports the matching Japanese name/profile. |
| `50` | `red-panda:fufu` | S02 (B) identifies Fu-Fu as Futa's father; S08 (D) supports the matching Japanese alias/profile. |
| `200` | `red-panda:kelu` | S24 (B), the official Zoológico Nacional de Chile account post, names Kelú and gives his exact 2015-12-25 birth date and Parquemet birthplace; the upstream name, date, and mapped zoo agree. S24's public Instagram oEmbed caption was verified. The two upstream parent edges are separately excluded because no cited primary source establishes Kelú's parents. |

The upstream zoo vertex `-56` (`Chilean National Zoo` / `Zoológico Nacional de Chile`) is separately crosswalked to curated institution `place:311a839503c54580`, supported by the official Parquemet identity in S24. Kelú's upstream birthplace edge then maps to the existing cited birth event, avoiding a duplicate event or institution.

The curated source-linked facts remain preferred, while upstream evidence and disagreements are retained in the report. No other profile matched using the secondary composite key. The 1,471 other upstream profiles are added to the 83 curated identities, for 1,554 canonical animals.

The report lists 71 other near-match candidates that were not auto-merged: 70 have at least one unavailable or unresolved required field, and one has a required-field mismatch. S24, the official Zoológico Nacional de Chile account post, supports Kelú's name, birth on 2015-12-25 at Zoológico de Parquemet, and August 2023 death announcement. The account and post caption were verified using Instagram's public oEmbed endpoint. S25 records an unnamed cub born on the same date but does not itself identify Kelú. T13's article is discovery-only and is not used as final factual evidence. The two upstream family edges for ID `200` point to IDs `198` and `199`, but are retained only in the audit mapping; they do not establish parentage in canonical data.

### Source-ID resolution review

| Source ID / tier | Reviewed assertion | Resolution in canonical data |
| --- | --- | --- |
| S07 / `discovery_only` | ChiiChii's 2015 death date and cause | The death event was removed and status is `unknown`. S07's 2011 litter sire and maternal-behavior details are not retained. |
| S07 / `discovery_only`; S23 / `B` | ChiiChii's 2011 litter | The event now records two births and both cubs' deaths in May 2011, supported by Chiba Zoo's [Vol. 81 diary](https://www.city.chiba.jp/zoo/guide/documents/vol81.pdf); it does not identify the sire or cause/behavior. |
| S09 / `discovery_only` | Yuka Tobe birth, transfer, and death events | All three events were removed; status is `unknown`. |
| S12 / `discovery_only`; S24 / `B`; export / `D` | Kouta transfer/death and Kelú parentage | Kouta's move and death events were removed. The Kelú parent claim and both upstream parent edges remain unasserted because S24 confirms identity but names no parents; the export edges remain available in the audit mapping. |
| S24 / `B`; S25 / `B` | Kelú's name, birth, and death; the 2015 government announcement | The official [Zoo post](https://www.instagram.com/p/Cv7skWKuggY/) supports Kelú's name, birth date/place, and August 2023 death announcement; its caption was returned by Instagram's public oEmbed endpoint. The [Chile government release](https://www.gob.cl/noticias/minvu-presenta-al-primer-panda-rojo-nacido-en-chile-y-anuncia-concurso-para-buscarle-nombre/) describes an unnamed cub born on the same date but does not link that cub to Kelú. Neither source names parents. |

The full machine-readable review has eight item-level entries in `unresolved_curated_source_review`, including the unasserted 2011 litter sire/cause detail. Every factual canonical animal name, claim, relationship, and event has a corresponding row in `canonical_source_tier_audit` and at least one A/B/C/D source; discovery-only citations never stand alone as the final support.

Every source panda ID maps to one final animal ID. The report has a mapping or explicit exclusion for each of the 2,256 source vertices, all 83 curated animal IDs, all 320 zoo-to-institution IDs, the four reviewed identity crosswalks, and all 7,331 source edges across the family, litter, zoo, and birthplace labels. Media vertices map to retained per-animal media metadata where possible; unmatched media, wild markers, link vertices, and the `none` sentinel have explicit exclusions and never become animals.

## Family and litter graph handling

The source graph stores family edges with the child at `_in` and the parent at `_out`. Atlas uses parent as relationship subject and child as object, so every valid family edge is inverted. The import records:

- 3,037 source family edges.
- 732 unknown-offspring markers at `_in=none` and zero unknown-parent markers at `_out=none`.
- 2,305 panda-to-panda edges, including one self-edge; the self-edge and two unconfirmed Kelú parent edges are excluded, leaving 2,302 canonical parent links.
- 1,411 source litter edges, including 362 unknown-litter-member markers and 1,049 valid animal-to-animal edges.
- 525 unique litter-pair claims after reciprocal/duplicate source edges are collapsed.

Unknown markers never become parent or litter-member animal nodes. Litter associations remain claims rather than social relationships. The raw edge, source edge ID, mapped IDs, import status, and any exclusion reason remain in `edge_id_mappings`.

Zoo edges identify the profile's current facility but contain no effective date. All 1,470 zoo edges map to the source animal and institution in the report; these associations are used as an identity-resolution feature and are not converted into dated events. For birthplace edges, 1,375 zoo endpoints map to dated birth events with an institution, and three wild-marker endpoints map to dated birth events without converting the marker into an institution. Twelve zoo endpoints and 23 wild markers have no usable profile birth date and are explicitly excluded from event mapping. Every edge remains auditable, including its raw source edge, mapped IDs, status, and any exclusion reason.

## Media and stripped fields

Only HTTP(S) source-page URLs and direct-remote URLs connected to a named panda are retained as metadata. The 5,839 imported upstream media records use `rights_status: "unknown"`; the 78 inherited curated media records use the descriptive value `link-only; source-specific rights are not cleared for reuse`. Both groups set `embedding_status: "link_only"` and `offline_archive_eligible: false`. The public media resolver uses direct URLs only when both embedding and rights status explicitly allow it, so these unlicensed links do not cause the UI to fetch or display images.

| Media accounting | Count |
| --- | ---: |
| Photo references with attributable retained URL metadata | 17,740 |
| Retained direct-remote URL references | 425 |
| New deduplicated upstream media records | 5,839 |
| Photo references omitted from canonical animal media | 36,264 |
| `path` fields stripped, by vertex type | 2,255 (`panda` 1,475; `zoo` 320; `media` 450; `wild` 6; `links` 4) |
| Image or byte payload fields found and stripped | 0 |
| Source records with `photos` arrays removed from canonical output | 2,251 |

Local/opaque image URLs such as `cwdc://` and `ig://`, all local `path` values, and any raw image bytes are absent from the canonical atlas. No image bytes or local paths are present in canonical data. One malformed HTTP-like photo source is not used as a media source page and is documented in the report. The report includes all stripped-field counts, dropped-photo reasons, retained metadata reference counts, and direct-URL counts.

## Rebuild

The importer uses only the Python standard library. A current network sync fetches the README-linked export and repository metadata, records the effective URL, retrieval timestamp, byte length, checksum, repository commit and license metadata, and regenerates the canonical atlas and reports:

```sh
python3 tools/import/sync_red_panda_upstream.py
```

For an offline replay, provide a locally held raw export and the matching pinned metadata. The tool checks both SHA-256 and byte length before merging:

```sh
python3 tools/import/sync_red_panda_upstream.py \
  --input-json /path/to/redpanda.json \
  --snapshot-json atlases/red-panda/upstream_snapshot.json
```

The original curated base is `atlases/red-panda/curated-atlas.json`; the merged output does not feed back into its next run. No dependencies are installed by the sync command.
