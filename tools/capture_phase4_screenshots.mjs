import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { createMediaRelayServer } from '../packages/media/relay-server.mjs';

const origin = process.env.ATLAS_CAPTURE_ORIGIN ?? 'http://127.0.0.1:4173';
const outputDirectory = new URL('../reports/phase4/after/', import.meta.url);
const manifestPath = new URL('../packages/media/approved-media-v1.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const approvedItem = manifest.items[0];
const baseUrl = new URL(origin);
await mkdir(outputDirectory, { recursive: true });

const relay = createMediaRelayServer({ manifest });
await new Promise((resolve, reject) => {
  relay.once('error', reject);
  relay.listen(0, '127.0.0.1', resolve);
});
const relayOrigin = `http://127.0.0.1:${relay.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
const captures = [];

async function openPage(width, height, path) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED')) errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === baseUrl.origin) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = new URL(request.url());
    const expectedExternalImage = request.resourceType() === 'image' && url.origin !== baseUrl.origin;
    if (!expectedExternalImage && url.origin === baseUrl.origin) errors.push(`request failed: ${request.url()}`);
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const mediaMatch = new RegExp(`/media/${approvedItem.id}/(thumb|profile)$`).exec(url.pathname);
    if (request.resourceType() === 'image' && url.origin === baseUrl.origin && mediaMatch) {
      const response = await fetch(`${relayOrigin}/media/${approvedItem.id}/${mediaMatch[1]}`);
      const body = Buffer.from(await response.arrayBuffer());
      await route.fulfill({
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
          'cache-control': response.headers.get('cache-control') ?? 'no-store',
          etag: response.headers.get('etag') ?? '',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'no-referrer',
        },
        body,
      });
      return;
    }
    if (request.resourceType() === 'image' && url.origin !== baseUrl.origin) {
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto(new URL(path, origin).href, { waitUntil: 'networkidle', timeout: 60_000 });
  return { context, page, errors };
}

async function saveScreenshot(page, view, width, height, errors, extra = {}) {
  const filename = `${view}-${width}x${height}.png`;
  const filepath = new URL(filename, outputDirectory);
  await page.screenshot({ path: filepath.pathname });
  assert.deepEqual(errors, [], `${view} ${width}x${height} browser errors`);
  const bytes = await readFile(filepath);
  const metadata = {
    path: `reports/phase4/after/${filename}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: (await stat(filepath)).size,
    view,
    viewport: `${width}x${height}`,
    ...extra,
  };
  captures.push(metadata);
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
}

async function captureFocused(focusId, name, width, height, profile) {
  const path = `/atlas.red-panda/?animal=${encodeURIComponent(focusId)}`;
  const { context, page, errors } = await openPage(width, height, path);
  await page.waitForSelector('#profile-title', { timeout: 30_000 });
  await page.waitForSelector('#genealogy-container svg[data-genealogy]', { timeout: 30_000 });
  if (profile) {
    if (focusId === approvedItem.animal_id) {
      const image = page.locator('#profile-dialog .profile-media img');
      await image.waitFor({ state: 'visible' });
      await page.waitForFunction((selector) => {
        const image = globalThis.document.querySelector(selector);
        return image instanceof globalThis.HTMLImageElement && image.naturalWidth === 960 && image.naturalHeight === 640;
      }, '#profile-dialog .profile-media img');
    }
    await saveScreenshot(page, `${name}-profile`, width, height, errors, { media: 'licensed relay image appears in-memory' });
  } else {
    await page.getByRole('button', { name: 'Close profile' }).click();
    await page.getByLabel('Focus depth').selectOption('3');
    await page.locator('#genealogy-container').evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const nodes = await page.locator('#genealogy-container .genealogy-node').count();
    const edges = await page.locator('#genealogy-container .genealogy-edge').count();
    await saveScreenshot(page, `${name}-focus`, width, height, errors, { nodes, edges });
  }
  await context.close();
}

async function captureGlobal(species, width, height, fitAll) {
  const { context, page, errors } = await openPage(width, height, `/atlas.${species}/`);
  const canvas = page.locator('canvas[data-global-graph-canvas="true"]');
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(400);
  if (fitAll) {
    await page.getByRole('button', { name: 'Fit all' }).click();
    await page.waitForTimeout(300);
  }
  await page.locator('#genealogy-container').evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const nodes = Number(await canvas.getAttribute('data-node-count'));
  const edges = Number(await canvas.getAttribute('data-edge-count'));
  const visibleNodes = Number(await canvas.getAttribute('data-visible-node-count'));
  const view = `${species}-${fitAll ? 'all' : 'largest-component'}`;
  await saveScreenshot(page, view, width, height, errors, { nodes, edges, visible_nodes: visibleNodes });
  await context.close();
}

try {
  for (const [width, height] of [[1440, 900], [390, 844]]) {
    await captureFocused('red-panda:futa', 'futa', width, height, true);
    await captureFocused('red-panda:futa', 'futa', width, height, false);
    await captureFocused('red-panda:upstream-449', 'rakesh', width, height, false);
    await captureGlobal('red-panda', width, height, false);
    await captureGlobal('red-panda', width, height, true);
    await captureGlobal('polar-bear', width, height, true);
    await captureGlobal('hippopotamus', width, height, true);
  }
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  }).trim();
  const screenshotManifest = {
    schema_version: 'phase4-after-screenshots-v1',
    source_revision: sourceRevision,
    viewports_css_pixels: ['1440x900', '390x844'],
    screenshots: captures.map(({ path, sha256, bytes, view, viewport, ...metadata }) => ({
      path,
      sha256,
      bytes,
      view,
      viewport,
      ...metadata,
    })),
  };
  await writeFile(new URL('screenshot-manifest.json', outputDirectory), `${JSON.stringify(screenshotManifest, null, 2)}\n`);
  process.stdout.write(`Captured ${captures.length} Phase 4 after screenshots; manifest written.\n`);
} finally {
  await browser.close();
  await new Promise((resolve) => relay.close(resolve));
}
