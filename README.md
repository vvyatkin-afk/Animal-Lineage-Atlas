# Animal Lineage Atlas

A static, source-linked view of named animal families and life histories. The project preserves source dates and uncertainty, and gives every atlas a stated coverage boundary.

## Production paths

- Hub: [http://204.168.161.237/atlas/](http://204.168.161.237/atlas/)
- Red panda: [http://204.168.161.237/atlas.red-panda/](http://204.168.161.237/atlas.red-panda/)
- Polar bear: [http://204.168.161.237/atlas.polar-bear/](http://204.168.161.237/atlas.polar-bear/)
- Common hippopotamus: [http://204.168.161.237/atlas.hippopotamus/](http://204.168.161.237/atlas.hippopotamus/)

Each path is a separately built static application. The deployment switch and rollback cover these four Atlas paths.

## Current source-bounded datasets

| Atlas | Named animals | Relationships | Events | Sources | Coverage |
|---|---:|---:|---:|---:|---|
| Red panda | 1,554 | 2,394 | 3,792 | 1,521 | Pinned public community export plus the curated Futa-family layer |
| Polar bear | 64 | 58 | 84 | 28 | Named zoo/captive records from public institutional sources |
| Hippopotamus (common + pygmy) | 85 | 78 | 85 | 69 | Source-linked public zoo records across two separate taxa |

These totals describe the checked-in canonical JSON files. The project does not claim a complete studbook for any species. The polar-bear Western Hudson Bay pedigree is documented but not imported because Dryad's published file link returned HTTP 403; see the [access review](docs/POLAR_BEAR_WESTERN_HUDSON_BAY.md).

## Build and checks

Requirements: Node.js 20.19 or later and Python 3.12 or later.

```sh
python3 -m pip install -r requirements-ci.txt
npm ci
npm run lint
npm run typecheck
npm test
npm run test:python
npm run validate:data
npm run validate:schema
npm run check:no-photos
npm run build
python3 tools/check_no_animal_photos.py dist
npm run test:browser
npm run measure:release -- dist
```

The static build emits `dist/atlas`, `dist/atlas.red-panda`, `dist/atlas.polar-bear`, and `dist/atlas.hippopotamus`. Each child page has its own runtime data file and works without loading the hub. Build output is reproducible from canonical JSON and the locked npm dependencies.

## Evidence, scope, and media

- [Mission and scope](docs/MISSION_AND_SCOPE.md) describes what each corpus includes and omits.
- [Data model](docs/DATA_MODEL.md) and [evidence policy](docs/SOURCE_AND_EVIDENCE_POLICY.md) explain identifiers, relationships, date precision, and conflicts.
- [Media and rights policy](docs/MEDIA_AND_RIGHTS_POLICY.md) and [offline archive plan](docs/OFFLINE_ARCHIVE_FUTURE.md) describe link-only media and the resolver contract.
- Species research notes: [red panda migration](docs/RED_PANDA_MIGRATION.md) and [upstream sync](docs/RED_PANDA_UPSTREAM_SYNC.md), [polar bear](docs/POLAR_BEAR_SOURCES.md), and [hippopotamus](docs/HIPPOPOTAMUS_SOURCES.md).
- [Architecture](docs/ARCHITECTURE.md), [deployment and rollback](docs/DEPLOYMENT_AND_ROLLBACK.md), the [v1 release record](docs/RELEASE_V1.md), and the [Phase 2 expanded-data release record](docs/RELEASE_V2_EXPANDED_DATASETS.md) cover implementation and operations.
- [Machine-readable QA report](docs/QA_REPORT.json) and [performance report](docs/PERFORMANCE_REPORT_PHASE2.md) record validation, payload sizes, browser results, and search/layout timings.

The public repository and production bundles contain no animal-photo files, copied thumbnails, or embedded animal photos. Media is shown only when the recorded rights and embedding status allow it; otherwise the interface keeps a source link and placeholder.

Navigation, controls, help copy, source categories, and coverage scope/limitations are available in English, Japanese, and Russian. Proper names and cited source titles retain their curated spelling; changing the interface language does not alter source records.
