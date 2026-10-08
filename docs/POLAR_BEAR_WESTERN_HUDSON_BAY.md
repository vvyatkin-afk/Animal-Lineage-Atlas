# Western Hudson Bay polar-bear pedigree source audit

Research date: **2026-10-08**. This note records Dryad’s stated reuse terms, dataset-level metadata, public download responses, and the decision not to import unavailable data rows. No wild bear records were added to the zoo/captive-history atlas.

## Dataset citation and scope

Malenfant, René M.; Davis, Corey S.; Richardson, Evan S.; Lunn, Nicholas J.; Coltman, David W. (2022). *Data from: Heritability of body size in the polar bears of Western Hudson Bay* [Dataset]. Dryad. [https://doi.org/10.5061/dryad.23d8v](https://doi.org/10.5061/dryad.23d8v).

Dryad’s [dataset page](https://datadryad.org/dataset/doi:10.5061/dryad.23d8v) identifies the authors and dataset title, and reports a 4,449-individual pedigree. Its dataset description places the work in Western Hudson Bay near Churchill, Manitoba, and covers handled bears from 1966 through 2011. The data file is `pedigree.txt`; Dryad describes it as tab-delimited and marks unknown parent values as `NA`. The reported dataset facts describe a **wild research population**. They do not establish identity links to named zoo bears.

The citation and page metadata are dataset-level facts. Because the row file was not returned, this review could not inspect the underlying individual IDs, row count, parent codes, sex fields, or any other row-level value.

## Reuse terms checked

Dryad’s [reuse guide](https://v3.datadryad.org/help/guides/reuse) and [current terms of service](https://datadryad.org/terms) state that datasets published by Dryad use the **CC0 Public Domain Dedication**. Dryad’s current terms page is marked updated **2025-05-20**. The dataset page and Dryad’s reuse guide therefore indicate that the dataset is reusable under Dryad’s stated terms. Attribution is recommended as scholarly courtesy. This note records Dryad’s statement; it is not an independent legal determination.

The official metadata route [lists version 22062 and file 76088](https://datadryad.org/api/v2/versions/22062/files), with `pedigree.txt` size 76,735 bytes and Dryad-provided MD5 `129d73c272b53774688721679762971a`. The dataset page rounds the size to 76.74 KB. A metadata checksum is not a downloaded-file hash.

## Download check and import decision

| Official route | Exact URL | Access time (UTC) | Result |
|---|---|---|---|
| Dryad file stream | `https://datadryad.org/downloads/file_stream/76088` | 2026-10-08 02:07:18 | HTTP 403; bytes not returned |
| Dryad documented API download | `https://datadryad.org/api/v2/datasets/doi%3A10.5061%2Fdryad.23d8v/download` | 2026-10-08 02:07:26 | HTTP 401; anonymous request denied |

The official Dryad API metadata endpoints exposed dataset and file metadata, but the two published download routes above did not return the data. After these responses, no token, session, cookie, alternate mirror, or other route was used.

**Import status: not imported because download was denied.** The CC0 terms permit reuse, but no data bytes were obtained for a reliable, complete import. The downloaded-file SHA-256 is therefore **unavailable**; no downloaded `pedigree.txt` exists in this worktree. The provider-listed MD5 above is retained only as metadata. The machine-readable details are in [`atlases/polar-bear/import_report.json`](../atlases/polar-bear/import_report.json).

The import report records zero imported animals and zero imported relationships. It preserves an empty list of research IDs rather than inventing IDs or a sample. If the file becomes available through a published route, import the complete source, preserve each research ID exactly in an external-ID namespace, and leave `NA`/unknown sire or dam fields absent. Do not make placeholder parents or merge a wild ID with a zoo bear without authoritative identity evidence.

## University of Manitoba thesis lead: discovery-only

The institutional repository hosts Leah Jane Kathan’s 2024 thesis, [*Quantitative Genetics of Polar Bear (Ursus maritimus) Behaviours*](https://mspace.lib.umanitoba.ca/bitstreams/f120db8e-a2b5-4683-94c4-d549dff31070/download). The PDF states “Copyright © 2024 by Leah Kathan.” The repository metadata identifies a 670,764-byte thesis PDF and MD5 `dcc262bd701c4c1555ee927c47994f0f`.

The thesis discusses an updated 4,634-individual Western Hudson Bay pedigree covering births from 1966 to 2019. The accessible thesis gives this in prose and methods; it does not include the row-level pedigree or a separately licensed data file. The repository metadata did not identify an open license for an included data file. The thesis is recorded as **discovery/context only** and no thesis content or animal row is imported.

## Population boundary and limitations

- The canonical polar-bear atlas currently contains a source-bounded **zoo/captive-history** corpus. The wild Western Hudson Bay research pedigree remains separate and contributes no animal, edge, source-ID mapping, or placeholder parent record.
- Dryad reports 4,449 pedigree individuals, but this project did not verify the rows or reproduce that count from file bytes.
- The source’s record span and geography describe research sampling; they do not assign precise locations to individual bears in this atlas.
- The data file’s unknown-parent convention is documented at the dataset level. No specific unknown parent rows are represented because the file was unavailable.
- Zoo records and wild research individuals remain disjoint. A future merge needs direct authoritative identity evidence.
- No photos or data-file bytes were added.

## Alternate Hudson Bay-region Dryad dataset: discovery-only

Viengkone, Michelle; Derocher, Andrew E.; Richardson, Evan S.; Malenfant, René M.; Miller, Joshua M.; Obbard, Martyn E.; Dyck, Markus G.; Lunn, Nick J.; Sahanatien, Vicki; Davis, Corey S. (2017). *Data from: Assessing polar bear (Ursus maritimus) population structure in the Hudson Bay region using SNPs* [Dataset]. Dryad. [https://doi.org/10.5061/dryad.1719f](https://doi.org/10.5061/dryad.1719f).

The [official Dryad dataset page](https://datadryad.org/dataset/doi:10.5061/dryad.1719f) reports 414 genotyped bears sampled across the Hudson Bay region, not just Western Hudson Bay. Its file list includes `ECE-2015-10-00703.ped` (page-listed size 5.54 MB), a map file, and a README. The page's usage notes describe research individual IDs in column 2, parent IDs in columns 3–4, sex in column 5, and genotype data in later columns. These are dataset-level descriptions; the row values and actual downloaded-file size were not verified. The landing-page metadata reviewed did not establish a row-level sampling or birth span, and the inaccessible files could not be inspected.

The dataset page identifies CC0, and Dryad's [reuse guide](https://v3.datadryad.org/help/guides/reuse) and [terms](https://datadryad.org/terms), updated 2025-05-20, state that Dryad datasets use the CC0 Public Domain Dedication. This records Dryad's stated terms, not an independent legal determination. The [cited article](https://doi.org/10.1002/ece3.2563) is also available as a [PubMed Central record](https://pmc.ncbi.nlm.nih.gov/articles/PMC5167041/); its abstract reports 2,603 SNPs, while the Dryad page's usage notes say 3,341. This discrepancy remains unresolved because the files were not accessible.

The official published file streams for the PED, MAP, and README returned HTTP 403 on **2026-10-08**. The browser tool did not expose exact access times. No credentials, sessions, cookies, mirrors, or other routes were used. The listed 5.54 MB is Dryad page metadata; downloaded byte size and SHA-256 are unavailable. The [article page](https://pmc.ncbi.nlm.nih.gov/articles/PMC5167041/) lists an additional 17.1 MB DOCX data file, but its contents and reuse license were not directly inspected. It is discovery-only and was not downloaded or imported.

**Import status: not imported because the published file links returned HTTP 403.** The reported 414 individuals are dataset metadata, not Atlas animals. No research IDs or relationships from this dataset appear in the canonical atlas. Its population scope spans multiple Hudson Bay-region clusters and must not be merged with the separate Western Hudson Bay-only candidate or with captive zoo bears. The machine-readable access, license, file, and import details are in [`atlases/polar-bear/import_report.json`](../atlases/polar-bear/import_report.json).
