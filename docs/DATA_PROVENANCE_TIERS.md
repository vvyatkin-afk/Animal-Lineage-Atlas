# Data provenance tiers

The tier on a source describes the kind of evidence it provides. It does not rate an animal or guarantee that every statement on a page is correct. Each name, parent link, event, and claim keeps its own source references.

| Tier | Evidence type | Typical examples | Use in the Atlas |
| --- | --- | --- | --- |
| A | Open primary dataset or an explicitly reusable official studbook | A published dataset whose metadata identifies its license; a public studbook with stated reuse terms | May support bulk imports. Preserve the source IDs, license/terms evidence, version, download URL, access date, and checksum. |
| B | Official individual record from a zoo, conservation body, or research institution | Zoo biography, official birth announcement, institutional archive record | Supports only the individual facts it states. Keep names and dates at the source's precision. |
| C | Peer-reviewed paper or public supplement | Published pedigree methods or a supplementary table | Cite the paper or supplement for the facts it directly reports. Do not treat a paper's summary as permission to copy a separately restricted dataset. |
| D | Public community-curated lineage dataset | The public `wwoast/redpanda-lineage` export | Attribute the project and imported snapshot. Record the repository and export commits, exact export URL, retrieval time, hash, and the rights status observed at import. The public repository/export status is not a claim of legal certainty. |
| Discovery-only | Secondary material used to find a primary source | News story, search result, fan page, or inaccessible/restricted record | Keep it in research notes with its URL and access date. Do not use it as final evidence where a primary source is available, and do not create factual records from search snippets. |

## Recording a source

Every canonical source record should retain its exact title, publisher, URL, publication date when available, access date, source type, tier, and a concise statement of what it supports and how the data is used. Bulk imports additionally record the source snapshot/version and checksum in their import reports. For official pages, cite only the directly supported facts; a page about an animal does not automatically establish every event or parent relationship in its profile.

If sources disagree, retain the alternatives with their citations and mark the unresolved conflict. A source can be useful for discovery while still being unsuitable as final evidence. Do not describe a dataset as reusable merely because it is visible or downloadable; check its stated terms. Conversely, an open license does not prove a blocked download is accessible through the available public route.

This classification documents the project’s evidence policy. It is not legal advice and does not make a legal determination about a source.
