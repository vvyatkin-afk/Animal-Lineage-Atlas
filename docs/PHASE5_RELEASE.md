# Phase 5 production release

Verified: 2026-10-20 UTC

Production revision: `a3d10e45f18471b60a4f3de17fd72f836cdbfb68`

Deployment time: 2026-10-20 18:02 UTC

## Source and CI

Phase 5's full genealogy, layout, and rights-cleared photo implementation merged through [PR #11](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/pull/11). The production relay smoke test found that Wikimedia's standard 330px and 960px previews could exceed the relay's height limits. The release was safely rolled back to Phase 4 while the width correction was made and reviewed in [PR #12](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/pull/12).

PR #12's final head `86c4144a347905baf6ba65899d07f400b1805b27` passed [Atlas CI run 39470855541](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/39470855541). The merge revision is `a3d10e45f18471b60a4f3de17fd72f836cdbfb68`; its tree `b274b52c08031e66949660baaebdae41fc55e015` exactly matches the CI-tested head tree.

The verified workflow completed 90/90 Node tests, 106/106 Python tests, 22/22 browser tests, lint, type checking, data/schema validation, build, and no-photo scans. The full local and CI evidence is also summarized in [PHASE5_PROGRESS.md](PHASE5_PROGRESS.md).

## What shipped

The global fit-all red-panda view is a two-dimensional family mosaic. Zooming into a family opens its real connected genealogy with every known animal and relationship retained. Focused layouts preserve generation rows and exact IDs/edges. For each child, the biological mother is positioned left of the biological father where both are known and the constraint is feasible. The crossing-first optimizer scores the rendered routes and applies pair adjacency only after crossing count and route length; it has no global sex-side restriction.

The red-panda data has 1,555 animals and 2,394 relationships. Compared with the saved Phase 4 production baseline, the full graph reduced rendered crossings from 42,931 to 42,570 and route length from 4,662,636.83 to 4,607,479.37 world units. The largest component reduced crossings by 480; Futa's all-known focused graph removed nine crossings while increasing route length by 6,854.29 units. Repeated Node graph-build samples were 1,764 ms and 1,381 ms; Chromium's desktop layout measurement was 1,083 ms. The complete comparison and methodology remain in [PHASE5_PROGRESS.md](PHASE5_PROGRESS.md) and `reports/phase5/after/layout-metrics.json`.

Only 12 individually identified, licensed images are embedded: ten of Futa at Chiba Zoological Park and two of Simon at Jerusalem Biblical Zoo. Other red-panda, polar-bear, and hippopotamus media references remain source links or placeholders. The [photo source audit](../reports/phase5/after/photo-source-audit.json) lists every file, identity decision, direct URL, credit, license, and source page. Examples include [Futa 2026-10-04 photo by Misei sen, CC BY 4.0](https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg), [Futa at Chiba Zoo by KQuhen, CC BY-SA 4.0](https://commons.wikimedia.org/wiki/File:Futa_red_panda_Chiba_Zoological_Park_2010_03.jpg), [Simon by SuperJew, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Red_Panda_Simon_01.jpg), and [Simon by Masha Gutman, CC0 1.0](https://commons.wikimedia.org/wiki/File:SIMON_RED_PANDA.JPG).

Cards load standard 330px Commons thumbnails directly in the browser; profile originals also load directly from `upload.wikimedia.org`. These widths follow [Wikimedia's common thumbnail size steps](https://www.mediawiki.org/wiki/Common_thumbnail_sizes). The Atlas server fetches only approved 250px thumbnail and 500px profile variants through the fixed-ID relay, validates byte and pixel caps, and caches them in bounded process memory for five minutes. It writes no thumbnail files. The deployed static and relay trees contain no animal-photo files; no full-size original is stored or served from the Atlas server.

## Production deployment and verification

The atomic deploy switched only `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, `/atlas.hippopotamus/`, and the active media-service release. The service is active and enabled. Nginx's existing relay snippet remained installed; `nginx -t` passed and no Nginx configuration was changed.

All five production routes returned HTTP 200 after deployment:

- [Atlas hub](http://204.168.161.237/atlas/)
- [Red-panda Atlas](http://204.168.161.237/atlas.red-panda/)
- [Polar-bear Atlas](http://204.168.161.237/atlas.polar-bear/)
- [Hippopotamus Atlas](http://204.168.161.237/atlas.hippopotamus/)
- [Legacy red-panda application](http://204.168.161.237/red-panda/)

All 24 production relay responses (12 approved images × thumb/profile) were HTTP 200 JPEGs within each record's byte and pixel caps. The 250px thumbnails measured 250×167–188 and 16,087–27,332 bytes; the 500px profiles measured 500×333–376 and 56,491–103,361 bytes. The smoke script read responses into memory only.

Production Chromium loaded Futa's 5,568px original directly from Wikimedia and showed the matching Misei sen credit, CC BY 4.0 license, and Commons file link. It also confirmed the known mother is left of the father in Futa's rendered genealogy. Both Simon originals decoded directly in the browser (1,600px CC BY-SA 3.0 and 1,024px CC0 1.0), with their licenses visible. The run had no page errors or same-origin failed responses.

Before and after deployment, all 505 files in `/red-panda/` matched the saved file-by-file baseline manifest with digest `28ac4d968723ddcc1f79367793f405c1b5702aafe1ca057e7a0e825abccb1927`. The legacy application is not a symlink and remains outside the Atlas release paths. No unrelated project or network configuration was changed.

## Release and rollback record

The immutable release is at `/var/www/html/_animal-lineage-releases/a3d10e45f18471b60a4f3de17fd72f836cdbfb68/`. Its rollback manifest is:

`/var/www/html/_animal-lineage-releases/a3d10e45f18471b60a4f3de17fd72f836cdbfb68/release-manifest.json`

The manifest records Phase 4 revision `6dfdb34b26f8f8ee574e40cff6e9e661779a19a7` as the prior target for all four Atlas paths and the relay service, with the service previously enabled. To restore those targets:

```sh
sudo -n python3 tools/rollback_release.py \
  --root /var/www/html \
  --media-root /var/lib/animal-lineage-atlas \
  --manifest /var/www/html/_animal-lineage-releases/a3d10e45f18471b60a4f3de17fd72f836cdbfb68/release-manifest.json
```

The same rollback helper was exercised during the first Phase 5 attempt: it restored all four Atlas paths and `media-current` to Phase 4, after which all five routes returned HTTP 200 and the 505-file legacy comparison passed. Immutable release directories and manifests were retained.
