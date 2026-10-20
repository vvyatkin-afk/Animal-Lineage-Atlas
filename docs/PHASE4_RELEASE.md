# Phase 4 Release Record

- **Released:** 2026-10-20 13:10 UTC
- **Production revision:** `6dfdb34b26f8f8ee574e40cff6e9e661779a19a7`
- **Merged hotfix:** [PR #9](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/pull/9)
- **CI:** [run 39427735573](https://github.com/vvyatkin-afk/Animal-Lineage-Atlas/actions/runs/39427735573)

## Deployment and health checks

The immutable static release is at `/var/www/html/_animal-lineage-releases/6dfdb34b26f8f8ee574e40cff6e9e661779a19a7`. Its manifest is `release-manifest.json`. The private relay release is at `/var/lib/animal-lineage-atlas/6dfdb34b26f8f8ee574e40cff6e9e661779a19a7/media-service`; `media-current` points to that directory. `animal-atlas-media.service` is enabled and active. The relay binds to loopback on port 4175.

The Nginx install created a mode-0700 rollback snapshot at `/var/backups/animal-lineage-atlas/nginx/phase4-nginx-7cck0h97`. Its manifest records the original and installed configuration hashes. `nginx -t` passed after installation.

At release verification, these URLs returned HTTP 200:

| URL | Result |
|---|---|
| [Atlas hub](http://204.168.161.237/atlas/) | 200 |
| [Red-panda Atlas](http://204.168.161.237/atlas.red-panda/) | 200 |
| [Polar-bear Atlas](http://204.168.161.237/atlas.polar-bear/) | 200 |
| [Hippopotamus Atlas](http://204.168.161.237/atlas.hippopotamus/) | 200 |
| [Legacy red-panda application](http://204.168.161.237/red-panda/) | 200 |

All four Atlas symlinks and `media-current` resolve into the `6dfdb34…` release. The release manifest records the previous static targets as `ee48fbb10f3f35c1b35234fc3ee4aa8f84e7857f`; it records the previous relay target and enabled state for rollback.

## Authorized animal media

One embedded animal image is currently approved: Futa, Chiba City Zoo's red panda, in Misei sen's [Wikimedia Commons photograph](https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The production profile displays the photographer, license, source link, and “No changes made” notice. No photo source assets were added to the repository; relay response bodies were inspected in memory. Existing screenshot artifacts are individually governed by the Phase 4 screenshot manifests.

Both same-origin production relay requests succeeded with JPEG content type, `nosniff`, expected ETag, byte count, and dimensions:

| Variant | Production path | Bytes | Dimensions | SHA-256 / ETag value |
|---|---|---:|---:|---|
| Thumbnail | `/atlas.red-panda/media/a426db98f35e4bc984275cc031467ac9/thumb` | 39,751 | 330×220 | `f4d89e33ba7cbfcdf97a37e93e0a713584fa3167307951c9ae25b0553aea9e1e` |
| Profile | `/atlas.red-panda/media/a426db98f35e4bc984275cc031467ac9/profile` | 247,773 | 960×640 | `18480647b48d13c46224e0ad97c59bda30090d0356f504c7bc1a40aa787c3c2e` |

The production Chromium check loaded the profile image at its same-origin URL and reported `naturalWidth=960`, `naturalHeight=640`, complete image load, visible attribution, and zero page errors. The image remained within the 390×844 mobile viewport (270 CSS pixels wide). The Nginx request regression test covers all four Atlas prefixes and both variants, confirms ID/variant capture forwarding, and rejects a 31-character ID with HTTP 404. Both production image requests returned HTTP 200; no relay fetch errors occurred during release verification. Other animal records remain link-only until their identity, license, and embedding permission are verified.

## Layout evidence

Baseline and after screenshots cover the same 14 views at 1440×900 and 390×844. Their manifests include capture details and hashes: [baseline screenshots](../reports/phase4/baseline/screenshot-manifest.json) and [after screenshots](../reports/phase4/after/screenshot-manifest.json). The seven-view measurement comparison is in [layout-comparison.json](../reports/phase4/comparisons/layout-comparison.json); full reports are in [baseline](../reports/phase4/baseline/layout-metrics.json) and [after](../reports/phase4/after/layout-metrics.json).

The table reports exact rendered-route measurements sampled from the renderer's cubic paths at 24 segments. A crossing is a transverse intersection between edge pairs with no shared animal endpoint. Length is the full world-coordinate centerline length. These are bounded heuristic results, not proof of a global optimum.

| View | Crossings before → after | Route length before → after |
|---|---:|---:|
| Red panda, all 1,554 animals | 48,041 → 42,931 (−10.6%) | 5,472,576.87 → 4,662,636.83 (−14.8%) |
| Red panda, largest 823-animal component | 35,210 → 31,352 (−11.0%) | 3,428,194.25 → 3,163,209.23 (−7.7%) |
| Futa focused, depth 3 | 277 → 6 (−97.8%) | 126,772.03 → 102,548.13 (−19.1%) |
| Futa focused, all known | 286 → 18 (−93.7%) | 142,595.56 → 121,431.54 (−14.8%) |
| Rakesh focused, depth 3 | 10 → 4 (−60.0%) | 4,049.75 → 2,908.52 (−28.2%) |
| Polar bear, all | 33 → 28 (−15.2%) | 16,217.28 → 15,820.18 (−2.4%) |
| Hippopotamus, all | 39 → 35 (−10.3%) | 27,100.89 → 26,477.58 (−2.3%) |

Generation rows, IDs, and relationship records remain fixed. Focused layouts apply the mother-left/father-right constraint; contradictory parent constraints are reported deterministically. Global layouts do not enforce parent sex sides. Large global graphs use bounded crossing and route-length estimates for candidate ranking to stay within the interactive performance budget.

## Verification

- GitHub CI on `0d0bbe5` passed: lint, typecheck, 77 Node tests, 102 Python tests, all data and schema validations, build, source and build photo scans, and 19 Chromium tests.
- Independent follow-up review of the Nginx quantifier correction found no Critical, Important, or Minor issues.
- Local production-route checks passed for all four Atlas pages and `/red-panda/`; `nginx -t` passed; relay service was active and enabled.
- Both approved images were fetched through the public same-origin relay and checked in memory against type, byte count, size limits, dimensions, and SHA-256 above.
- Live Chromium verified the Futa image, CC BY attribution, responsive width, and zero page errors.
- The pre-release [legacy file manifest](../reports/phase4/legacy-red-panda-before.json) listed 505 files with digest `28ac4d968723ddcc1f79367793f405c1b5702aafe1ca057e7a0e825abccb1927`. A post-release per-file path, size, and SHA-256 comparison matched all 505 files and the same digest.
- `npm run build`, both no-photo scans, and the complete local test and validation suite passed. No image bodies were written to disk during production relay verification.

## Rollback

To remove only the public media route, restore the hash-verified Nginx snapshot:

```sh
sudo -n python3 tools/manage_nginx_relay.py rollback \
  --backup /var/backups/animal-lineage-atlas/nginx/phase4-nginx-7cck0h97
```

This leaves the current Atlas pages active; image failures fall back to source links. To return the Atlas paths and relay state all the way to the Phase 3 release, first remove the media route, then restore the two recorded release transitions in order:

```sh
sudo -n python3 tools/rollback_release.py \
  --root /var/www/html \
  --media-root /var/lib/animal-lineage-atlas \
  --manifest /var/www/html/_animal-lineage-releases/6dfdb34b26f8f8ee574e40cff6e9e661779a19a7/release-manifest.json \
  --skip-media-service-management

sudo -n python3 tools/rollback_release.py \
  --root /var/www/html \
  --media-root /var/lib/animal-lineage-atlas \
  --manifest /var/www/html/_animal-lineage-releases/ee48fbb10f3f35c1b35234fc3ee4aa8f84e7857f/release-manifest.json
```

The first rollback restores the preceding Phase 4 static targets without restarting the prior relay code. The second restores the Phase 3 static targets, removes `media-current`, stops and disables the relay, according to the earlier release manifest. Each command refuses stale or changed targets instead of overwriting them. After rollback, check the five public URLs and service state, then run `sudo -n /usr/sbin/nginx -t` to validate the restored Nginx configuration with the permissions required by this host.
