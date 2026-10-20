# Hippopotamus sources and data scope

## Canonical coverage

The unified hippopotamus atlas contains two separate taxa in one canonical dataset:

| Taxon | Animals | Parent relationships | Institutions represented |
| --- | ---: | ---: | ---: |
| Common hippopotamus (*Hippopotamus amphibius*) | 64 | 61 | 28 |
| Pygmy hippopotamus (*Choeropsis liberiensis*) | 32 | 25 | 17 |
| **Total** | **96** | **86** | **47** |

The current atlas also contains 122 claims, 95 events, 73 source records, and one link-only media reference retained from the earlier Cincinnati Zoo data. Every known pygmy-hippo sex value has its own cited claim. No relationship crosses the two taxa. Only directly stated parentage was entered; an unknown parent, an unnamed calf, co-housing, or a public population count does not create an animal or edge.

The Phase 2 common-hippo bundle contained 60 named individuals and mapped five Cincinnati Zoo identities to existing curated records. The Phase 2 pygmy-hippo bundle added 25 named individuals. Phase 3 added four common hippos from ABQ BioPark and seven pygmy hippos from Basel and Taronga Zoo. The reproducible Phase 2 merge command and crosswalks remain in [`reports/hippopotamus-merged-import.json`](../reports/hippopotamus-merged-import.json); the report now includes current canonical counts and a separate Phase 3 supplement summary.

All 96 records are identified as `zoo_captive` because the imported facts describe zoo managed animals and histories. This is a population facet label; it does not imply that every animal is currently living. No wild hippopotamus records were added from population totals or unsupported sources.

## Source review

Every canonical factual record links to one or more source IDs. The 69 source records are tier B: official zoo, zoological-society, conservation-group, or zoo-association pages and publications. Sixty-six are cited by canonical animal, claim, relationship, event, or media records; three contextual records document studbook access and institutional scope in the research notes. No open bulk pedigree dataset was imported; therefore there are no tier A rows in this release. The tier definitions and their limits are documented in [`DATA_PROVENANCE_TIERS.md`](DATA_PROVENANCE_TIERS.md).

The common-hippo research note lists exact source URLs, publication dates, access date, and record-level decisions across Cincinnati, San Diego, Woodland Park, Prague, Budapest, Ostrava, Japanese zoos, Berlin, London, and other public institutional records: [`HIPPOPOTAMUS_COMMON_SOURCES.md`](HIPPOPOTAMUS_COMMON_SOURCES.md). The pygmy-hippo note enumerates the official records used from Edinburgh and London, Ueno, Buin, NIFREL, Toronto, John Ball, Pittsburgh, Richmond, Khao Kheow, and La Flèche: [`HIPPOPOTAMUS_PYGMY_SOURCES.md`](HIPPOPOTAMUS_PYGMY_SOURCES.md).

### Phase 3 official zoo records reviewed 2026-10-20

| Source ID | Direct source | Published | Atlas use and limits |
|---|---|---|---|
| `hippopotamus-common-source-abq-maisy-birth` | [Hip-Hippo Hooray! ABQ BioPark Celebrates Birth of New Hippo Calf](https://www.cabq.gov/artsculture/biopark/news/hip-hippo-hooray-abq-biopark-celebrates-birth-of-new-hippo-calf) | 2025-10-14 | Reports Karen and Moe’s fourth calf, Matilda as their four-year-old daughter, and the exact birth date; the calf was unnamed at that time. |
| `hippopotamus-common-source-abq-maisy-name` | [ABQ BioPark Announces Winner of Baby Hippo Naming Contest](https://www.cabq.gov/artsculture/biopark/news/abq-biopark-announces-winner-of-baby-hippo-naming-contest) | 2025-11-05 | Names the female calf Maisy and confirms her parents. Matilda’s exact birth date remains unknown. |
| `hippopotamus-pygmy-source-basel-voobadee-family` | [Merry-go-round of males for the pygmy hippos](https://www.zoobasel.ch/en/aktuelles/news/1500/maennchen-rochade-bei-den-zwergflusspferden/) | 2025-09-03 | Names Ashaki, Napoleon, Voobadee and Ume; reports Voobadee’s exact birth date and parents, Napoleon’s moves, and Ume’s birth year and return. Unnamed offspring mentioned in population history were not added as animals. |
| `hippopotamus-pygmy-source-taronga-lololi-birth` | [Pygmy Hippo Calf born at Taronga Zoo!](https://www.taronga.org.au/about/newsroom/posts/pygmy-hippo-calf-born-at-taronga-zoo) | 2025-04-08 | Names female Lololi and identifies parents Kambiri and Fergus. The page also calls her four weeks old in April 2025 while stating a January 2024 birth date; event date is unknown until the source resolves the discrepancy. |

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
