# Media and rights policy

The public Atlas release contains no animal-photo files, copied thumbnails, photo caches, or embedded animal photographs. Local `.jpg`, `.jpeg`, `.png`, and `.webp` files and local-photo references fail the repository and release checks.

Every media record keeps its original source page URL. The runtime resolver returns an external image only when `embedding_status` is `allowed`, `direct_remote_url` exists, and `rights_status` is one of `cc0`, `public_domain`, `permission_granted`, or `license_allows_embedding`. All current animal-media records are link-only because their image rights and embedding terms have not been established.

When an image is unavailable, disallowed, or fails to load, the profile keeps its text, family links, source link, and neutral placeholder. The atlas does not proxy, scrape, or cache publisher images. Generic interface marks and vector placeholders are allowed when they are not animal-photo reproductions.

Local image substitution is supported through a per-path manifest, not through the public data files. Public builds ship an empty manifest; an owner-created private package can provide local assets and a populated manifest. See [the offline archive design](OFFLINE_ARCHIVE_FUTURE.md).
