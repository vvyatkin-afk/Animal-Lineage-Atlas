import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('social partner links do not create ancestry generations', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('focus'), animal('partner'), animal('partner-child')],
    [
      relation('edge:partner', 'focus', 'partner', 'confirmed', 'social'),
      relation('edge:partner-child', 'partner', 'partner-child'),
    ],
    'focus',
  );
  assert.deepEqual(graph.nodes.map((node) => node.id), ['focus']);
  assert.deepEqual(graph.generationRows.map((row) => row.generation), [0]);
  assert.deepEqual(graph.edges, []);
});

test('social link remains visible when both animals enter through ancestry', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const graph = genealogy.buildGenealogy(
    [animal('focus'), animal('child-a'), animal('child-b')],
    [
      relation('edge:focus-a', 'focus', 'child-a'),
      relation('edge:focus-b', 'focus', 'child-b'),
      relation('edge:social', 'child-a', 'child-b', 'confirmed', 'social'),
    ],
    'focus',
  );
  assert.equal(graph.nodes.find((node) => node.id === 'child-a')?.generation, 1);
  assert.equal(graph.nodes.find((node) => node.id === 'child-b')?.generation, 1);
  assert.equal(graph.edges.find((edge) => edge.id === 'edge:social')?.type, 'social');
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

test('prebuilt genealogy index keeps disconnected components available for focused graph lookup', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const animals = [animal('parent-a'), animal('child-a'), animal('parent-b'), animal('child-b'), animal('island')];
  const relationships = [relation('edge:a', 'parent-a', 'child-a'), relation('edge:b', 'parent-b', 'child-b')];
  const index = genealogy.createGenealogyIndex(animals, relationships);

  assert.deepEqual(index.components.map((component) => component.animalIds.length), [2, 2, 1]);
  assert.deepEqual(
    genealogy.buildFocusedGenealogy(index, 'child-b').nodes.map((node) => node.id),
    ['parent-b', 'child-b'],
  );
  assert.equal(genealogy.buildFocusedGenealogy(index, 'island').nodes[0].id, 'island');
});

test('global genealogy aligns every disconnected family on component-local generation rows and preserves exact edges', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const animals = [
    { ...animal('grandparent', 'JP'), sex: 'female', status: 'deceased' },
    animal('parent-a', 'US'),
    animal('parent-b', 'CA'),
    animal('focus', 'JP'),
    animal('descendant', 'FR'),
    animal('social-partner', 'DE'),
    animal('island-parent', 'GB'),
    animal('island-child', 'JP'),
    animal('unknown-family-member', 'US'),
  ];
  const relationships = [
    relation('edge:g-a', 'grandparent', 'parent-a'),
    relation('edge:g-b', 'grandparent', 'parent-b', 'confirmed', 'biological_father'),
    relation('edge:a-focus', 'parent-a', 'focus'),
    relation('edge:b-focus', 'parent-b', 'focus', 'probable', 'biological_father'),
    relation('edge:focus-child', 'focus', 'descendant'),
    relation('edge:social', 'focus', 'social-partner', 'disputed', 'social'),
    relation('edge:island', 'island-parent', 'island-child'),
  ];
  const index = genealogy.createGenealogyIndex(animals, relationships);
  const graph = genealogy.buildGlobalGenealogy(index, { grouping: 'family' });
  const generationById = new Map(graph.nodes.map((node) => [node.id, node.generation]));

  assert.equal(graph.nodes.length, animals.length);
  assert.equal(graph.edges.length, relationships.length);
  assert.deepEqual(new Set(graph.edges.map((edge) => edge.id)), new Set(relationships.map((edge) => edge.id)));
  assert.deepEqual(graph.generationRows.map((row) => row.generation), [0, 1, 2, 3]);
  assert.deepEqual(
    ['grandparent', 'island-parent', 'unknown-family-member', 'social-partner'].map((id) => generationById.get(id)),
    [0, 0, 0, 0],
    'each unrelated component starts at its own oldest-known generation',
  );
  assert.equal(generationById.get('focus'), 2, 'a shared ancestor is assigned once at its longest known path');
  assert.equal(generationById.get('descendant'), 3);
  assert.equal(graph.nodes.find((node) => node.id === 'grandparent')?.sex, 'female');
  assert.equal(graph.nodes.find((node) => node.id === 'grandparent')?.lifeStatus, 'deceased');
  assert.equal(graph.edges.find((edge) => edge.id === 'edge:b-focus')?.status, 'probable');
  assert.equal(graph.edges.find((edge) => edge.id === 'edge:social')?.type, 'social');
  assert.equal(generationById.get('social-partner'), 0, 'social relations do not invent ancestry generations');
  for (const edge of graph.edges.filter((candidate) => candidate.type !== 'social')) {
    assert.ok(generationById.get(edge.to) > generationById.get(edge.from), `${edge.id} must advance to a later generation`);
  }

  const family = graph.nodes.filter((node) => ['grandparent', 'parent-a', 'parent-b', 'focus', 'descendant'].includes(node.id));
  assert.equal(new Set(family.map((node) => node.componentId)).size, 1, 'family grouping spans countries without splitting the lineage');
});

test('country grouping keeps country blocks within each original generation row', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const animals = [animal('a-jp', 'JP'), animal('b-us', 'US'), animal('c-jp', 'JP'), animal('d-fr', 'FR')];
  const relationships = [
    relation('edge:a-b', 'a-jp', 'b-us'),
    relation('edge:a-c', 'a-jp', 'c-jp'),
    relation('edge:c-d', 'c-jp', 'd-fr'),
  ];
  const index = genealogy.createGenealogyIndex(animals, relationships);
  const familyGraph = genealogy.buildGlobalGenealogy(index, { grouping: 'family' });
  const countryGraph = genealogy.buildGlobalGenealogy(index, { grouping: 'country' });
  assert.deepEqual(
    new Map(countryGraph.nodes.map((node) => [node.id, node.generation])),
    new Map(familyGraph.nodes.map((node) => [node.id, node.generation])),
    'country mode preserves each animal generation assignment',
  );
  for (const row of countryGraph.generationRows) {
    const rowNodes = row.animalIds.map((id) => countryGraph.nodes.find((node) => node.id === id));
    const countryOrder = rowNodes.map((node) => node?.countryCode ?? 'ZZ');
    assert.deepEqual(countryOrder, [...countryOrder].sort(), `generation ${row.generation} groups country codes together`);
  }
  assert.equal(countryGraph.grouping, 'country');
});

test('global generation rows retain multiple partner branches and shared ancestors across countries', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const animals = [
    animal('grandparent', 'JP'), animal('parent', 'US'),
    animal('partner-a', 'CA'), animal('partner-b', 'FR'),
    animal('child-a', 'DE'), animal('child-b', 'GB'),
    animal('partner-c', 'BR'), animal('partner-d', 'JP'),
    animal('grandchild-a', 'US'), animal('grandchild-b', 'CA'),
  ];
  const relationships = [
    relation('edge:grandparent-parent', 'grandparent', 'parent'),
    relation('edge:parent-child-a', 'parent', 'child-a'),
    relation('edge:partner-a-child-a', 'partner-a', 'child-a', 'confirmed', 'biological_father'),
    relation('edge:parent-child-b', 'parent', 'child-b'),
    relation('edge:partner-b-child-b', 'partner-b', 'child-b', 'confirmed', 'biological_father'),
    relation('edge:parent-partner-a', 'parent', 'partner-a', 'confirmed', 'social'),
    relation('edge:parent-partner-b', 'parent', 'partner-b', 'probable', 'social'),
    relation('edge:child-a-grandchild', 'child-a', 'grandchild-a'),
    relation('edge:partner-c-grandchild', 'partner-c', 'grandchild-a', 'confirmed', 'biological_father'),
    relation('edge:child-b-grandchild', 'child-b', 'grandchild-b'),
    relation('edge:partner-d-grandchild', 'partner-d', 'grandchild-b', 'confirmed', 'biological_father'),
  ];
  const graph = genealogy.buildGlobalGenealogy(genealogy.createGenealogyIndex(animals, relationships));
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  assert.equal(graph.nodes.length, animals.length);
  assert.equal(graph.edges.length, relationships.length);
  assert.deepEqual(new Set(graph.edges.map((edge) => edge.id)), new Set(relationships.map((edge) => edge.id)));
  assert.equal(new Set(graph.nodes.map((node) => node.componentId)).size, 1, 'all pedigree branches stay one cross-country family');
  for (const edge of graph.edges.filter((candidate) => candidate.type !== 'social')) {
    const parent = nodeById.get(edge.from);
    const child = nodeById.get(edge.to);
    assert.ok(parent && child && child.generation > parent.generation, `${edge.id} keeps the canonical parent direction`);
  }
  assert.equal(graph.edges.find((edge) => edge.id === 'edge:parent-partner-a')?.type, 'social');
  assert.equal(graph.edges.find((edge) => edge.id === 'edge:parent-partner-b')?.status, 'probable');
  assert.equal(nodeById.get('grandchild-a')?.generation, 3);
  assert.equal(nodeById.get('grandchild-b')?.generation, 3);
});

test('global layout is deterministic regardless of input order', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const animals = [animal('a'), animal('b'), animal('c'), animal('d'), animal('island')];
  const relationships = [relation('r1', 'a', 'b'), relation('r2', 'b', 'c'), relation('r3', 'a', 'd')];
  const first = genealogy.buildGlobalGenealogy(genealogy.createGenealogyIndex(animals, relationships));
  const second = genealogy.buildGlobalGenealogy(genealogy.createGenealogyIndex([...animals].reverse(), [...relationships].reverse()));
  const geometry = (graph) => graph.nodes.map(({ id, generation, x, y, componentId }) => ({ id, generation, x, y, componentId }));
  assert.deepEqual(geometry(first), geometry(second));
  assert.deepEqual(first.edges.map((edge) => edge.id), second.edges.map((edge) => edge.id));
});

test('focus all-depth includes the complete known parent and descendant lineage without a node cap', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const animals = ['great-grandparent', 'grandparent', 'parent', 'focus', 'child', 'grandchild', 'island']
    .map((id) => animal(id));
  const relationships = [
    relation('r1', 'great-grandparent', 'grandparent'),
    relation('r2', 'grandparent', 'parent'),
    relation('r3', 'parent', 'focus'),
    relation('r4', 'focus', 'child'),
    relation('r5', 'child', 'grandchild'),
  ];
  const graph = genealogy.buildFocusedGenealogy(
    genealogy.createGenealogyIndex(animals, relationships),
    'focus',
    { depth: 'all' },
  );
  assert.equal(graph.nodes.length, 6);
  assert.equal(graph.edges.length, 5);
  assert.equal(graph.truncated, false);
  assert.deepEqual(graph.generationRows.map((row) => row.generation), [-3, -2, -1, 0, 1, 2]);
});

test('global graph includes all 1554 red pandas and all 2394 canonical relationships within the layout budget', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const atlas = JSON.parse(readFileSync(new URL('../atlases/red-panda/atlas.json', import.meta.url), 'utf8'));
  const animals = atlas.animals.map((record) => ({
    id: record.id,
    name: record.name,
    country_code: record.country_code ?? null,
    sex: record.sex ?? null,
    status: record.status ?? null,
  }));
  const index = genealogy.createGenealogyIndex(animals, atlas.relationships);
  const started = performance.now();
  const graph = genealogy.buildGlobalGenealogy(index);
  const elapsed = performance.now() - started;
  assert.equal(graph.nodes.length, 1554);
  assert.equal(graph.edges.length, 2394);
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, 1554);
  assert.equal(new Set(graph.edges.map((edge) => edge.id)).size, 2394);
  assert.equal(graph.truncated, false);
  assert.ok(elapsed < 2000, `1,554-node global layout took ${elapsed.toFixed(1)} ms`);
});

test('Futa all-generation focus preserves the exact canonical family IDs and relationships', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const atlas = JSON.parse(readFileSync(new URL('../atlases/red-panda/atlas.json', import.meta.url), 'utf8'));
  const index = genealogy.createGenealogyIndex(atlas.animals, atlas.relationships);
  const focusId = 'red-panda:futa';
  assert.ok(index.animalById.has(focusId), 'canonical Futa ID remains present');
  const expectedFamilyIds = new Set(index.familyComponentByAnimal.get(focusId)?.animalIds ?? []);
  const globalGraph = genealogy.buildGlobalGenealogy(index);
  assert.deepEqual(new Set(globalGraph.nodes.filter((node) => expectedFamilyIds.has(node.id)).map((node) => node.id)), expectedFamilyIds);
  const expectedGlobalEdges = atlas.relationships.filter((edge) =>
    expectedFamilyIds.has(edge.subject) && expectedFamilyIds.has(edge.object));
  assert.deepEqual(
    new Set(globalGraph.edges.filter((edge) => expectedFamilyIds.has(edge.from) && expectedFamilyIds.has(edge.to)).map((edge) => edge.id)),
    new Set(expectedGlobalEdges.map((edge) => edge.id)),
  );
  const expectedIds = new Set([focusId]);
  const ancestors = [focusId];
  for (let cursor = 0; cursor < ancestors.length; cursor += 1) {
    for (const relationship of index.parentRelationsByChild.get(ancestors[cursor]) ?? []) {
      if (expectedIds.has(relationship.subject)) continue;
      expectedIds.add(relationship.subject);
      ancestors.push(relationship.subject);
    }
  }
  const descendants = [focusId];
  for (let cursor = 0; cursor < descendants.length; cursor += 1) {
    for (const relationship of index.childRelationsByParent.get(descendants[cursor]) ?? []) {
      if (expectedIds.has(relationship.object)) continue;
      expectedIds.add(relationship.object);
      descendants.push(relationship.object);
    }
  }
  const expectedRelationships = atlas.relationships.filter((edge) =>
    expectedIds.has(edge.subject) && expectedIds.has(edge.object));
  const graph = genealogy.buildFocusedGenealogy(index, focusId, { depth: 'all' });
  assert.deepEqual(new Set(graph.nodes.map((node) => node.id)), expectedIds);
  assert.deepEqual(new Set(graph.edges.map((edge) => edge.id)), new Set(expectedRelationships.map((edge) => edge.id)));
  assert.equal(graph.truncated, false);
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
    grouping: 'country',
    focusDepth: 'all',
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
    grouping: 'country',
    focusDepth: 'all',
    activeProfileId: null,
  });
});
