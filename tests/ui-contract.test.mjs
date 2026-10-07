import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const loadProfile = () => import('../packages/ui/profile-dialog.ts').catch(() => null);
const loadMessages = () => import('../packages/i18n/index.ts').catch(() => null);
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
});

test('profile and graph source contain no embedded or local animal photos', async () => {
  const app = await readFile(new URL('../apps/atlas/main.ts', import.meta.url), 'utf8');
  const graph = await readFile(new URL('../packages/ui/genealogy-view.ts', import.meta.url), 'utf8');
  const atlas = JSON.parse(await readFile(atlasUrl, 'utf8'));
  const source = `${app}\n${graph}`;
  assert.doesNotMatch(source, /data:image\/(?:jpeg|png|webp)/i);
  assert.equal(atlas.media.some((item) => item.direct_remote_url && /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(item.direct_remote_url)), false);
});
