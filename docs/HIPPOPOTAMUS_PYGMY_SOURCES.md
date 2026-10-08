# Pygmy Hippopotamus Source Notes

Research and review date: **2026-10-08**. The source records below were reviewed on that date. This document covers only the `Choeropsis liberiensis` pygmy-hippo import; the common-hippo source notes and canonical atlas were not changed. The import bundle is [`atlases/hippopotamus/imports/pygmy-hippo.json`](../atlases/hippopotamus/imports/pygmy-hippo.json), with machine-readable decisions in [`reports/pygmy-hippo-import.json`](../reports/pygmy-hippo-import.json).

## Scope and counts

The bundle contains **25 named animals**, **21 sourced biological parent edges**, **26 sourced claims** (including one field-specific claim for each of the 24 known sex values), **21 sourced events**, **12 referenced institutions**, **24 included official zoo sources**, and no media records. It documents the named public records found in this research; it is not a complete captive population inventory or studbook.

A three-generation line connects Toronto Zoo and John Ball Zoo: Kindia is the mother of Penelope, and Penelope is the mother of Hugo. Separate families at Edinburgh Zoo, Ueno Zoo, Metro Richmond Zoo, and Khao Kheow Open Zoo are included where official sources explicitly state parentage. Motomoto’s birth and transfers connect Buin Zoo, NIFREL, and Ueno Zoo.

## Evidence decisions

### Edinburgh Zoo and ZSL London Zoo

Edinburgh Zoo’s official family material identifies Amara as a previous calf of Otto and Gloria, born in **2021**; it states Amara moved to ZSL London Zoo in **2023**. Both dates stay year-precision. The zoo’s Haggis announcement gives her exact birth date (**2024-10-30**) and parents. Its Piper announcement gives Piper’s exact birth date (**2026-07-31**), sex, and parents. The later Haggis family page says she left Edinburgh Zoo for another zoo but does not name the destination, so no destination is recorded.

### Ueno Zoo, Buin Zoo, and NIFREL

Ueno Zoo directly identifies Natsume and Momiji as sisters and says they were born to the same parents; it does not identify those parents. Natsume’s male calf Kobushi was born **2025-03-14** to Natsume and Motomoto. Momiji’s female calf Iroha was born **2025-12-25** to Momiji and Motomoto; Ueno named her in April 2026. Motomoto was born at Buin Zoo on **2013-07-09**, moved from NIFREL to Ueno Zoo on **2023-03-20**, and returned to NIFREL on **2026-05-25**. These facts come from Tokyo Zoological Park Society announcements and the Ueno Zoo’s own timeline.

### Toronto Zoo, John Ball Zoo, and Pittsburgh Zoo

Toronto Zoo records female calf Penelope, born **2018-08-10** to mother Kindia and sire Harvey; its October 2018 naming notice names her Penelope. The 2026 Toronto Zoo birth and naming releases identify Maple as Kindia and Harvey’s female calf born **2026-08-02**. John Ball Zoo records Hugo, born **2025-09-03** to Penelope and Jahari, and says Penelope arrived from Toronto Zoo in 2023 while Jahari came from Pittsburgh Zoo in early 2023. Toronto Zoo’s 2018 release also records Pogo’s birth on **1999-09-02** to Cleopatra and Psi, and says he left Toronto in November 2003 for Tampa’s Lowry Park Zoo. Kindia’s arrival from Parc Zoologique de La Flèche in June 2016 is recorded at month precision.

### Metro Richmond Zoo

The official zoo says Poppy was born **2024-12-09** to parents Iris and Corwin; the zoo’s naming release gives her name. The import records Iris as mother because she gave birth, and stores the directly named pair Iris and Corwin as a sourced claim. It does **not** assign Corwin a biological-father edge because the source names both parents but does not separately label his role.

### Khao Kheow Open Zoo, Thailand

Khao Kheow’s official Thai announcement identifies a female pygmy-hippo calf and names mother Jona and father Tony; its naming page gives the calf’s Thai name `หมูเด้ง`, rendered as Moo Deng in the zoo’s own official English-language document. The zoo says it introduced the calf on **2024-07-25**. That is stored as an introduction observation, not a birth event; the official source does not state a birth date. The Khao Kheow pages timed out on direct page fetch during this review, so their indexed text at the exact official URLs was cross-checked against the Zoological Park Organization of Thailand’s official report. No secondary or fan/news page was used as final evidence.

## Source and access list

All included sources were accessed **2026-10-08**. `—` means the source does not state a publication date or the date was not established from the page.

| Source ID | Publisher | Published | Accessed | Official source |
|---|---|---:|---:|---|
| `hippopotamus-pygmy-source-edinburgh-amara-family` | Edinburgh Zoo | — | 2026-10-08 | [Haggis’ Trivia Trail – Pygmy hippos](https://www.edinburghzoo.org.uk/animals/animal-inhabitants/pygmy-hippo/haggis/haggis-trivia-trail-4) |
| `hippopotamus-pygmy-source-edinburgh-haggis-family` | Edinburgh Zoo | — | 2026-10-08 | [Haggis hits the road](https://www.edinburghzoo.org.uk/animals/animal-inhabitants/pygmy-hippo/haggis) |
| `hippopotamus-pygmy-source-edinburgh-haggis-birth` | Edinburgh Zoo | 2024-11-04 | 2026-10-08 | [Moo Deng who? Edinburgh Zoo welcomes Haggis the endangered pygmy hippo calf](https://www.edinburghzoo.org.uk/news/moo-deng-who-edinburgh-zoo-welcomes-haggis-endangered-pygmy-hippo-calf) |
| `hippopotamus-pygmy-source-edinburgh-piper-birth` | Edinburgh Zoo | 2026-08-03 | 2026-10-08 | [That was quick! Baby hippo born at Edinburgh Zoo](https://www.edinburghzoo.org.uk/news/was-quick-baby-hippo-born-edinburgh-zoo) |
| `hippopotamus-pygmy-source-edinburgh-piper-name` | Edinburgh Zoo | 2026-08-07 | 2026-10-08 | [Pint-sized Piper: Baby pygmy hippo named after health check at Edinburgh Zoo](https://www.edinburghzoo.org.uk/news/pint-sized-piper-baby-pygmy-hippo-named-after-health-check-edinburgh-zoo) |
| `hippopotamus-pygmy-source-ueno-natsume-birth` | Tokyo Zoological Park Society (Ueno Zoo) | 2025-03-18 | 2026-10-08 | [Pygmy Hippopotamus hippo Natsume has given birth!](https://www.tokyo-zoo.net/en/topics/news/ueno/155_29052_2025-03-18.html) |
| `hippopotamus-pygmy-source-ueno-momiji-birth` | Tokyo Zoological Park Society (Ueno Zoo) | 2025-12-26 | 2026-10-08 | [Pygmy Hippopotamus “Momiji” has given birth!](https://www.tokyo-zoo.net/en/topics/news/ueno/041_29468_2025-12-27.html) |
| `hippopotamus-pygmy-source-ueno-sisters` | Tokyo Zoological Park Society (Ueno Zoo) | 2026-05-15 | 2026-10-08 | [Differences in behavior from breeding to raising offspring observed in two female Pygmy Hippopotamus hippos](https://www.tokyo-zoo.net/en/ueno/blog/11485/index.html) |
| `hippopotamus-pygmy-source-ueno-iroha-name` | Tokyo Zoological Park Society (Ueno Zoo) | 2026-04-07 | 2026-10-08 | [The baby Pygmy Hippopotamus has been named!](https://www.tokyo-zoo.net/en/ueno/news/11041/index.html) |
| `hippopotamus-pygmy-source-ueno-motomoto-transfer` | Tokyo Zoological Park Society (Ueno Zoo) | 2026-04-24 | 2026-10-08 | [We are moving Pygmy Hippopotamus “Motomoto” to NIFREL](https://www.tokyo-zoo.net/en/ueno/news/11241/index.html) |
| `hippopotamus-pygmy-source-ueno-kobushi-name` | Tokyo Zoological Park Society (Ueno Zoo) | 2025-05-18 | 2026-10-08 | [Ueno Zoo pygmy hippo mother-and-calf public-viewing announcement](https://www.tokyo-zoo.net/topics/news/ueno/079_29149_2025-05-18.html) |
| `hippopotamus-pygmy-source-ueno-about-kobushi` | Tokyo Zoological Park Society (Ueno Zoo) | — | 2026-10-08 | [About Ueno Zoo](https://www.tokyo-zoo.net/en/ueno/about/index.html) |
| `hippopotamus-pygmy-source-toronto-penelope-birth` | Toronto Zoo | 2018-08-21 | 2026-10-08 | [Toronto Zoo Welcomes Birth of Endangered Pygmy Hippopotamus Calf](https://www.torontozoo.com/press/2018/%21newsite.asp?pg=20180821) |
| `hippopotamus-pygmy-source-toronto-penelope-name` | Toronto Zoo | 2018-10-04 | 2026-10-08 | [Toronto Zoo’s Endangered Pygmy Hippopotamus Calf Has a Name!](https://www.torontozoo.com/press/2018/%21newsite.asp?pg=20181004) |
| `hippopotamus-pygmy-source-toronto-maple-birth` | Toronto Zoo | 2026-08-05 | 2026-10-08 | [Pygmy Hippo Calf Born At Your Toronto Zoo!](https://www.torontozoo.com/mediaroom/press2026/20260805-pygmy-hippo-calf) |
| `hippopotamus-pygmy-source-toronto-maple-name` | Toronto Zoo | 2026-08-21 | 2026-10-08 | [Introducing... Pygmy Hippo Calf Name Reveal!](https://www.torontozoo.com/mediaroom/press2026/20260821-maple) |
| `hippopotamus-pygmy-source-john-ball-hugo` | John Ball Zoo | 2025-12-02 | 2026-10-08 | [A Rare Birth: Behind The Scenes Of Baby Pygmy Hippo Hugo’s Arrival](https://jbzoo.org/2025/12/02/pygmy-hippo-arrival-at-john-ball-zoo/) |
| `hippopotamus-pygmy-source-richmond-poppy-birth` | Metro Richmond Zoo | 2024-12-24 | 2026-10-08 | [Pygmy Hippo Born Before Christmas](https://metrorichmondzoo.com/newsroom/pygmy-hippo-born-before-christmas/) |
| `hippopotamus-pygmy-source-richmond-poppy-name` | Metro Richmond Zoo | 2025-01-06 | 2026-10-08 | [Pygmy Hippo Name Announcement](https://metrorichmondzoo.com/newsroom/pygmy-hippo-name-announcement/) |
| `hippopotamus-pygmy-source-richmond-poppy-profile` | Metro Richmond Zoo | — | 2026-10-08 | [Poppy The Pygmy Hippo](https://metrorichmondzoo.com/animals/poppy-the-pygmy-hippo/) |
| `hippopotamus-pygmy-source-khao-moodeng-birth` | Khao Kheow Open Zoo | 2024-08-06 | 2026-10-08 | [ฉลองวันแม่แห่งชาติ สวนสัตว์เปิดเขาเขียว ชวนโหวตตั้งชื่อลูกฮิปโปโปเตมัสแคระ](https://khaokheow.zoothailand.org/ewt_news.php?n_id=1242) |
| `hippopotamus-pygmy-source-khao-moodeng-name` | Khao Kheow Open Zoo | 2024-08-20 | 2026-10-08 | [ได้ชื่อแล้ว น้องหมูเด้ง ลูกฮิปโปแคระ สวนสัตว์เปิดเขาเขียว](https://khaokheow.zoothailand.org/ewt_news.php?n_id=1247) |
| `hippopotamus-pygmy-source-khao-thailand-zoo-report` | Zoological Park Organization of Thailand | — | 2026-10-08 | [แผนวิสาหกิจ พ.ศ. 2566–2570 (ฉบับทบทวนปีงบประมาณ 2569) ของ อสส.](https://www.zoothailand.org/download/article/article_20250918104413.pdf) |
| `hippopotamus-pygmy-source-khao-english-name` | Khao Kheow Open Zoo | — | 2026-10-08 | [Official Khao Kheow Open Zoo PDF (article_20260618143005.pdf)](https://khaokheow.zoothailand.org/download/article/article_20260618143005.pdf) |

## Studbook access and exclusions

The [IUCN SSC Hippo Specialist Group studbooks page](https://www.hipposg.org/studbooks) reports that the 2021 global pygmy-hippo studbook listed **1,677 total animals** and **452 living animals in 146 institutions** as of 2021-12-31. The page reports the population totals but does not provide the individual register as an openly downloadable file; its 2020 section says the studbook can be obtained from the keeper. The counts are contextual only and do not authorize individual-level reuse. No restricted studbook records were requested, copied, reconstructed, or imported.

Unnamed calves were not added as animal records or given placeholder names. No parentage was inferred from shared enclosures or expected breeding pairs. Current living status is unknown for all imported animals. No local images, direct image URLs, or image bytes were retained. The bundle has an empty `media` array.

## Validation and scope boundary

The import bundle passed the repository JSON Schema validator and Atlas data validator. Every animal name, parent relationship, claim, and event has source IDs. The existing institution schema has no `source_ids` field, so the machine-readable report includes an `institution_source_map` linking each institution ID to the official sources attached to events that name it. The canonical `atlases/hippopotamus/atlas.json`, `docs/HIPPOPOTAMUS_SOURCES.md`, shared schema/UI/release files, other species, and the legacy site were not modified.
