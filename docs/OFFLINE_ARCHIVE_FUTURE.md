# Future private offline archive

The shared resolver supports a future user-owned archive without placing animal photos in the public repository or release. No offline image package is created or published by v1.

A private package can combine a versioned app build, a canonical data snapshot, and a local media manifest. Each manifest item should identify:

- stable `media_id`;
- original source URL and source page;
- image credit and rights basis;
- relative path inside the private archive;
- checksum of the archived bytes;
- archive status and capture/review date.

The injected resolver accepts safe relative paths, rejects absolute paths and parent-directory traversal, and returns the local file together with its original source, credit, rights, checksum, and archive status. The public runtime keeps its existing source-page link and placeholder behavior when no private resolver is supplied.

An offline archive must be created only by its owner under the source's terms. Keep it out of public releases and Git unless the owner has separate permission to redistribute the image bytes. Recheck rights before sharing or syncing an archive.
