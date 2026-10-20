# Media and rights policy

## What the public release stores

The repository and static Atlas bundles contain no local animal-photo files, copied thumbnails, embedded animal photographs, or disk image cache. Approved images are fetched on demand by the Atlas media service and relayed under a same-origin URL. A short-lived in-memory response cache may be used; image bytes are not written to disk.

Relaying a file does not create permission to use it. Each relayable image must have a versioned allowlist record that identifies the animal and confidence, original source page, direct HTTPS variant URLs, creator and credit, license/version/terms, checked date, MIME type, and bounded byte/dimension limits. The client sends only an opaque media ID and one fixed variant name; it cannot choose an upstream host or URL. Unknown, denied, link-only, or unlisted media never reaches the image service.

## Currently approved image

The only approved animal image is Wikimedia Commons [File:Futa 20261004 3.jpg](https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg). The file page captions the subject as Futa at Chiba City Zoo, identifies Misei sen as the author, and publishes the work under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The license requires appropriate credit, a license link, and notice of changes. The profile shows the creator, license link, source link, and the statement that no changes were made; the site relays Wikimedia Commons' published 330px and 960px thumbnail variants as-is.

The full server-side allowlist is [approved-media-v1.json](../packages/media/approved-media-v1.json). Static child builds expose only the opaque ID and attribution metadata in `media-manifest.json`; they do not expose direct fetch URLs. Other red-panda, polar-bear, and hippopotamus records remain link-only until their image identity and reuse terms are independently verified.

## Safe relay rules

The service accepts only IDs and variants in the allowlist, connects over HTTPS to approved public hosts and port 443, validates DNS/IP answers and redirects, enforces timeout and streaming byte limits, checks the declared MIME type and image signature/dimensions, and never forwards browser cookies or authorization headers. It has bounded request rates and short-lived memory caching only. Unavailable or invalid responses fall back to profile text and original source links. No scraping, authentication bypass, anti-hotlink circumvention, open URL proxying, or source access-control bypass is permitted.

Attribution remains visible beside every relayed profile image. The original source page and license are linked directly. Approved variants are fixed, size-limited renditions; tree-card thumbnails are lazy-loaded only for visible cards. No image bytes enter Git, static release artifacts, logs, or persistent storage.

## Unapproved and local media

Every media record keeps its original source page. Source links remain available for denied, unknown, and link-only references. A neutral placeholder appears when no approved image is available or a relay request fails. A direct image URL alone is never evidence of reuse permission and is never accepted from a browser request.

Local image substitution remains available only through an owner-created private archive and its per-path manifest. Public builds keep the local-media manifest empty. See the [offline archive design](OFFLINE_ARCHIVE_FUTURE.md).
