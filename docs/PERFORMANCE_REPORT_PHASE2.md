# Phase 2 performance report

## Measurement scope

The local release was built from the expanded canonical atlases. Runtime indexes support search, population filters, and global component summaries; profile details load from bounded chunks only when a profile opens. No animal photo bytes are part of the release. The machine-readable report contains per-file payloads, warmed search/layout timings, a synthetic scale run, and Chromium measurements.

Measurement command:

```sh
npm run measure:release -- dist --out docs/PERFORMANCE_REPORT_PHASE2.json
```

The current measurements were recorded on 2026-10-08 from the final integrated worktree before its release commit. The JSON identifies its source revision and notes that the worktree was dirty at measurement time. The tracked application changes at that point are the source used for this build; deployment evidence is recorded separately in `QA_REPORT.json` and `RELEASE_V2_EXPANDED_DATASETS.md`.

## Release payloads

Raw file bytes, without gzip or Brotli. Initial payload includes the runtime index and media manifest; profile details are fetched lazily.

| Release | Initial payload | Detail chunks / bytes | Complete data payload | Total release |
|---|---:|---:|---:|---:|
| Hub | 13,494 B | 0 / 0 B | 13,494 B | 104,464 B |
| Red panda | 1,300,247 B | 13 / 9,337,474 B | 10,637,721 B | 10,774,696 B |
| Polar bear | 40,230 B | 1 / 89,932 B | 130,162 B | 267,139 B |
| Hippopotamus | 50,435 B | 1 / 161,878 B | 212,313 B | 349,294 B |

All four releases total 11,495,593 B. The red-panda detail chunks range from 131,472 B to 1,274,758 B; their median is 694,688 B. Search on first load made no detail request.

## Source-backed search and graph timings

Node benchmark used 120 warmed search samples and 30 focused graph samples per atlas after index construction.

| Atlas | Animals / relationships | Components (largest) | Derived index heap | Search median / p95 | Layout median / p95 |
|---|---:|---:|---:|---:|---:|
| Red panda | 1,555 / 2,396 | 171 (824) | 2,328,376 B | 2.053 / 3.917 ms | 0.041 / 0.952 ms |
| Polar bear | 64 / 58 | 19 (9) | 33,152 B | 0.015 / 0.026 ms | 0.018 / 0.288 ms |
| Hippopotamus | 85 / 78 | 24 (19) | 130,744 B | 0.029 / 0.072 ms | 0.029 / 1.214 ms |

Representative focused graphs contained 5 nodes / 5 edges for red panda, 7 / 6 for polar bear, and 2 / 1 for hippopotamus. None were truncated.

## Synthetic scale fixture

The deterministic synthetic pedigree has 5,000 animals, 4,750 relationships, and 250 disconnected components. Its derived-index heap was 6,039,248 B. Search-index and graph-index construction took 173.111 ms and 44.461 ms. Across 150 searches, median / p95 was 8.042 / 13.849 ms. Across 60 focused-graph samples, median / p95 was 0.060 / 0.073 ms for a seven-node, six-edge neighborhood; it was not truncated.

## Browser performance

Playwright Chromium 153.0.8010.12 ran at 1440×1000 desktop and 390×844 mobile viewport sizes. The measured profile atlas was the 1,555-record red-panda release.

| Measure | Desktop | Mobile |
|---|---:|---:|
| Search and result render | 6.4 ms | Not reported |
| Global overview render | 26.6 ms | Not reported |
| Focused graph render | 9.4 ms, 51 nodes | 3.2 ms, 24 nodes |
| Profile open, including detail fetch | 110.4 ms | 144.9 ms |
| Chromium reported heap | 11,900,000 B | 11,900,000 B |

The initial search made no detail request; the opened profile fetched a 1,036,785 B detail chunk. At the mobile viewport, the document width was 390 px. The full local browser suite passed 10 / 10 tests.

## Method and limits

- Payload values are uncompressed file sizes and do not include network overhead.
- Search timings use warmed in-process queries. Index heap is an approximate Node.js heap delta after garbage collection.
- Focused-graph timings cover synchronous graph construction and SVG attachment, excluding the following paint/composite frame.
- Browser memory is reported only when Chromium exposes `performance.memory`; it is not a whole-device memory estimate.
- Browser tests use a local static server, block external images, and emulate mobile dimensions on the test host. They do not model a physical phone, mobile GPU, cellular latency, or network throttling.
- The synthetic fixture is a linear forest; it does not model every high-degree or unusually dense family graph.

The detailed machine-readable measurements are in [PERFORMANCE_REPORT_PHASE2.json](PERFORMANCE_REPORT_PHASE2.json).
