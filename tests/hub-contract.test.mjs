import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadCatalog = () => import('../apps/hub/catalog.ts').catch(() => null);
const loadI18n = () => import('../packages/i18n/index.ts').catch(() => null);
const atlasFiles = ['red-panda', 'polar-bear', 'hippopotamus'];
const atlasDocs = await Promise.all(atlasFiles.map(async (species) => ({
  id: species,
  document: JSON.parse(await readFile(new URL(`../atlases/${species}/atlas.json`, import.meta.url), 'utf8')),
})));

test('hub counts match the canonical datasets', async () => {
  const catalogModule = await loadCatalog();
  assert.ok(catalogModule, 'hub catalog module should load');
  const catalog = catalogModule.buildHubCatalog(atlasDocs);
  assert.equal(catalog.length, atlasDocs.length);
  for (const { id, document } of atlasDocs) {
    const card = catalog.find((item) => item.id === id);
    assert.ok(card, `${id} should have a catalog card`);
    assert.equal(card.animalCount, document.animals.length);
    assert.equal(card.relationshipCount, document.relationships.length);
    assert.equal(card.dataVersion, document.release.data_version);
    assert.equal(card.lastReviewed, document.coverage.last_reviewed);
    assert.ok(card.sourceCategories.length > 0);
    assert.equal(card.scope, document.coverage.scope);
  }
});

test('every canonical source category has Japanese and Russian labels', async () => {
  const i18n = await loadI18n();
  assert.ok(i18n, 'shared translations should load');
  for (const { id, document } of atlasDocs) {
    const categories = document.coverage.source_categories?.length
      ? document.coverage.source_categories
      : [...new Set(document.sources.map((source) => source.source_type))];
    for (const category of categories) {
      const english = i18n.getSourceCategoryLabel(category, 'en');
      assert.notEqual(i18n.getSourceCategoryLabel(category, 'ja'), english, `${id}:${category} needs a Japanese label`);
      assert.notEqual(i18n.getSourceCategoryLabel(category, 'ru'), english, `${id}:${category} needs a Russian label`);
    }
  }
});

test('hub explains official studbooks and the atlas scope', async () => {
  const html = await readFile(new URL('../apps/hub/index.html', import.meta.url), 'utf8');
  const main = await readFile(new URL('../apps/hub/main.ts', import.meta.url), 'utf8');
  assert.match(html, /official studbooks/i);
  assert.match(main, /scopeWarningLabel/);
  assert.match(html, /source evidence|evidence and uncertainty/i);
  assert.match(html, /corrections|contribute/i);
});

test('public media policy and future offline archive are visible', async () => {
  const html = await readFile(new URL('../apps/hub/index.html', import.meta.url), 'utf8');
  assert.match(html, /animal photographs/i);
  assert.match(html, /offline archive/i);
  assert.match(html, /original source URL/i);
  assert.match(html, /rights|credit/i);
});

test('child atlas links use the four required base paths', async () => {
  const html = await readFile(new URL('../apps/hub/index.html', import.meta.url), 'utf8');
  const catalog = await loadCatalog();
  assert.ok(catalog, 'hub catalog module should load');
  assert.match(html, /id="atlas-cards"/);
  assert.deepEqual(catalog.ATLAS_PATHS, {
    'red-panda': { path: '/atlas.red-panda/', name: 'Red panda' },
    'polar-bear': { path: '/atlas.polar-bear/', name: 'Polar bear' },
    hippopotamus: { path: '/atlas.hippopotamus/', name: 'Common hippopotamus' },
  });
});
