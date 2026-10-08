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

test('default view covers all components and defers full details until profile open', async ({ page }) => {
  const detailRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/details/')) detailRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/atlas.red-panda/');
  await expect(page.locator('[data-global-overview="true"]')).toBeVisible();
  const count = await page.locator('#animal-count').textContent();
  await expect(page.locator('.global-index-summary')).toContainText(count ?? '0');
  expect(detailRequests).toEqual([]);

  await page.getByLabel('Search animals').fill('Futa');
  await page.getByRole('button', { name: 'Open profile: Futa' }).click();
  await expect(page.locator('#profile-title')).toHaveText('風太（フウタ）');
  await expect(page.locator('svg[data-genealogy]')).toBeVisible();
  expect(detailRequests.length).toBe(1);
  await page.getByRole('button', { name: 'Close profile' }).click();
  await page.getByRole('button', { name: 'All families' }).click();
  await expect(page.locator('[data-global-overview="true"]')).toBeVisible();
});

test('hub renders all atlas cards, changes locale, and works at desktop size', async ({ page }) => {
  const errors = observeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/atlas/');
  await expect(page.locator('[data-atlas-id]')).toHaveCount(3);
  await expect(page.locator('[data-atlas-id="red-panda"] .atlas-counts')).toContainText('1554');
  await expect(page.locator('[data-atlas-id="polar-bear"] .atlas-counts')).toContainText('64');
  await expect(page.locator('[data-atlas-id="hippopotamus"] .atlas-counts')).toContainText('85');
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
    { path: '/atlas.hippopotamus/', id: 'hippopotamus:fiona', name: 'Fiona', atlas: 'hippopotamus', expectedDetail: null },
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
  await expect(page.locator('.graph-help')).toContainText('名前を選ぶ');
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
  expect(errors).toEqual([]);
});
