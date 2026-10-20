import { mkdirSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const screenshotDir = '/tmp/animal-lineage-atlas-qa';
mkdirSync(screenshotDir, { recursive: true });

function observeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED')) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === 'http://127.0.0.1:4173') {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const isExpectedBlockedImage = request.resourceType() === 'image'
      && new URL(request.url()).origin !== 'http://127.0.0.1:4173';
    if (!isExpectedBlockedImage) errors.push(`request failed: ${request.url()}`);
  });
  return errors;
}

async function blockRemoteImages(page: Page) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() === 'image' && new URL(request.url()).origin !== 'http://127.0.0.1:4173') {
      await route.abort();
      return;
    }
    await route.continue();
  });
}

async function interceptRedPandaDetails(page: Page, change: (chunk: Record<string, unknown>) => void) {
  await page.route('**/atlas.red-panda/details/*.json', async (route) => {
    const response = await route.fetch();
    const chunk = await response.json() as Record<string, unknown>;
    change(chunk);
    await route.fulfill({ response, body: JSON.stringify(chunk) });
  });
}

test('all-animal view draws the complete red-panda genealogy and defers full details until profile open', async ({ page }) => {
  const detailRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/details/')) detailRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/atlas.red-panda/');
  await expect(page.locator('[data-global-overview="true"]')).toBeVisible();
  const globalCanvas = page.locator('canvas[data-global-graph-canvas="true"]');
  await expect(globalCanvas).toBeVisible();
  await expect(globalCanvas).toHaveAttribute('data-node-count', '1554');
  await expect(globalCanvas).toHaveAttribute('data-edge-count', '2394');
  const count = await page.locator('#animal-count').textContent();
  await expect(page.locator('.global-index-summary')).toContainText(`${count} animals`);
  await expect(page.locator('.global-index-summary')).toContainText('2394 recorded relationships');
  expect(detailRequests).toEqual([]);

  const familyLayoutBuilds = Number(await page.locator('#genealogy-container').getAttribute('data-layout-builds'));
  await page.getByLabel('Arrange rows by').selectOption('country');
  await expect(globalCanvas).toHaveAttribute('data-node-count', '1554');
  await page.getByLabel('Arrange rows by').selectOption('family');
  const layoutBuildsBeforeZoom = Number(await page.locator('#genealogy-container').getAttribute('data-layout-builds'));
  expect(layoutBuildsBeforeZoom).toBeGreaterThan(familyLayoutBuilds);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(globalCanvas).toHaveAttribute('data-generation-labels-visible', 'false');
  for (let step = 0; step < 10; step += 1) await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(globalCanvas).toHaveAttribute('data-generation-labels-visible', 'true');
  expect(Number(await page.locator('#genealogy-container').getAttribute('data-layout-builds'))).toBe(layoutBuildsBeforeZoom);
  await page.getByRole('button', { name: 'Fit all' }).click();
  await page.locator('[data-global-graph-viewport="true"]').screenshot({ path: `${screenshotDir}/phase3-red-panda-global-desktop-1440x900.png` });

  await page.getByLabel('Search animals').fill('Futa');
  await page.getByRole('button', { name: 'Open profile: Futa' }).click();
  await expect(page.locator('#profile-title')).toHaveText('風太（フウタ）');
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  expect(detailRequests.length).toBe(1);
  const focusDepth3Count = await page.locator('#genealogy-container .genealogy-node').count();
  await page.getByLabel('Focus depth').selectOption('all');
  const allDepthCount = await page.locator('#genealogy-container .genealogy-node').count();
  expect(allDepthCount).toBeGreaterThanOrEqual(focusDepth3Count);
  await page.getByRole('button', { name: 'Close profile' }).click();
  await page.getByRole('button', { name: 'All animals' }).click();
  await expect(page.locator('[data-global-overview="true"]')).toBeVisible();
});

test('global graph keeps its camera open while high-detail animal cards open exact profiles in a new tab', async ({ page }) => {
  await blockRemoteImages(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/atlas.red-panda/');
  const canvas = page.locator('canvas[data-global-graph-canvas="true"]');
  await expect(canvas).toBeVisible();
  const layoutBuilds = Number(await page.locator('#genealogy-container').getAttribute('data-layout-builds'));
  for (let step = 0; step < 5; step += 1) await page.getByRole('button', { name: 'Zoom in' }).click();
  const firstCard = page.locator('.global-node-card').first();
  await expect(firstCard).toBeVisible();
  await page.locator('[data-global-graph-viewport="true"]').screenshot({ path: `${screenshotDir}/phase3-red-panda-global-detail-desktop-1440x900.png` });
  const animalId = await firstCard.getAttribute('data-animal-id');
  expect(animalId).toBeTruthy();
  expect(await firstCard.getAttribute('target')).toBe('_blank');
  expect(await firstCard.getAttribute('href')).toContain(`animal=${encodeURIComponent(animalId!)}`);
  const popupPromise = page.waitForEvent('popup');
  await firstCard.click();
  const profileTab = await popupPromise;
  await expect(profileTab.locator('#profile-title')).toBeVisible();
  await expect.poll(() => new URL(profileTab.url()).searchParams.get('animal')).toBe(animalId);
  await expect(page).toHaveURL(/\/atlas\.red-panda\/$/);
  expect(Number(await page.locator('#genealogy-container').getAttribute('data-layout-builds'))).toBe(layoutBuilds);
  expect(Number(await canvas.getAttribute('data-node-count'))).toBe(1554);
  expect(Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(0.5);
});

test('global graph includes every species index and keeps hippo taxa within their own records', async ({ page }) => {
  const atlases = [
    { id: 'red-panda', animals: 1554, relationships: 2394 },
    { id: 'polar-bear', animals: 72, relationships: 63 },
    { id: 'hippopotamus', animals: 96, relationships: 86 },
  ];
  for (const atlas of atlases) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/atlas.${atlas.id}/`);
    const canvas = page.locator('canvas[data-global-graph-canvas="true"]');
    await expect(canvas).toHaveAttribute('data-node-count', String(atlas.animals));
    await expect(canvas).toHaveAttribute('data-edge-count', String(atlas.relationships));
    await expect(page.locator('.global-index-summary')).toContainText(`${atlas.animals} animals`);
    await expect(page.locator('.global-graph-legend')).toContainText('Confirmed');
    await expect(page.locator('.global-graph-legend')).toContainText('Unknown');
    if (atlas.id === 'hippopotamus') {
      await expect(page.locator('#atlas-title')).toContainText('Hippopotamuses (common and pygmy)');
      const taxaCounts = await page.evaluate(async () => {
        const runtime = await (await fetch('./runtime.json')).json() as {
          animals: Array<{ id: string; taxon: string }>;
          relationships: Array<{ subject: string; object: string }>;
        };
        const taxonById = new Map(runtime.animals.map((animal) => [animal.id, animal.taxon]));
        return {
          common: runtime.animals.filter((animal) => animal.taxon === 'Hippopotamus amphibius').length,
          pygmy: runtime.animals.filter((animal) => animal.taxon === 'Choeropsis liberiensis').length,
          crossTaxonEdges: runtime.relationships.filter((edge) => taxonById.get(edge.subject) !== taxonById.get(edge.object)).length,
        };
      });
      expect(taxaCounts).toEqual({ common: 64, pygmy: 32, crossTaxonEdges: 0 });
    }
  }
});

test('country-coded nodes use bundled SVG flags at overview and card detail levels', async ({ page }) => {
  const flagRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.includes('/flags/')) flagRequests.push(pathname);
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/atlas.polar-bear/');
  const flagResponse = await page.request.get('/atlas.polar-bear/flags/us.svg');
  expect(flagResponse.ok()).toBeTruthy();
  expect(await flagResponse.text()).toContain('<svg');

  await page.getByLabel('Known location').selectOption('US');
  await page.getByRole('button', { name: 'Fit all' }).click();
  const canvas = page.locator('canvas[data-global-graph-canvas="true"]');
  await expect.poll(async () => Number(await canvas.getAttribute('data-visible-node-count'))).toBeGreaterThan(0);
  const nodePoint = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const context = canvasElement.getContext('2d');
    if (!context) return null;
    const pixels = context.getImageData(0, 0, canvasElement.width, canvasElement.height).data;
    const nodeColors = new Set(['71,119,92', '120,131,125', '176,147,94']);
    for (let index = 0; index < pixels.length; index += 4) {
      if (nodeColors.has(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`)) {
        const pixelIndex = index / 4;
        const ratio = canvasElement.width / canvasElement.clientWidth;
        return { x: (pixelIndex % canvasElement.width) / ratio, y: Math.floor(pixelIndex / canvasElement.width) / ratio };
      }
    }
    return null;
  });
  expect(nodePoint).not.toBeNull();
  const viewport = page.locator('[data-global-graph-viewport="true"]');
  await viewport.screenshot({ path: `${screenshotDir}/phase3-polar-bear-flags-overview-desktop-1440x900.png` });
  await viewport.evaluate((element, point) => {
    const rectangle = element.getBoundingClientRect();
    for (let step = 0; step < 18; step += 1) {
      element.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        deltaY: -100,
        clientX: rectangle.left + point.x,
        clientY: rectangle.top + point.y,
      }));
    }
  }, nodePoint!);
  await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(0.6);
  const cardFlag = page.locator('.global-node-card img.global-node-flag').first();
  await expect(cardFlag).toBeVisible();
  await expect.poll(() => cardFlag.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  expect(flagRequests.some((pathname) => pathname.endsWith('/flags/us.svg'))).toBeTruthy();
  await expect(canvas).toHaveAttribute('data-node-count', '72');
  await viewport.screenshot({ path: `${screenshotDir}/phase3-polar-bear-flags-desktop-1440x900.png` });
});

test('sex, life-status, and photo filters update visible graph nodes and only retain edges between visible animals', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/atlas.red-panda/');
  const canvas = page.locator('canvas[data-global-graph-canvas="true"]');
  const layoutBuilds = Number(await page.locator('#genealogy-container').getAttribute('data-layout-builds'));
  const countVisible = async (filter: { sex?: string; status?: string; photo?: 'confirmed' | 'unconfirmed' } = {}) => page.evaluate(async (criteria) => {
    const runtime = await (await fetch('./runtime.json')).json() as {
      animals: Array<{ id: string; sex?: string; status?: string; photo_confirmed?: boolean }>;
      relationships: Array<{ subject: string; object: string }>;
    };
    const predicate = (animal: typeof runtime.animals[number]) =>
      (!criteria.sex || animal.sex === criteria.sex)
      && (!criteria.status || animal.status === criteria.status)
      && (!criteria.photo || (criteria.photo === 'confirmed' ? animal.photo_confirmed === true : animal.photo_confirmed !== true));
    const visible = new Set(runtime.animals.filter(predicate).map((animal) => animal.id));
    return {
      animals: visible.size,
      relationships: runtime.relationships.filter((edge) => visible.has(edge.subject) && visible.has(edge.object)).length,
    };
  }, filter);

  const female = await countVisible({ sex: 'female' });
  await page.getByLabel('Sex').selectOption('female');
  await expect(canvas).toHaveAttribute('data-filtered-node-count', String(female.animals));
  await expect(canvas).toHaveAttribute('data-filtered-edge-count', String(female.relationships));
  await expect(page.locator('.global-filter-summary')).toBeVisible();
  expect(Number(await page.locator('#genealogy-container').getAttribute('data-layout-builds'))).toBe(layoutBuilds);

  const livingFemale = await countVisible({ sex: 'female', status: 'living' });
  await page.getByLabel('Life status').selectOption('living');
  await expect(canvas).toHaveAttribute('data-filtered-node-count', String(livingFemale.animals));
  await expect(canvas).toHaveAttribute('data-filtered-edge-count', String(livingFemale.relationships));

  const unconfirmed = await countVisible({ sex: 'female', status: 'living', photo: 'unconfirmed' });
  await page.getByLabel('Photo match').selectOption('unconfirmed');
  await expect(canvas).toHaveAttribute('data-filtered-node-count', String(unconfirmed.animals));
  await expect(canvas).toHaveAttribute('data-filtered-edge-count', String(unconfirmed.relationships));
  await page.getByLabel('Sex').selectOption('');
  await page.getByLabel('Life status').selectOption('');
  await page.getByLabel('Photo match').selectOption('');
  await expect(canvas).toHaveAttribute('data-filtered-node-count', '1554');
  await expect(page.locator('.global-filter-summary')).toBeHidden();
});

test('mobile full graph fits all rows, remains within the viewport, and supports pan and zoom', async ({ page }) => {
  const errors = observeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/atlas.red-panda/');
  const canvas = page.locator('canvas[data-global-graph-canvas="true"]');
  await expect(canvas).toHaveAttribute('data-node-count', '1554');
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect(canvas).toHaveAttribute('data-visible-node-count', '1554');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.locator('[data-global-graph-viewport="true"]').screenshot({ path: `${screenshotDir}/phase3-red-panda-global-mobile-390x844.png` });

  await canvas.focus();
  const zoomBefore = Number(await canvas.getAttribute('data-zoom'));
  await page.keyboard.press('+');
  await expect.poll(async () => Number(await canvas.getAttribute('data-zoom'))).toBeGreaterThan(zoomBefore);
  const panBefore = Number(await canvas.getAttribute('data-pan-x'));
  const box = await page.locator('[data-global-graph-viewport="true"]').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 36, box!.y + box!.height / 2 + 22);
  await page.mouse.up();
  await expect.poll(async () => Number(await canvas.getAttribute('data-pan-x'))).not.toBe(panBefore);

  const panAfterDrag = Number(await canvas.getAttribute('data-pan-x'));
  await page.getByRole('button', { name: 'Fit all' }).click();
  await expect.poll(async () => Number(await canvas.getAttribute('data-pan-x'))).not.toBe(panAfterDrag);
  const nodePoint = await canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const context = canvasElement.getContext('2d');
    if (!context) return null;
    const pixels = context.getImageData(0, 0, canvasElement.width, canvasElement.height).data;
    const nodeColors = new Set(['71,119,92', '120,131,125', '176,147,94']);
    for (let index = 0; index < pixels.length; index += 4) {
      if (nodeColors.has(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`)) {
        const pixelIndex = index / 4;
        const ratio = canvasElement.width / canvasElement.clientWidth;
        return { x: (pixelIndex % canvasElement.width) / ratio, y: Math.floor(pixelIndex / canvasElement.width) / ratio };
      }
    }
    return null;
  });
  expect(nodePoint).not.toBeNull();
  const fitAllBox = await page.locator('[data-global-graph-viewport="true"]').boundingBox();
  expect(fitAllBox).not.toBeNull();
  await page.mouse.click(fitAllBox!.x + nodePoint!.x, fitAllBox!.y + nodePoint!.y);
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('hub renders all atlas cards, changes locale, and works at desktop size', async ({ page }) => {
  const errors = observeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/atlas/');
  await expect(page.locator('[data-atlas-id]')).toHaveCount(3);
  await expect(page.locator('[data-atlas-id="red-panda"] .atlas-counts')).toContainText('1554');
  await expect(page.locator('[data-atlas-id="polar-bear"] .atlas-counts')).toContainText('72');
  await expect(page.locator('[data-atlas-id="hippopotamus"] .atlas-counts')).toContainText('96');
  await page.screenshot({ path: `${screenshotDir}/hub-desktop.png`, fullPage: true });
  await page.getByLabel('Interface language').selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('.top-nav')).toContainText('アトラス');
  await expect(page.locator('[data-atlas-id="red-panda"] .card-scope')).toContainText('固定したwwoast/redpanda-lineage');
  await expect(page.locator('[data-atlas-id="red-panda"] .source-categories')).toContainText('コミュニティ作成データセット');
  await page.locator('#language-select').selectOption('ru');
  await expect(page.locator('[data-atlas-id="red-panda"] .card-scope')).toContainText('В закреплённый глобальный экспорт');
  await expect(page.locator('[data-atlas-id="red-panda"] .source-categories')).toContainText('Датасет сообщества');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.language-control > span')).toBeVisible();
  const hubLanguageFontSize = await page.locator('#language-select').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(hubLanguageFontSize).toBeGreaterThan(12);
  expect(errors).toEqual([]);
});

test('each child path opens a direct profile and shows its family tree', async ({ page }) => {
  const errors = observeErrors(page);
  await blockRemoteImages(page);
  const profiles = [
    { path: '/atlas.red-panda/', id: 'red-panda:futa', name: '風太（フウタ）', atlas: 'red-panda', expectedDetail: null },
    { path: '/atlas.red-panda/', id: 'red-panda:kelu', name: 'Kelú', atlas: 'red-panda', expectedDetail: 'Zoológico de Parquemet' },
    { path: '/atlas.polar-bear/', id: 'polar-bear:franz', name: 'Franz', atlas: 'polar-bear', expectedDetail: null },
    { path: '/atlas.polar-bear/', id: 'polar-bear:kallik-toledo', name: 'Kallik', atlas: 'polar-bear', expectedDetail: null },
    { path: '/atlas.hippopotamus/', id: 'hippopotamus:fiona', name: 'Fiona', atlas: 'hippopotamus', expectedDetail: null },
    { path: '/atlas.hippopotamus/', id: 'hippopotamus-common-animal-abq-maisy', name: 'Maisy', atlas: 'hippopotamus', expectedDetail: null },
    { path: '/atlas.hippopotamus/', id: 'hippopotamus-pygmy-animal-basel-voobadee', name: 'Voobadee', atlas: 'hippopotamus', expectedDetail: null },
    { path: '/atlas.hippopotamus/', id: 'hippopotamus-pygmy-animal-taronga-lololi', name: 'Lololi', atlas: 'hippopotamus', expectedDetail: null },
  ];
  for (const profile of profiles) {
    await page.goto(`${profile.path}?animal=${encodeURIComponent(profile.id)}`);
    await expect(page.locator('body')).toHaveAttribute('data-atlas', profile.atlas);
    await expect(page.locator('#profile-dialog')).toBeVisible();
    await expect(page.locator('#profile-title')).toHaveText(profile.name);
    await expect(page.locator('svg[data-genealogy]')).toBeVisible();
    await expect(page.locator('.media-placeholder').first()).toBeVisible();
    if (profile.expectedDetail) {
      await expect(page.locator('#profile-dialog')).toContainText(profile.expectedDetail);
      await expect(page.locator(`#profile-dialog a[href="https://www.instagram.com/p/Cv7skWKuggY/"]`).first()).toBeVisible();
    }
    expect(await page.locator('#profile-dialog a[href^="https://"]').count()).toBeGreaterThan(0);
  }
  await page.goto(`/atlas.red-panda/?animal=${encodeURIComponent('red-panda:futa')}`);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${screenshotDir}/red-panda-desktop.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('related profile navigation closes cleanly and keeps the original tree focus', async ({ page }) => {
  const errors = observeErrors(page);
  await page.goto(`/atlas.hippopotamus/?animal=${encodeURIComponent('hippopotamus:fiona')}`);
  const originalTreeFocus = page.locator('[data-animal-id="hippopotamus:fiona"]');
  await expect(originalTreeFocus).toBeVisible();
  await page.getByRole('button', { name: 'Mother: Bibi' }).click();
  await expect(page.locator('#profile-title')).toHaveText('Bibi');
  await expect(page).toHaveURL(/animal=hippopotamus%3Abibi/);
  await page.getByRole('button', { name: 'Close profile' }).click();
  await expect(page.locator('#profile-dialog')).not.toBeVisible();
  await expect(page).not.toHaveURL(/animal=/);
  await expect(originalTreeFocus).toBeVisible();
  expect(errors).toEqual([]);
});

test('historical facilities are searchable and transfer details retain both endpoints', async ({ page }) => {
  const errors = observeErrors(page);
  await page.goto(`/atlas.polar-bear/?animal=${encodeURIComponent('polar-bear:vaida')}`);
  await expect(page.locator('#profile-dialog')).toContainText('From: Kazan Zoo');
  await expect(page.locator('#profile-dialog')).toContainText('To: Tallinn Zoo');
  await page.getByRole('button', { name: 'Close profile' }).click();
  await page.getByLabel('Search animals').fill('Kazan Zoo');
  const vaidaResult = page.getByRole('button', { name: /Open profile: Vaida/ });
  await expect(vaidaResult).toBeVisible();
  await vaidaResult.click();
  await expect(page.locator('#profile-title')).toHaveText('Vaida');
  await page.getByLabel('Interface language').selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('#atlas-kind')).toHaveText('ホッキョクグマのアトラス');
  await expect(page.locator('#atlas-title')).toHaveText('ホッキョクグマの系譜');
  await expect(page.locator('label[for="search-input"]')).toHaveText('動物を検索');
  await expect(page.locator('.tree-heading-row .eyebrow')).toHaveText('家族の記録');
  await expect(page.locator('.graph-help')).toContainText('名前・IDを検索');
  await expect(page.locator('.coverage-method')).toContainText('出典を示します');
  expect(errors).toEqual([]);
  await page.getByLabel('表示言語').selectOption('ru');
  await expect(page.locator('#atlas-kind')).toHaveText('Атлас: Белый медведь');
  await expect(page.locator('#atlas-title')).toHaveText('Родословная: Белый медведь');
});

test('child coverage scope and limitations follow Japanese and Russian locale choices', async ({ page }) => {
  await page.goto('/atlas.hippopotamus/');
  await page.getByLabel('Interface language').selectOption('ja');
  await expect(page.locator('#coverage-scope')).toContainText('Cincinnati、San Diego');
  await expect(page.locator('#coverage-scope')).toContainText('コビトカバの公開記録');
  await page.locator('#language-select').selectOption('ru');
  await expect(page.locator('#coverage-scope')).toContainText('Именованные обыкновенные бегемоты');
  await expect(page.locator('#coverage-scope')).toContainText('Именованные карликовые бегемоты');
});

test('optional local manifest renders a local media asset in the profile UI', async ({ page }) => {
  const errors = observeErrors(page);
  await interceptRedPandaDetails(page, (chunk) => {
    const media = chunk.media as Array<Record<string, unknown>>;
    media.push({
      media_id: 'media:offline-ui-test',
      animal_id: 'red-panda:futa',
      source_page_url: 'https://example.org/source-record',
      rights_status: 'fixture_only',
      embedding_status: 'link_only',
      credit: null,
    });
  });
  await page.route('**/atlas.red-panda/local-media-manifest.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      format: 'animal-lineage-atlas-local-media-manifest-v1',
      items: [{
        media_id: 'media:offline-ui-test', relative_path: 'local-media-swatch.svg',
        original_source_url: 'https://example.org/source-record', credit: 'Offline archive fixture',
        rights_status: 'fixture_only', checksum: 'sha256:fixture', archive_status: 'test_fixture',
      }],
    }),
  }));
  await page.route('**/atlas.red-panda/local-media-swatch.svg', (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#789"/></svg>',
  }));
  await page.goto(`/atlas.red-panda/?animal=${encodeURIComponent('red-panda:futa')}`);
  const localImage = page.locator('#profile-dialog img[src="./local-media-swatch.svg"]');
  await expect(localImage).toBeVisible();
  await expect(localImage).toHaveJSProperty('naturalWidth', 32);
  await expect(page.locator('#profile-dialog')).toContainText('Offline archive fixture');
  await expect(page.locator('#profile-dialog a[href="https://example.org/source-record"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('failed remote image falls back while search and genealogy remain usable', async ({ page }) => {
  const errors = observeErrors(page);
  await blockRemoteImages(page);
  await interceptRedPandaDetails(page, (chunk) => {
    const media = chunk.media as Array<Record<string, unknown>>;
    media.push({
      media_id: 'media:browser-failure',
      animal_id: 'red-panda:futa',
      source_page_url: 'https://example.org/animal-record',
      direct_remote_url: 'https://images.example.invalid/failure.jpg',
      rights_status: 'permission_granted',
      embedding_status: 'allowed',
      identity_confidence: 'confirmed',
    });
  });
  await page.goto(`/atlas.red-panda/?animal=${encodeURIComponent('red-panda:futa')}`);
  await expect(page.locator('#profile-dialog .media-placeholder')).toHaveCount(2);
  await expect(page.locator('#profile-dialog .profile-image')).toHaveCount(0);
  await expect(page.locator('#profile-dialog a[href="https://example.org/animal-record"]')).toBeVisible();
  await expect(page.locator('#search-results .result-card').first()).toBeVisible();
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${screenshotDir}/red-panda-mobile.png`, fullPage: false });
  expect(errors).toEqual([]);
});

test('mobile atlas fits the viewport and supports keyboard profile controls', async ({ page }) => {
  const errors = observeErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/atlas.hippopotamus/?animal=${encodeURIComponent('hippopotamus:fiona')}`);
  await expect(page.locator('.language-control > span')).toBeVisible();
  const atlasLanguageFontSize = await page.locator('#language-select').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(atlasLanguageFontSize).toBeGreaterThan(12);
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  await page.getByRole('button', { name: 'Close profile' }).click();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${screenshotDir}/hippopotamus-mobile.png`, fullPage: true });
  await page.locator('[data-animal-id="hippopotamus:fiona"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#profile-title')).toHaveText('Fiona');
  await page.getByRole('button', { name: 'Close profile' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#profile-dialog')).not.toBeVisible();
  await page.goto('/atlas.red-panda/?animal=red-panda%3Afuta');
  await expect(page.locator('#profile-title')).toHaveText('風太（フウタ）');
  await page.getByRole('button', { name: 'Close profile' }).click();
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  await expect.poll(() => page.locator('.genealogy-node').count()).toBeGreaterThan(1);
  const focusCard = await page.locator('[data-animal-id="red-panda:futa"] rect').boundingBox();
  expect(focusCard?.width).toBeGreaterThan(120);
  await page.locator('#genealogy-container').screenshot({ path: `${screenshotDir}/phase3-red-panda-focus-mobile-390x844.png` });
  expect(errors).toEqual([]);
});
