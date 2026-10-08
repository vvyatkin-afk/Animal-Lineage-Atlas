import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadProfile = () => import('../packages/ui/profile-dialog.ts').catch(() => null);
const loadMessages = () => import('../packages/i18n/index.ts').catch(() => null);
const loadAtlasIndex = () => import('../packages/search/atlas-index.ts').catch(() => null);
const atlasUrl = new URL('../atlases/polar-bear/atlas.json', import.meta.url);

test('profile query loads the expected animal', async () => {
  const profile = await loadProfile();
  assert.ok(profile, 'profile module should load');
  const atlas = JSON.parse(await readFile(atlasUrl, 'utf8'));
  const animalId = profile.getProfileIdFromSearch('?animal=polar-bear:nora');
  assert.equal(profile.buildProfileModel(atlas, animalId).animal.name.canonical, 'Nora');
});

test('profile keeps approximate date precision visible', async () => {
  const profile = await loadProfile();
  assert.ok(profile, 'profile module should load');
  const label = profile.formatAtlasDate({ precision: 'approximate', value: '2010-06' }, 'en');
  assert.match(label, /about|approx\.?|~/i);
  assert.match(label, /2010-06/);
  const profileModel = profile.buildProfileModel({
    animals: [{ id: 'animal:dated', taxon: 'Test taxon', sex: 'unknown', status: 'unknown', name: { canonical: 'Dated animal' } }],
    relationships: [],
    events: [{ id: 'event:approx', animal_id: 'animal:dated', type: 'birth', date: { precision: 'approximate', value: '2010-06' }, source_ids: [] }],
    claims: [], media: [], sources: [],
  }, 'animal:dated');
  assert.match(profileModel.events[0].dateLabel, /about|approx\.?|~/i);
  assert.match(profileModel.events[0].dateLabel, /2010-06/);
});

test('image failure leaves profile details and the source link available', async () => {
  const profile = await loadProfile();
  assert.ok(profile, 'profile module should load');
  const model = profile.buildProfileModel({
    animals: [{ id: 'animal:test', taxon: 'Test taxon', name: { canonical: 'Test animal' } }],
    events: [], relationships: [], claims: [], sources: [],
    media: [{
      media_id: 'media:test', animal_id: 'animal:test',
      source_page_url: 'https://example.org/animal', direct_remote_url: 'https://example.org/animal.jpg',
      credit: null, rights_status: 'permission_granted', embedding_status: 'allowed', source_ids: [],
    }],
  }, 'animal:test', { remoteFailed: true });
  assert.equal(model.animal.name.canonical, 'Test animal');
  assert.equal(model.media[0].presentation.kind, 'placeholder');
  assert.equal(model.media[0].presentation.sourceUrl, 'https://example.org/animal');
});

test('profile model accepts the local archive resolver for an offline media item', async () => {
  const profile = await loadProfile();
  const media = await import('../packages/media/resolver.ts');
  assert.ok(profile, 'profile module should load');
  const manifest = JSON.parse(await readFile(new URL('../packages/media/fixtures/local-media-manifest.json', import.meta.url), 'utf8'));
  const resolveLocalMedia = media.createLocalResolver(manifest);
  const model = profile.buildProfileModel({
    animals: [{ id: 'animal:local', taxon: 'Test taxon', name: { canonical: 'Local animal' } }],
    events: [], relationships: [], claims: [], sources: [],
    media: [{
      media_id: 'media:fixture-swatch', animal_id: 'animal:local', source_page_url: 'https://example.org/source-record',
      rights_status: 'fixture_only', embedding_status: 'link_only', credit: null, source_ids: [],
    }],
  }, 'animal:local', { mediaResolver: resolveLocalMedia });
  assert.equal(model.media[0].presentation.kind, 'local');
  assert.equal(model.media[0].presentation.src, './local-media-swatch.svg');
});

test('profile transfer events show both sourced institution endpoints', async () => {
  const profile = await loadProfile();
  assert.ok(profile, 'profile module should load');
  const model = profile.buildProfileModel({
    animals: [{ id: 'animal:moved', taxon: 'Test taxon', name: { canonical: 'Moved animal' } }],
    relationships: [], claims: [], sources: [], media: [],
    institutions: [
      { id: 'institution:old', names: [{ value: 'Old Park' }] },
      { id: 'institution:new', names: [{ value: 'New Park' }] },
    ],
    events: [{
      id: 'event:moved', animal_id: 'animal:moved', type: 'transfer',
      date: { precision: 'exact', value: '2020-01-02' },
      from_institution_id: 'institution:old', to_institution_id: 'institution:new', source_ids: [],
    }],
  }, 'animal:moved');
  assert.equal(model.events[0].fromInstitution.names[0].value, 'Old Park');
  assert.equal(model.events[0].toInstitution.names[0].value, 'New Park');
});

test('animal search metadata includes historical transfer facilities', async () => {
  const indexModule = await loadAtlasIndex();
  assert.ok(indexModule, 'atlas search index helper should load');
  const search = await import('../packages/search/search.ts');
  const index = indexModule.buildAtlasSearchIndex({
    animals: [{ id: 'animal:moved', taxon: 'Test taxon', name: { canonical: 'Moved animal' } }],
    institutions: [
      { id: 'institution:old', names: [{ value: 'Old Park' }], country_code: 'RU' },
      { id: 'institution:new', names: [{ value: 'New Park' }], country_code: 'CN' },
    ],
    events: [{
      id: 'event:moved', animal_id: 'animal:moved', type: 'transfer',
      date: { precision: 'exact', value: '2020-01-02' },
      from_institution_id: 'institution:old', to_institution_id: 'institution:new',
    }],
  });
  assert.equal(search.searchAnimals(index, 'Old Park')[0].id, 'animal:moved');
  assert.equal(search.searchAnimals(index, '', { countryCode: 'CN' })[0].id, 'animal:moved');
  assert.equal(search.searchAnimals(index, '', { countryCode: 'RU' }).length, 0);
});

test('related profile navigation keeps focus and close dismisses the active profile', async () => {
  const app = await readFile(new URL('../apps/atlas/main.ts', import.meta.url), 'utf8');
  const profile = await readFile(new URL('../packages/ui/profile-dialog.ts', import.meta.url), 'utf8');
  const closeHandler = app.match(/function closeProfile\(\) \{([\s\S]*?)\n {2}\}/)?.[1] ?? '';
  assert.match(closeHandler, /setUrlProfile\(null, true\)/);
  assert.doesNotMatch(closeHandler, /history\.back\(\)/);
  assert.match(profile, /id="profile-title"[^>]*tabindex="-1"/i);
  assert.match(profile, /profileTitle\??\.focus\(/);
});

test('interface controls expose keyboard-operable semantics', async () => {
  const html = await readFile(new URL('../apps/atlas/index.html', import.meta.url), 'utf8');
  const graph = await readFile(new URL('../packages/ui/genealogy-view.ts', import.meta.url), 'utf8');
  assert.match(html, /<button\b[^>]*aria-label=/i);
  assert.match(html, /<dialog\b/i);
  assert.match(graph, /tabindex/i);
  assert.match(graph, /keydown/);
});

test('all interface locales render the same required label keys', async () => {
  const messages = await loadMessages();
  assert.ok(messages, 'shared messages module should load');
  const english = messages.getUiMessages('en');
  for (const locale of ['en', 'ja', 'ru']) {
    const translated = messages.getUiMessages(locale);
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(english).sort());
    assert.ok(translated.searchLabel.trim());
    assert.ok(translated.coverageLabel.trim());
    assert.ok(translated.closeProfileLabel.trim());
  }
  assert.notEqual(messages.getUiMessages('ja').searchLabel, english.searchLabel);
  assert.notEqual(messages.getUiMessages('ru').searchLabel, english.searchLabel);
  for (const key of ['graphHelpText', 'coverageMethod', 'familyHistoryLabel', 'siteFooterNote', 'catalogDescription']) {
    assert.notEqual(messages.getUiMessages('ja')[key], english[key], `${key} has a Japanese translation`);
    assert.notEqual(messages.getUiMessages('ru')[key], english[key], `${key} has a Russian translation`);
  }
  for (const template of ['../apps/atlas/index.html', '../apps/hub/index.html']) {
    const html = await readFile(new URL(template, import.meta.url), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-[\w-]+)?="([A-Za-z][A-Za-z0-9]+)"/g)].map((match) => match[1]);
    for (const key of keys) assert.ok(key in english, `${template} has a message for ${key}`);
  }
});

test('upstream direct photo URLs remain link-only metadata and cannot be embedded', async () => {
  const app = await readFile(new URL('../apps/atlas/main.ts', import.meta.url), 'utf8');
  const graph = await readFile(new URL('../packages/ui/genealogy-view.ts', import.meta.url), 'utf8');
  const atlas = JSON.parse(await readFile(new URL('../atlases/red-panda/atlas.json', import.meta.url), 'utf8'));
  const source = `${app}\n${graph}`;
  assert.doesNotMatch(source, /data:image\/(?:jpeg|png|webp)/i);
  const directMetadata = atlas.media.filter((item) => item.direct_remote_url);
  assert.ok(directMetadata.length > 0);
  assert.equal(directMetadata.every((item) => item.embedding_status === 'link_only' && item.rights_status === 'unknown'), true);
  assert.equal(directMetadata.some((item) => item.embedding_status === 'allowed'), false);
});
