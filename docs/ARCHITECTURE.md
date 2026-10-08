# Architecture

## Runtime shape

Animal Lineage Atlas is a static application with no application server, database, image proxy, analytics dependency, or service worker. The hub and each species atlas are self-contained paths:

- `/atlas/` serves the hub HTML, stylesheet, JavaScript bundle, and generated `catalog.json`.
- Each `/atlas.<species>/` path serves its own HTML, stylesheet, JavaScript bundle, and compact `runtime.json`.

The hub does not serve as a runtime dependency for child atlases. A child page reads its atlas identifier and absolute base path from its HTML body, fetches a compact adjacent runtime index, and loads shared search, genealogy, media-resolution, date, profile, and localization modules bundled into its JavaScript. Full animal details are split into chunks of at most 128 records and fetched when a profile opens.

## Source and build flow

`atlases/<species>/atlas.json` is canonical. Python validators check record references, dates, uncertainty, and relationship cycles. The red-panda migration report and legacy ID map remain beside its canonical file; polar-bear and hippopotamus source notes record their bounded research corpora.

`tools/build_atlases.py` creates exactly four directories. It copies the app HTML and CSS, bundles TypeScript with the pinned esbuild dependency and `esbuild.config.mjs`, and derives a compact runtime index plus lazy profile chunks from each canonical file. `tools/build_catalog.mjs` derives hub cards and counts from all three canonical files. The output is scanned for local photo files, embedded raster-image data, and local photo references.

The browser uses URL query parameter `animal=<canonical-id>` for direct profile links. Search, population filters, language, graph pan, and graph zoom remain in the browser. The initial overview shows connected components, while focused SVG genealogy is bounded to 180 desktop nodes and 72 mobile nodes. Profiles render into a native HTML dialog; the graph does not use remote services.

## Deployment shape

The Nginx document root is `/var/www/html`. Releases are staged under `_animal-lineage-releases/<git-sha>/`, and the four Atlas public paths point into the selected release. See [deployment and rollback](DEPLOYMENT_AND_ROLLBACK.md).

## Validation layers

GitHub Actions installs from `package-lock.json`, runs ESLint and strict TypeScript checks, runs Node and Python tests, validates canonical data, rejects animal-photo files/references, builds all paths, scans the built release, and runs Playwright Chromium smoke tests. The workflow does not upload or retain build artifacts.
