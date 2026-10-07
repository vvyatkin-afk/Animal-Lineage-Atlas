# Future private offline archive

The child atlas runtime can consume a per-path `local-media-manifest.json` and render a matching local asset with its source, credit, rights, checksum, and archive status. Public builds contain an empty manifest and no animal-photo bytes. No offline image package is created or published by v1.

A private package can combine a versioned app build, a canonical data snapshot, and a local media manifest. Each manifest item should identify:

- stable `media_id`;
- original source URL and source page;
- image credit and rights basis;
- relative path inside the private archive;
- checksum of the archived bytes;
- archive status and capture/review date.

The runtime resolver accepts safe relative paths, rejects absolute paths and parent-directory traversal, and returns the local file together with its original source, credit, rights, checksum, and archive status. For media IDs missing from a private manifest, the public rights-aware resolver still provides its source-page link and placeholder behavior.

An offline archive must be created only by its owner under the source's terms. Keep it out of public releases and Git unless the owner has separate permission to redistribute the image bytes. Recheck rights before sharing or syncing an archive.
