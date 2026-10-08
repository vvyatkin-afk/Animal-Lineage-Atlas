# Phase 2 performance report

## Measurement scope

The release was built from the expanded canonical atlases at source revision `18b7efcecbc3319b4607ea87bf106113b8d10ee2`. The measurement report identifies that revision and records a clean source worktree (excluding the report itself). Runtime indexes support search, population filters, and global component summaries; profile details load from bounded chunks only when a profile opens. No animal-photo bytes are part of the release.

Measurement command:

```sh
npm run measure:release -- dist --out docs/PERFORMANCE_REPORT_PHASE2.json
```

## Release payloads

Raw file bytes, without gzip or Brotli. Initial payload includes the runtime index and media manifest; profile details are fetched lazily.

| Release | Initial payload | Detail chunks / bytes | Complete data payload | Total release |
|---|---:|---:|---:|---:|
| Hub | 13,494 B | 0 / 0 B | 13,494 B | 104,464 B |
| Red panda | 1,299,379 B | 13 / 9,335,920 B | 10,635,299 B | 10,772,274 B |
| Polar bear | 40,230 B | 1 / 89,932 B | 130,162 B | 267,139 B |
| Hippopotamus | 50,435 B | 1 / 161,878 B | 212,313 B | 349,294 B |

All four releases total 11,493,171 B. Red-panda detail chunks range from 126,427 B to 1,292,882 B; their median is 694,688 B. Initial search made no detail request.

## Source-backed search and graph timings

Node benchmark used 120 warmed search samples and 30 focused graph samples per atlas after index construction. Corpus counts match the canonical data.

| Atlas | Animals / relationships | Components (largest) | Derived index heap | Search median / p95 | Layout median / p95 |
|---|---:|---:|---:|---:|---:|
| Red panda | 1,554 / 2,394 | 171 (823) | 2,243,064 B | 2.798 / 6.796 ms | 0.034 / 1.881 ms |
| Polar bear | 64 / 58 | 19 (9) | 116,576 B | 0.016 / 0.075 ms | 0.018 / 0.295 ms |
| Hippopotamus | 85 / 78 | 24 (19) | 143,176 B | 0.020 / 0.081 ms | 0.015 / 0.698 ms |

Representative focused graphs contained 5 nodes / 5 edges for red panda, 7 / 6 for polar bear, and 2 / 1 for hippopotamus. None were truncated.

## Synthetic scale fixture

The deterministic synthetic pedigree has 5,000 animals, 4,750 relationships, and 250 disconnected components. Its derived-index heap was 5,893,904 B. Search-index and graph-index construction took 196.312 ms and 49.575 ms. Across 150 searches, median / p95 was 6.276 / 13.313 ms. Across 60 focused-graph samples, median / p95 was 0.037 / 0.048 ms for a seven-node, six-edge neighborhood; it was not truncated.

## Browser performance

Playwright Chromium 153.0.8010.12 ran at 1440×1000 desktop and 390×844 mobile viewport sizes. The measured profile atlas was the 1,554-record red-panda release. The full local browser suite passed 10/10 tests.

| Measure | Desktop | Mobile |
|---|---:|---:|
| Search render | 14.2 ms | Not reported |
| Global overview render | 16.7 ms | Not reported |
| Focused graph render | 6.5 ms, 16 nodes | 1.8 ms, 8 nodes |
| Profile open, including detail fetch | 135.4 ms | 118.4 ms |
| Chromium reported heap | 11,200,000 B | 11,200,000 B |

Initial search made no detail request; the opened profile fetched a 1,022,539 B detail chunk. At the mobile viewport, the document width was 390 px.

## Method and limits

- Payload values are uncompressed file sizes and do not include network overhead.
- Search timings use warmed in-process queries. Index heap is an approximate Node.js heap delta after garbage collection.
- Focused-graph timings cover synchronous graph construction and SVG attachment, excluding the following paint/composite frame.
- Browser memory is reported only when Chromium exposes `performance.memory`; it is not a whole-device memory estimate.
- Browser tests use a local static server, block external images, and emulate mobile dimensions on the test host. They do not model a physical phone, mobile GPU, cellular latency, or network throttling.
- The synthetic fixture is a linear forest; it does not model every high-degree or unusually dense family graph.

The detailed machine-readable measurements are in [PERFORMANCE_REPORT_PHASE2.json](PERFORMANCE_REPORT_PHASE2.json).
