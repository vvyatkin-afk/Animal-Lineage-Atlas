import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';

const reportDir = '/tmp/animal-lineage-atlas-qa';
mkdirSync(reportDir, { recursive: true });

test('measures desktop and mobile atlas search, focused rendering, payloads, and memory', async ({ page }) => {
  const species = ['red-panda', 'polar-bear', 'hippopotamus'];
  const atlases = await Promise.all(species.map(async (id) => {
    const url = new URL(`../../dist/atlas.${id}/runtime.json`, import.meta.url);
    const runtime = JSON.parse(await readFile(url, 'utf8')) as {
      animals: Array<{ id: string }>;
    };
    return { id, runtime };
  }));
  const atlas = atlases.sort((left, right) => right.runtime.animals.length - left.runtime.animals.length)[0];
  const animalId = atlas.runtime.animals[Math.floor(atlas.runtime.animals.length / 2)]?.id;
  expect(animalId).toBeTruthy();
  const responseBytes = new Map<string, number>();
  const pendingBodyReads: Promise<void>[] = [];
  page.on('response', (response) => {
    const pathname = new URL(response.url()).pathname;
    if (!pathname.endsWith('.json') || response.status() >= 400) return;
    pendingBodyReads.push(response.body().then((body) => {
      responseBytes.set(pathname, body.byteLength);
    }).catch(() => {}));
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() === 'image' && new URL(request.url()).origin !== 'http://127.0.0.1:4173') {
      await route.abort();
      return;
    }
    await route.continue();
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/atlas.${atlas.id}/`);
  await expect(page.locator('[data-global-overview="true"]')).toBeVisible();
  await Promise.all(pendingBodyReads);
  const globalOverviewRenderMs = await page.locator('#genealogy-container').evaluate((element) => Number(element.getAttribute('data-graph-render-ms')));
  const initialIndexPayloadBytes = await page.evaluate((atlasId) => {
    const base = `/atlas.${atlasId}/`;
    return performance.getEntriesByType('resource')
      .filter((entry) => entry.name.includes(base) && (entry.name.endsWith('runtime.json') || entry.name.endsWith('local-media-manifest.json')))
      .reduce((total, entry) => total + ((entry as PerformanceResourceTiming).encodedBodySize || 0), 0);
  }, atlas.id);
  const runtimeIndexBytes = responseBytes.get(`/atlas.${atlas.id}/runtime.json`) ?? 0;
  const initialSearchHadNoDetails = ![...responseBytes.keys()].some((pathname) => pathname.includes('/details/'));

  await page.getByLabel('Search animals').fill(animalId!);
  const searchRenderMs = await page.locator('#search-results').evaluate((element) => Number(element.getAttribute('data-search-render-ms')));
  const detailResponse = page.waitForResponse((response) => new URL(response.url()).pathname.includes('/details/') && response.ok());
  await page.getByRole('button', { name: /Open profile:/ }).first().click();
  await detailResponse;
  await expect(page.locator('#profile-title')).toBeVisible();
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  await Promise.all(pendingBodyReads);
  const detailChunkBytes = [...responseBytes.entries()]
    .filter(([pathname]) => pathname.includes('/details/'))
    .reduce((total, [, bytes]) => total + bytes, 0);
  const desktopFocusedGraph = await page.locator('#genealogy-container').evaluate((element) => ({
    renderMs: Number(element.getAttribute('data-graph-render-ms')),
    nodes: element.querySelectorAll('[data-animal-id]').length,
  }));
  const desktopProfileOpenMs = await page.locator('#profile-dialog').evaluate((element) => Number(element.getAttribute('data-profile-open-ms')));
  const desktopMemoryBytes = await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? null);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/atlas.${atlas.id}/?animal=${encodeURIComponent(animalId!)}`);
  await expect(page.locator('#profile-title')).toBeVisible();
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  const mobileFocusedGraph = await page.locator('#genealogy-container').evaluate((element) => ({
    renderMs: Number(element.getAttribute('data-graph-render-ms')),
    nodes: element.querySelectorAll('[data-animal-id]').length,
  }));
  const mobileProfileOpenMs = await page.locator('#profile-dialog').evaluate((element) => Number(element.getAttribute('data-profile-open-ms')));
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    memoryBytes: (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize ?? null,
  }));
  await Promise.all(pendingBodyReads);

  const report = {
    browser: page.context().browser()?.version() ?? 'unknown Chromium version',
    method: 'Playwright Chromium against the local static build; desktop 1440x1000 CSS px and mobile 390x844 CSS px. Timings use in-app synchronous search/DOM/render durations and direct profile open duration including the detail fetch. Browser heap is Chromium performance.memory when available.',
    dataset: atlas.id,
    record_count: atlas.runtime.animals.length,
    initial_index_payload_bytes: initialIndexPayloadBytes || runtimeIndexBytes,
    runtime_index_bytes: runtimeIndexBytes,
    initial_search_had_no_detail_request: initialSearchHadNoDetails,
    opened_profile_detail_payload_bytes: detailChunkBytes,
    desktop: {
      viewport_css_px: [1440, 1000],
      search_render_ms: searchRenderMs,
      global_overview_render_ms: globalOverviewRenderMs,
      focused_graph_render_ms: desktopFocusedGraph.renderMs,
      focused_graph_nodes: desktopFocusedGraph.nodes,
      profile_open_ms: desktopProfileOpenMs,
      used_heap_bytes: desktopMemoryBytes,
    },
    mobile: {
      viewport_css_px: [390, 844],
      focused_graph_render_ms: mobileFocusedGraph.renderMs,
      focused_graph_nodes: mobileFocusedGraph.nodes,
      profile_open_ms: mobileProfileOpenMs,
      viewport_width: mobileLayout.viewportWidth,
      document_width: mobileLayout.documentWidth,
      used_heap_bytes: mobileLayout.memoryBytes,
    },
  };
  await writeFile(`${reportDir}/performance-report.json`, `${JSON.stringify(report, null, 2)}\n`);

  expect(initialSearchHadNoDetails).toBe(true);
  expect(initialIndexPayloadBytes || runtimeIndexBytes).toBeGreaterThan(0);
  expect(detailChunkBytes).toBeGreaterThan(0);
  expect(Number.isFinite(searchRenderMs)).toBe(true);
  expect(Number.isFinite(globalOverviewRenderMs)).toBe(true);
  expect(Number.isFinite(desktopFocusedGraph.renderMs)).toBe(true);
  expect(Number.isFinite(mobileFocusedGraph.renderMs)).toBe(true);
  expect(desktopFocusedGraph.nodes).toBeLessThanOrEqual(180);
  expect(mobileFocusedGraph.nodes).toBeLessThanOrEqual(72);
  expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth);
});
