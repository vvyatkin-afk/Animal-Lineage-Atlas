# Media and rights policy

## What the public release stores

The repository and static Atlas bundles contain no local animal-photo files, copied thumbnails, embedded animal photographs, or disk image cache. Approved images are fetched on demand by the Atlas media service and relayed under a same-origin URL. A short-lived in-memory response cache may be used; image bytes are not written to disk.

Relaying a file does not create permission to use it. Each relayable image must have a versioned allowlist record that identifies the animal and confidence, original source page, direct HTTPS variant URLs, creator and credit, license/version/terms, checked date, MIME type, and bounded byte/dimension limits. The client sends only an opaque media ID and one fixed variant name; it cannot choose an upstream host or URL. Unknown, denied, link-only, or unlisted media never reaches the image service.

## Phase 5 approved images

The approved set currently contains ten individually described photos of Futa at Chiba Zoological Park and two photos of Simon at the Jerusalem Biblical Zoo. Futa's set includes six CC BY 4.0 files by Misei sen, including [File:Futa 20261004 3.jpg](https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg), and four CC BY-SA 4.0 files by KQuhen, including [File:Futa red panda Chiba Zoological Park 2010 03.jpg](https://commons.wikimedia.org/wiki/File:Futa_red_panda_Chiba_Zoological_Park_2010_03.jpg). Simon's files are [CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Red_Panda_Simon_01.jpg) by SuperJew and [CC0 1.0](https://commons.wikimedia.org/wiki/File:SIMON_RED_PANDA.JPG) by Masha Gutman. Each profile displays the relevant creator, license, source page, and changes statement.

The browser loads each approved full-size original directly from `upload.wikimedia.org`; the server never fetches or caches those originals. Browser cards use the individually approved Commons thumbnail URL. The optional same-origin relay accepts fixed Wikimedia-standard 250px thumbnail and 500px profile variants, with byte and pixel limits, and keeps any cached bytes in bounded process memory only. Other red-panda, polar-bear, and hippopotamus records remain link-only unless identity and reuse terms are independently verified.

The full server-side allowlist is [approved-media-v1.json](../packages/media/approved-media-v1.json). Public child manifests contain direct URLs only for these individually approved records, alongside identity, attribution, and license metadata. The browser cannot choose an arbitrary source URL: relay requests contain an opaque ID and one fixed variant name.

## Safe relay rules

The service accepts only IDs and variants in the allowlist, connects over HTTPS to approved public hosts and port 443, validates DNS/IP answers and redirects, enforces timeout and streaming byte limits, checks the declared MIME type and image signature/dimensions, and never forwards browser cookies or authorization headers. It has bounded request rates and short-lived memory caching only. Unavailable or invalid responses fall back to profile text and original source links. No scraping, authentication bypass, anti-hotlink circumvention, open URL proxying, or source access-control bypass is permitted.

Attribution remains visible beside every relayed profile image. The original source page and license are linked directly. Approved variants are fixed, size-limited renditions; tree-card thumbnails are lazy-loaded only for visible cards. No image bytes enter Git, static release artifacts, logs, or persistent storage.

## Unapproved and local media

Every media record keeps its original source page. Source links remain available for denied, unknown, and link-only references. A neutral placeholder appears when no approved image is available or a relay request fails. A direct image URL alone is never evidence of reuse permission and is never accepted from a browser request.

Local image substitution remains available only through an owner-created private archive and its per-path manifest. Public builds keep the local-media manifest empty. See the [offline archive design](OFFLINE_ARCHIVE_FUTURE.md).
