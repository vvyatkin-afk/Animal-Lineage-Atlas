# Hippopotamus sources and data scope

## Canonical coverage

The unified hippopotamus atlas contains two separate taxa in one canonical dataset:

| Taxon | Animals | Parent relationships | Institutions represented |
| --- | ---: | ---: | ---: |
| Common hippopotamus (*Hippopotamus amphibius*) | 60 | 57 | 27 |
| Pygmy hippopotamus (*Choeropsis liberiensis*) | 25 | 21 | 12 |
| **Total** | **85** | **78** | **41** |

The merged atlas also contains 111 claims, 85 events, 69 source records, and one link-only media reference retained from the earlier Cincinnati Zoo data. Every known pygmy-hippo sex value has its own cited claim. No relationship crosses the two taxa. Only directly stated parentage was entered; an unknown parent, an unnamed calf, co-housing, or a public population count does not create an animal or edge.

The common-hippo bundle contains 60 named individuals. Its report maps five exact Cincinnati Zoo identities to the existing curated records, leaving 55 additional common-hippo individuals. The pygmy-hippo bundle adds 25 named individuals. The reproducible merge command and complete per-record crosswalks are in [`reports/hippopotamus-merged-import.json`](../reports/hippopotamus-merged-import.json); bundle hashes and research decisions are in the [common-hippo report](../reports/common-hippo-import.json) and [pygmy-hippo report](../reports/pygmy-hippo-import.json).

All 85 records are identified as `zoo_captive` because the imported facts describe zoo managed animals and histories. This is a population facet label; it does not imply that every animal is currently living. No wild hippopotamus records were added from population totals or unsupported sources.

## Source review

Every canonical factual record links to one or more source IDs. The 69 source records are tier B: official zoo, zoological-society, conservation-group, or zoo-association pages and publications. Sixty-six are cited by canonical animal, claim, relationship, event, or media records; three contextual records document studbook access and institutional scope in the research notes. No open bulk pedigree dataset was imported; therefore there are no tier A rows in this release. The tier definitions and their limits are documented in [`DATA_PROVENANCE_TIERS.md`](DATA_PROVENANCE_TIERS.md).

The common-hippo research note lists exact source URLs, publication dates, access date, and record-level decisions across Cincinnati, San Diego, Woodland Park, Prague, Budapest, Ostrava, Japanese zoos, Berlin, London, and other public institutional records: [`HIPPOPOTAMUS_COMMON_SOURCES.md`](HIPPOPOTAMUS_COMMON_SOURCES.md). The pygmy-hippo note enumerates the official records used from Edinburgh and London, Ueno, Buin, NIFREL, Toronto, John Ball, Pittsburgh, Richmond, Khao Kheow, and La Flèche: [`HIPPOPOTAMUS_PYGMY_SOURCES.md`](HIPPOPOTAMUS_PYGMY_SOURCES.md).

## Exclusions and limits

- The IUCN SSC Hippo Specialist Group identifies common and pygmy studbooks as keeper-requested material. Their individual rows were not copied or reconstructed. Published population totals are context only.
- A public Zoo Ostrava historical chapter is cited for the facts it states. The full European studbook and unstated studbook identifiers are not reproduced, and no reuse license is asserted for the chapter.
- The Japanese common-hippo studbook is not reproduced. Public zoo pages and publications provide the included records.
- Khao Kheow's official page and a Thailand Zoological Park Organization publication were used for the supported parentage. The page reports the calf's introduction date; no birth date is inferred.
- Current living status remains unknown when the source does not establish it. Partial dates keep their stated precision. No placeholder animal or parent is created for missing information.
- No new animal media is included in either import. The existing annual-report link is `link_only`; the repository and build contain no photo bytes or local image paths.

The canonical merge was produced from the Phase 1 hippo baseline at immutable revision `279c722` with:

```sh
git show 279c722:atlases/hippopotamus/atlas.json > /tmp/hippopotamus-phase1.json
python3 tools/merge_hippopotamus_imports.py \
  --canonical /tmp/hippopotamus-phase1.json \
  --canonical-revision 279c722 \
  --common-bundle atlases/hippopotamus/imports/common-hippo.json \
  --common-report reports/common-hippo-import.json \
  --pygmy-bundle atlases/hippopotamus/imports/pygmy-hippo.json \
  --pygmy-report reports/pygmy-hippo-import.json \
  --out atlases/hippopotamus/atlas.json \
  --report-out reports/hippopotamus-merged-import.json
```
