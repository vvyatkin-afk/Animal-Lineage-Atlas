import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const localManifestUrl = new URL('../packages/media/fixtures/local-media-manifest.json', import.meta.url);
const approvedManifestUrl = new URL('../packages/media/approved-media-v1.json', import.meta.url);
const loadSearch = () => import('../packages/search/search.ts').catch(() => null);
const loadMedia = () => import('../packages/media/resolver.ts').catch(() => null);

const animals = [
  {
    id: 'red-panda:futa',
    taxon: 'Ailurus fulgens',
    name: {
      canonical: '風太',
      language: 'ja',
      localized: [{ value: 'Fūta', language: 'en' }],
    },
    aliases: [{ value: 'Futa', language: 'en' }],
    external_ids: [{ namespace: 'legacy-futa-tree', value: 'futa' }],
    country_code: 'JP',
    institution_names: ['Chiba Zoological Park', '千葉市動物公園'],
  },
  {
    id: 'polar-bear:nora',
    taxon: 'Ursus maritimus',
    name: { canonical: 'Nora', language: 'en', localized: [] },
    aliases: [{ value: 'Norā', language: 'en' }],
    external_ids: [{ namespace: 'zoo-record', value: 'N-13' }],
    country_code: 'AT',
    institution_names: ['Tiergarten Schönbrunn'],
  },
];

test('normalizes case spacing and diacritics without changing display values', async () => {
  const search = await loadSearch();
  assert.ok(search, 'search package should load');
  assert.equal(search.normalizeSearchKey('  Schönbrunn   Café  '), 'schonbrunn cafe');
  assert.equal(animals[1].institution_names[0], 'Tiergarten Schönbrunn');
});

test('searches names aliases IDs and institutions', async () => {
  const search = await loadSearch();
  assert.ok(search, 'search package should load');
  for (const query of ['Fūta', 'Futa', 'red-panda:futa', 'futa', '千葉市動物公園']) {
    assert.deepEqual(search.searchAnimals(animals, query).map((animal) => animal.id), ['red-panda:futa']);
  }
  assert.deepEqual(search.searchAnimals(animals, 'nora').map((animal) => animal.id), ['polar-bear:nora']);
  assert.deepEqual(search.searchAnimals(animals, 'N-13').map((animal) => animal.id), ['polar-bear:nora']);
});

test('external ID namespaces do not create broad matches for shared namespace text', async () => {
  const search = await loadSearch();
  assert.ok(search, 'search package should load');
  const family = [
    {
      id: 'red-panda:child-one', taxon: 'Ailurus fulgens',
      name: { canonical: 'Child One' }, aliases: [],
      external_ids: [{ namespace: 'legacy-futa-tree', value: 'child-one' }],
    },
    {
      id: 'red-panda:futa', taxon: 'Ailurus fulgens',
      name: { canonical: 'Futa' }, aliases: [],
      external_ids: [{ namespace: 'legacy-futa-tree', value: 'futa' }],
    },
  ];

  assert.deepEqual(search.searchAnimals(family, 'futa').map((animal) => animal.id), ['red-panda:futa']);
  assert.deepEqual(search.searchAnimals(family, 'legacy-futa-tree:child-one').map((animal) => animal.id), ['red-panda:child-one']);
});

test('applies country and taxon facets without changing stored values', async () => {
  const search = await loadSearch();
  assert.ok(search, 'search package should load');
  assert.deepEqual(search.searchAnimals(animals, '', { countryCode: 'jp' }).map((animal) => animal.id), ['red-panda:futa']);
  assert.deepEqual(search.searchAnimals(animals, '', { taxon: 'URSUS MARITIMUS' }).map((animal) => animal.id), ['polar-bear:nora']);
  assert.equal(animals[0].name.canonical, '風太');
});

test('filters sex, life status, and photo confirmation without rewriting records', async () => {
  const search = await loadSearch();
  assert.ok(search, 'search package should load');
  const records = [
    { ...animals[0], sex: 'female', status: 'living', photo_confirmed: true },
    { ...animals[1], sex: 'male', status: 'deceased', photo_confirmed: false },
    { ...animals[0], id: 'red-panda:unknown', sex: 'unknown', status: 'unknown' },
  ];
  assert.deepEqual(search.searchAnimals(records, '', { sex: 'female', status: 'living' }).map((animal) => animal.id), ['red-panda:futa']);
  assert.deepEqual(search.searchAnimals(records, '', { sex: 'unknown', status: 'unknown' }).map((animal) => animal.id), ['red-panda:unknown']);
  assert.deepEqual(search.searchAnimals(records, '', { photo: 'confirmed' }).map((animal) => animal.id), ['red-panda:futa']);
  assert.deepEqual(search.searchAnimals(records, '', { photo: 'unconfirmed' }).map((animal) => animal.id), ['polar-bear:nora', 'red-panda:unknown']);
  assert.equal(records[0].sex, 'female');
});

test('indexes population and normalized search text once for fast focused queries', async () => {
  const indexModule = await import('../packages/search/atlas-index.ts');
  const search = await loadSearch();
  assert.ok(search, 'search package should load');
  const index = indexModule.buildAtlasSearchIndex({
    animals: [
      { ...animals[0], population: 'wild' },
      { ...animals[1], population: 'zoo_captive' },
    ],
    institutions: [],
    events: [],
  });

  assert.equal(index[0].population, 'wild');
  assert.match(index[0].search_key, /futa/);
  assert.match(index[0].search_key, /千葉市動物公園/);
  assert.deepEqual(search.searchAnimals(index, 'futa', { population: 'wild' }).map((animal) => animal.id), ['red-panda:futa']);
  assert.deepEqual(search.searchAnimals(index, '', { population: 'zoo_captive' }).map((animal) => animal.id), ['polar-bear:nora']);
});

test('remote media requires explicit rights and embedding permission', async () => {
  const media = await loadMedia();
  assert.ok(media, 'media resolver package should load');
  const reference = {
    media_id: 'media:test',
    source_page_url: 'https://zoo.example/animal',
    direct_remote_url: 'https://cdn.example/animal.jpg',
    rights_status: 'permission_granted',
    embedding_status: 'allowed',
  };
  assert.deepEqual(media.resolvePublicMedia(reference), {
    kind: 'remote',
    src: 'https://cdn.example/animal.jpg',
    sourceUrl: 'https://zoo.example/animal',
  });

  const restricted = media.resolvePublicMedia({
    ...reference,
    rights_status: 'unknown',
    embedding_status: 'link_only',
  });
  assert.equal(restricted.kind, 'placeholder');
  assert.equal(restricted.src, undefined);
  assert.equal(restricted.sourceUrl, 'https://zoo.example/animal');
});

test('remote media failure returns a neutral placeholder and source link', async () => {
  const media = await loadMedia();
  assert.ok(media, 'media resolver package should load');
  const result = media.resolvePublicMedia(
    {
      media_id: 'media:test',
      source_page_url: 'https://zoo.example/animal',
      direct_remote_url: 'https://cdn.example/animal.jpg',
      rights_status: 'permission_granted',
      embedding_status: 'allowed',
    },
    { remoteFailed: true },
  );
  assert.equal(result.kind, 'placeholder');
  assert.equal(result.sourceUrl, 'https://zoo.example/animal');
  assert.match(result.description, /unavailable/i);
});

test('local resolver reads manifest contract without animal photo bytes', async () => {
  const media = await loadMedia();
  assert.ok(media, 'media resolver package should load');
  const manifest = JSON.parse(await readFile(localManifestUrl, 'utf8'));
  const fixturePath = fileURLToPath(new URL(`../packages/media/fixtures/${manifest.items[0].relative_path}`, import.meta.url));
  const fixtureContent = await readFile(fixturePath, 'utf8');
  const resolveLocal = media.createLocalResolver(manifest);
  const result = resolveLocal({ media_id: 'media:fixture-swatch' });

  assert.equal(result.kind, 'local');
  assert.equal(result.src, './local-media-swatch.svg');
  assert.equal(result.sourceUrl, 'https://example.org/source-record');
  assert.equal(result.credit, 'Generic interface fixture');
  assert.equal(result.rightsStatus, 'fixture_only');
  assert.equal(result.checksum, manifest.items[0].checksum);
  assert.equal(result.archiveStatus, 'test_fixture');
  assert.match(fixtureContent, /svg/i);
});

test('approved media manifest exposes only verified CC BY source and fixed bounded variants', async () => {
  const manifest = JSON.parse(await readFile(approvedManifestUrl, 'utf8'));
  assert.equal(manifest.format, 'animal-lineage-atlas-approved-media-v1');
  assert.equal(manifest.items.length, 1);
  const item = manifest.items[0];
  assert.match(item.id, /^[a-f0-9]{32}$/);
  assert.equal(item.animal_id, 'red-panda:futa');
  assert.equal(item.identity_confidence, 'confirmed');
  assert.equal(item.rights_status, 'cc-by-4.0');
  assert.equal(item.creator, 'Misei sen');
  assert.equal(item.license.url, 'https://creativecommons.org/licenses/by/4.0/');
  assert.equal(item.source_page_url, 'https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg');
  assert.deepEqual(Object.keys(item.variants).sort(), ['profile', 'thumb']);
  for (const variant of Object.values(item.variants)) {
    assert.equal(new URL(variant.url).hostname, 'thumb.wikimedia.org');
    assert.equal(variant.mime_type, 'image/jpeg');
    assert.ok(variant.max_bytes > 0 && variant.max_bytes <= 400_000);
  }
});

test('approved relay resolver creates same-origin URLs with attribution and link-only fallback', async () => {
  const media = await loadMedia();
  assert.ok(media, 'media resolver package should load');
  assert.equal(typeof media.createApprovedMediaResolver, 'function');
  const manifest = JSON.parse(await readFile(approvedManifestUrl, 'utf8'));
  const item = manifest.items[0];
  const publicManifest = {
    format: 'animal-lineage-atlas-public-media-v1',
    items: [{
      id: item.id,
      animal_id: item.animal_id,
      identity_confidence: item.identity_confidence,
      source_page_url: item.source_page_url,
      creator: item.creator,
      credit: item.credit,
      rights_status: item.rights_status,
      embedding_status: item.embedding_status,
      license: item.license,
      changes: item.changes,
      variants: Object.keys(item.variants),
    }],
  };
  const resolve = media.createApprovedMediaResolver(publicManifest, '/atlas.red-panda/');
  const result = resolve({
    media_id: item.id,
    source_page_url: item.source_page_url,
    rights_status: item.rights_status,
    embedding_status: 'allowed',
    animal_id: item.animal_id,
  });
  assert.equal(result.kind, 'relay');
  assert.equal(result.src, `/atlas.red-panda/media/${item.id}/profile`);
  assert.equal(result.sourceUrl, item.source_page_url);
  assert.equal(result.credit, 'Misei sen');
  assert.equal(result.licenseName, 'CC BY 4.0');
  assert.equal(result.licenseUrl, 'https://creativecommons.org/licenses/by/4.0/');
  assert.match(result.changes, /no changes/i);
  assert.equal(resolve({
    media_id: item.id,
    source_page_url: item.source_page_url,
    rights_status: item.rights_status,
    embedding_status: 'allowed',
    animal_id: item.animal_id,
  }, 'thumb').src, `/atlas.red-panda/media/${item.id}/thumb`);

  const unlisted = resolve({
    media_id: 'd'.repeat(32),
    source_page_url: 'https://example.org/animal',
    rights_status: 'cc-by-4.0',
    embedding_status: 'allowed',
    animal_id: 'red-panda:futa',
  });
  assert.equal(unlisted.kind, 'placeholder');
  assert.equal(unlisted.sourceUrl, 'https://example.org/animal');
});

test('profile model keeps multiple approved images as separate gallery entries', async () => {
  const media = await loadMedia();
  const profiles = await import('../packages/ui/profile-dialog.ts');
  const manifest = JSON.parse(await readFile(approvedManifestUrl, 'utf8'));
  const first = manifest.items[0];
  const secondId = 'c'.repeat(32);
  const secondPage = 'https://example.org/second-photo-page';
  const fixtureFirst = { ...first, animal_id: 'fixture:animal' };
  const publicManifest = {
    format: 'animal-lineage-atlas-public-media-v1',
    items: [fixtureFirst, {
      ...fixtureFirst,
      id: secondId,
      animal_id: 'fixture:animal',
      source_page_url: secondPage,
      creator: 'Test Photographer',
      credit: 'Test Photographer',
    }].map((item) => ({
      id: item.id,
      animal_id: item.animal_id,
      identity_confidence: item.identity_confidence,
      source_page_url: item.source_page_url,
      creator: item.creator,
      credit: item.credit,
      rights_status: item.rights_status,
      embedding_status: item.embedding_status,
      license: item.license,
      changes: item.changes,
      variants: Object.keys(item.variants ?? { thumb: {}, profile: {} }),
    })),
  };
  const resolve = media.createApprovedMediaResolver(publicManifest, '/atlas.fixture/');
  const model = profiles.buildProfileModel({
    animals: [{ id: 'fixture:animal', taxon: 'Test species', name: { canonical: 'Test animal' } }],
    relationships: [], events: [], claims: [], sources: [],
    media: [
      { media_id: first.id, animal_id: 'fixture:animal', source_page_url: first.source_page_url, rights_status: first.rights_status, embedding_status: 'allowed' },
      { media_id: secondId, animal_id: 'fixture:animal', source_page_url: secondPage, rights_status: first.rights_status, embedding_status: 'allowed' },
    ],
  }, 'fixture:animal', { mediaResolver: resolve });

  assert.equal(model.media.length, 2);
  assert.deepEqual(model.media.map(({ presentation }) => presentation.kind), ['relay', 'relay']);
  assert.equal(model.media[1].presentation.src, `/atlas.fixture/media/${secondId}/profile`);
});
