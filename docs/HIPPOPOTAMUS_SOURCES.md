# Hippopotamus atlas source notes

Research and review date: **2026-10-07**. All links below were opened on that date. The canonical dataset is [`atlases/hippopotamus/atlas.json`](../atlases/hippopotamus/atlas.json).

## Corpus and counting

The v1 corpus contains five named **common hippopotamuses** (*Hippopotamus amphibius*) at Cincinnati Zoo, four biological parent links, six birth, transfer, and death events, one source-backed sibling claim, eight source records, and one link-only media reference. The family pairs are Bibi and Henry as Fiona's parents, and Bibi and Tucker as Fritz's parents. This small, source-bounded family is not a Cincinnati Zoo history or a common-hippo studbook.

## Primary sources

| Source ID | Direct source | Published | Atlas use and limits |
|---|---|---|---|
| `source:hippopotamus:cincinnati-fiona-birth` | [Hippo Baby Arrives Six Weeks Early](https://cincinnatizoo.org/hippo-baby-arrives-six-weeks-early-cincinnati-zoo-staff-providing-critical-care-for-premature-calf/) | 2017-01-24 | Says Bibi gave birth to a female calf on 2017-01-24. |
| `source:hippopotamus:cincinnati-fiona-name` | [Cincinnati Zoo’s Hippo Baby has a Name](https://cincinnatizoo.org/cincinnati-zoos-hippo-baby-has-a-name/) | Posted 2017-02-01; announcement dated 2017-01-31 | Names the calf Fiona, says Bibi is her mother and Henry is her father, and repeats the January 24 birth date. |
| `source:hippopotamus:cincinnati-family-reunion` | [Hippo Blog #9: Bloat of 3, Finally!](https://cincinnatizoo.org/hippo-blog-9-bloat-of-3-finally/) | 2017-07-18 | Reports Fiona's family reunion and directly identifies Henry and Bibi as her father and mother. |
| `source:hippopotamus:cincinnati-fritz` | [Fritz Explores Outside](https://cincinnatizoo.org/fritz-explores-outside/) | 2022-08-16 | Gives Fritz's birth date (2022-08-03), identifies Bibi as his mother, Fiona as his older sister, and Tucker as his father. |
| `source:hippopotamus:cincinnati-henry-death` | [Cincinnati Zoo Mourns Loss of Henry the Hippo](https://cincinnatizoo.org/cincinnati-zoo-mourns-loss-henry-hippo/) | 2017-10-31 | Reports Henry's euthanasia that day, confirms his fatherhood of Fiona, and identifies Dickerson Park Zoo as his prior institution and St. Louis Zoo as Bibi's. |
| `source:hippopotamus:cincinnati-tucker-arrival` | [Hippo Introductions Happening Faster than Expected at the Cincinnati Zoo](https://cincinnatizoo.org/hippo-introductions-happening-faster-than-expected-at-the-cincinnati-zoo/) | 2021-09-27 | Identifies Tucker as male and reports his move from San Francisco to Cincinnati earlier in September. |
| `source:hippopotamus:cincinnati-2024-roster` | [Meet the 2024 Zoo Babies!](https://cincinnatizoo.org/meet-the-2024-zoo-babies/) | 2024-05-01 | Lists Fritz as male, born 2022-08-03, to Bibi and Tucker. |
| `source:hippopotamus:cincinnati-annual-report-2022-23` | [Animal Excellence in Action: Cincinnati Zoo Annual Report 2022–23](https://cincinnatizoo.org/wp-content/uploads/2023/11/AnnualReport_2022-23.pdf) | 2023 | Calls Fritz Fiona's little brother, confirms Bibi/Tucker parentage, and includes a photo labeled as Fritz with a cover credit to Kathy Newton. The photo is linked only. |

## Evidence decisions

- The zoo's January 2017 birth announcement identifies Fiona as female and Bibi as her mother. The name announcement identifies Henry as her father. The July care report repeats both parents after their reintroduction, so each parent edge cites direct Cincinnati Zoo evidence.
- The 2022 announcement identifies Fritz as born on August 3, Bibi as his mother, Tucker as his father, and Fiona as his sister. The sister fact is stored as a source-backed claim; it is not rendered as an ancestry edge.
- Exact birth and death dates are retained as exact. Henry's 2017 death is recorded from the zoo's announcement. Current living status of Bibi, Fiona, Tucker, and Fritz was not confirmed in the 2026 review, so those four status fields remain unknown.
- The Zoo says Henry came from Dickerson Park Zoo and Bibi from St. Louis Zoo; their 2016 arrival dates are only year precision. The 2021 Tucker announcement reports his arrival from San Francisco earlier that September but does not name a facility, so the origin is not assigned to a specific institution. No dates or moves are invented beyond those reports.
- The atlas stores no translated names or aliases because the cited sources only provide the canonical English names. It records one Cincinnati Zoo institution and no unsupported moves.
- The media record links to the official annual report where a Fritz photo is labeled and credits the cover image to Kathy Newton. Image rights and embedding permissions were not established; the atlas has no direct image URL or local photograph and does not reuse page text or images. Fiona's articles remain source links, not media assets.

## Scope and gaps

Only common hippopotamus is included. Pygmy hippopotamus (*Choeropsis liberiensis*) is a different taxon, and this research did not find an openly usable, individually sourced pedigree corpus for it. Other Cincinnati Zoo hippos and transfers are omitted unless a primary public page supports the identity and event. Future additions should cite the original zoo record, preserve published date precision, and keep common and pygmy hippopotamuses separate.
