import assert from 'node:assert/strict';
import test from 'node:test';

const loadGenealogy = () => import('../packages/genealogy/layout.ts').catch(() => null);
const loadState = () => import('../packages/genealogy/state.ts').catch(() => null);

const animal = (id, countryCode = 'JP') => ({
  id,
  taxon: 'Ailurus fulgens',
  name: { canonical: id, language: 'en' },
  country_code: countryCode,
});

const relation = (id, subject, object, status = 'confirmed', type = 'biological_mother') => ({
  id,
  subject,
  object,
  type,
  status,
  source_ids: ['source:test'],
});

test('simple family has parent-child edges', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('parent'), animal('child')],
    [relation('edge:parent-child', 'parent', 'child')],
    'child',
  );
  assert.deepEqual(graph.edges.map(({ from, to }) => [from, to]), [['parent', 'child']]);
  assert.deepEqual(new Set(graph.nodes.map((node) => node.id)), new Set(['parent', 'child']));
});

test('multi-generation family receives generation rows', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('grandparent'), animal('parent'), animal('focus'), animal('child')],
    [
      relation('edge:g-p', 'grandparent', 'parent'),
      relation('edge:p-f', 'parent', 'focus'),
      relation('edge:f-c', 'focus', 'child'),
    ],
    'focus',
    { depth: 2 },
  );
  assert.deepEqual(graph.generationRows.map((row) => row.generation), [-2, -1, 0, 1]);
  assert.equal(graph.nodes.find((node) => node.id === 'focus').generation, 0);
});

test('independent unknown parents create no nodes', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy([animal('child')], [], 'child');
  assert.deepEqual(graph.nodes.map((node) => node.id), ['child']);
  assert.equal(graph.nodes.some((node) => /unknown|placeholder/i.test(node.id)), false);
});

test('convergent ancestor has one node', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('shared'), animal('parent-a'), animal('parent-b'), animal('focus')],
    [
      relation('edge:shared-a', 'shared', 'parent-a'),
      relation('edge:shared-b', 'shared', 'parent-b'),
      relation('edge:a-focus', 'parent-a', 'focus'),
      relation('edge:b-focus', 'parent-b', 'focus', 'probable', 'biological_father'),
    ],
    'focus',
    { depth: 2 },
  );
  assert.equal(graph.nodes.filter((node) => node.id === 'shared').length, 1);
  assert.equal(graph.nodes.length, 4);
});

test('probable edge style is distinct in the graph model', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('parent'), animal('child')],
    [relation('edge:probable', 'parent', 'child', 'probable')],
    'child',
  );
  assert.equal(graph.edges[0].status, 'probable');
  assert.equal(graph.edges[0].type, 'biological_mother');
});

test('country change does not split family', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('parent', 'JP'), animal('child', 'US')],
    [relation('edge:country', 'parent', 'child')],
    'child',
  );
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.nodes.find((node) => node.id === 'parent').countryCode, 'JP');
  assert.equal(graph.nodes.find((node) => node.id === 'child').countryCode, 'US');
});

test('node limit reports truncation and keeps focus', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('parent'), animal('focus'), animal('child')],
    [relation('edge:parent', 'parent', 'focus'), relation('edge:child', 'focus', 'child')],
    'focus',
    { maxNodes: 2 },
  );
  assert.equal(graph.truncated, true);
  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.nodes.some((node) => node.id === 'focus'), true);
});

test('profile close restores tree state', async () => {
  const stateModule = await loadState();
  assert.ok(stateModule, 'genealogy state package should load');
  const state = stateModule.createViewState({
    focusId: 'futa',
    filters: { country: 'JP' },
    zoom: 1.4,
    pan: { x: 12, y: -9 },
    selectedGroup: 'branch:fuka',
  });
  state.openProfile('animal:fuka');
  assert.equal(state.get().activeProfileId, 'animal:fuka');
  state.closeProfile();
  assert.deepEqual(state.get(), {
    focusId: 'futa',
    filters: { country: 'JP' },
    zoom: 1.4,
    pan: { x: 12, y: -9 },
    selectedGroup: 'branch:fuka',
    activeProfileId: null,
  });
});
