import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const localManifestUrl = new URL('../packages/media/fixtures/local-media-manifest.json', import.meta.url);
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
