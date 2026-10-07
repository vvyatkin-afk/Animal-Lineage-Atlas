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

test('hub renders all atlas cards, changes locale, and works at desktop size', async ({ page }) => {
  const errors = observeErrors(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/atlas/');
  await expect(page.locator('[data-atlas-id]')).toHaveCount(3);
  await expect(page.locator('[data-atlas-id="red-panda"] .atlas-counts')).toContainText('83');
  await expect(page.locator('[data-atlas-id="polar-bear"] .atlas-counts')).toContainText('22');
  await expect(page.locator('[data-atlas-id="hippopotamus"] .atlas-counts')).toContainText('5');
  await page.screenshot({ path: `${screenshotDir}/hub-desktop.png`, fullPage: true });
  await page.getByLabel('Interface language').selectOption('ja');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  expect(errors).toEqual([]);
});

test('each child path opens a direct profile and shows its family tree', async ({ page }) => {
  const errors = observeErrors(page);
  await blockRemoteImages(page);
  const profiles = [
    { path: '/atlas.red-panda/', id: 'red-panda:futa', name: '風太（フウタ）', atlas: 'red-panda' },
    { path: '/atlas.polar-bear/', id: 'polar-bear:franz', name: 'Franz', atlas: 'polar-bear' },
    { path: '/atlas.hippopotamus/', id: 'hippopotamus:fiona', name: 'Fiona', atlas: 'hippopotamus' },
  ];
  for (const profile of profiles) {
    await page.goto(`${profile.path}?animal=${encodeURIComponent(profile.id)}`);
    await expect(page.locator('body')).toHaveAttribute('data-atlas', profile.atlas);
    await expect(page.locator('#profile-dialog')).toBeVisible();
    await expect(page.locator('#profile-title')).toHaveText(profile.name);
    await expect(page.locator('svg[data-genealogy]')).toBeVisible();
    await expect(page.locator('.media-placeholder').first()).toBeVisible();
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
  await expect(page.locator('label[for="search-input"]')).toHaveText('動物を検索');
  expect(errors).toEqual([]);
});

test('failed remote image falls back while search and genealogy remain usable', async ({ page }) => {
  const errors = observeErrors(page);
  await blockRemoteImages(page);
  await page.route('**/atlas.red-panda/runtime.json', async (route) => {
    const response = await route.fetch();
    const atlas = await response.json() as { media: Array<Record<string, unknown>> };
    atlas.media.push({
      media_id: 'media:browser-failure',
      animal_id: 'red-panda:futa',
      source_page_url: 'https://example.org/animal-record',
      direct_remote_url: 'https://images.example.invalid/failure.jpg',
      rights_status: 'permission_granted',
      embedding_status: 'allowed',
      identity_confidence: 'confirmed',
    });
    await route.fulfill({ response, body: JSON.stringify(atlas) });
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
