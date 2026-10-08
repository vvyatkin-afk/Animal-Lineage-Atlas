# Phase 2 performance report

## Measurement scope

The static build derives a compact search and graph index plus profile detail chunks from each canonical `atlases/<species>/atlas.json`. The canonical file remains the only source of truth. Runtime pages fetch the index at startup and fetch one detail chunk only when a profile opens. Detail chunks contain at most 128 animals. The global overview summarizes every connected component, including isolated animals; search reaches every record and opens a bounded focused neighborhood. Search summaries include population, so wild and zoo/captive records remain filterable.

The checked-in JSON report contains exact per-file payload sizes, per-atlas search/layout samples, a synthetic scale run, and browser measurements. Reproduce it from the repository root with:

```sh
npm run build
npm run test:browser
npm run measure:release -- dist --out docs/PERFORMANCE_REPORT_PHASE2.json
```

## Current worktree result

These source-backed numbers were measured against the small Phase 1 canonical snapshots in this performance worktree: 83 red pandas, 22 polar bears, and 5 common hippos. They are an implementation baseline, not measurements of the later expanded research datasets. Re-run the same commands after the data branches are integrated to record the final source-backed counts and timings.

The initial runtime index plus media manifest measured 45,388 bytes for red panda, 15,927 bytes for polar bear, and 6,795 bytes for hippopotamus. The full profile details were split into one chunk per atlas at these snapshot sizes; the red-panda chunk was 226,343 bytes, polar-bear 37,505 bytes, and hippopotamus 12,028 bytes. The browser run made no detail request before a profile opened.

The engine benchmark uses 120 search samples and 30 focused-graph samples per canonical atlas. For red panda, search p50/p95 was 0.033/0.119 ms and focused layout p50/p95 was 0.038/0.522 ms. Polar bear was 0.023/0.035 ms and 0.064/0.811 ms. Hippopotamus was 0.004/0.019 ms and 0.013/0.380 ms. The layout samples include the index-backed focus walk and output graph construction; they do not include browser rendering.

A separate deterministic 5,000-animal fixture contains 4,750 parent edges arranged in 250 disconnected linear components of up to 20 animals. It is synthetic and is kept separate from source-backed counts. Search-index creation took 202.156 ms, graph-index creation took 54.369 ms, search p50/p95 was 2.686/8.465 ms, and focused graph creation p50/p95 was 0.025/0.039 ms for a seven-node neighborhood. The approximate derived-index heap delta was 6,251,360 bytes in Node.js.

Playwright Chromium 153 measured the red-panda app at 1,440×1,000 and 390×844 CSS pixels. On desktop the initial global overview rendered in 4.4 ms, search plus result DOM rendering took 0.9 ms, the focused SVG neighborhood rendered in 18.9 ms, and profile open took 121.5 ms including its local detail fetch. On the emulated mobile viewport, the focused SVG neighborhood rendered in 0.7 ms and profile open took 85.4 ms; document width remained 390 pixels. The representative focused graphs had 4 desktop and 3 mobile nodes in this sample.

## Method and limits

- Payload sizes are uncompressed file bytes. “Initial data” means `runtime.json` plus the optional local media manifest; detail-chunk bytes are reported separately.
- Search p50/p95 values come from warmed in-process queries. The scale fixture includes a one-record ID query, a 1,000-result substring query, and a 5,000-result taxon query.
- Browser search timing covers the synchronous search and result-list DOM update. Graph timing covers synchronous graph-model construction and SVG DOM attachment, excluding the following paint/composite frame. Profile-open timing includes the detail fetch and profile rendering.
- Browser memory is reported only when Chromium exposes `performance.memory`; this environment returned 10,000,000 bytes on both viewports, which appears quantized. Node heap deltas are approximate and can vary with garbage collection; they are not whole-device memory measurements.
- The synthetic pedigree is a uniform linear forest. It checks thousands of rows and disconnected components, but it does not model every high-degree or unusually dense family shape.
- Browser measurements use a local static server, block external image requests, and emulate a mobile viewport on the test host. They do not include real cellular latency, a physical phone GPU, or compressed transfer sizes.

The detailed machine-readable output is [PERFORMANCE_REPORT_PHASE2.json](PERFORMANCE_REPORT_PHASE2.json).
