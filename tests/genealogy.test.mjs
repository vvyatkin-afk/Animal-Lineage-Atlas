import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const loadGenealogy = () => import('../packages/genealogy/layout.ts').catch(() => null);
const loadState = () => import('../packages/genealogy/state.ts').catch(() => null);
const loadLayoutMetrics = () => import('../packages/genealogy/metrics.ts').catch(() => null);
const loadEdgeRoutes = () => import('../packages/genealogy/edge-route.ts').catch(() => null);
const loadLayoutOptimizer = () => import('../packages/genealogy/optimizer.ts').catch(() => null);

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

const metricNode = (id, x, y, generation, sex = null) => ({
  id,
  name: id,
  generation,
  x,
  y,
  countryCode: null,
  sex,
  lifeStatus: null,
  photoConfirmed: false,
  photoUrl: null,
  photoSourceUrl: null,
  birthDateLabel: null,
  deathDateLabel: null,
  institutionLabel: null,
  componentId: 'fixture',
});

const metricEdge = (id, from, to, type = 'biological_mother', status = 'confirmed') => ({
  id,
  from,
  to,
  type,
  status,
  sourceIds: ['source:test'],
});

function metricGraph(nodes, edges) {
  const rows = new Map();
  for (const node of nodes) {
    const ids = rows.get(node.generation) ?? [];
    ids.push(node.id);
    rows.set(node.generation, ids);
  }
  return {
    nodes,
    edges,
    generationRows: [...rows.entries()]
      .sort(([left], [right]) => left - right)
      .map(([generation, animalIds]) => ({ generation, animalIds })),
    truncated: false,
  };
}

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

test('family tile keyboard selection starts at the first tile and wraps at both ends', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  assert.equal(genealogy.advanceFamilyTileIndex(-1, 1, 4), 0);
  assert.equal(genealogy.advanceFamilyTileIndex(-1, -1, 4), 3);
  assert.equal(genealogy.advanceFamilyTileIndex(0, -1, 4), 3);
  assert.equal(genealogy.advanceFamilyTileIndex(3, 1, 4), 0);
  assert.equal(genealogy.advanceFamilyTileIndex(-1, 1, 0), -1);
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

test('relationship edge style keeps type color independent from confidence pattern', async () => {
  const styling = await import('../packages/genealogy/edge-style.ts');
  const types = ['biological_mother', 'biological_father', 'foster', 'adoptive', 'social'];
  const statuses = ['confirmed', 'probable', 'disputed', 'unknown'];
  const expectedColors = {
    biological_mother: '#9b6f55',
    biological_father: '#53768a',
    foster: '#7c6695',
    adoptive: '#7c6695',
    social: '#87978d',
  };
  const expectedDashes = {
    confirmed: [],
    probable: [5, 4],
    disputed: [8, 4],
    unknown: [2, 4],
  };
  const combinationFixture = types.flatMap((type) => statuses.map((status) => ({ type, status })));

  assert.equal(combinationFixture.length, 20);
  for (const { type, status } of combinationFixture) {
    assert.deepEqual(styling.relationshipEdgeStyle(type, status), {
      stroke: expectedColors[type],
      dashArray: expectedDashes[status],
    }, `${type} / ${status}`);
  }
  assert.deepEqual(styling.relationshipEdgeStyle('biological_mother', 'probable', 2).dashArray, [10, 8]);
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

test('country grouping remains an explicit view preference while preserving generation assignments', async () => {
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

test('global family layout packs relationship components in two dimensions without overlaps', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const animals = [];
  const relationships = [];
  for (let family = 0; family < 18; family += 1) {
    const parent = `family-${family}-parent`;
    const child = `family-${family}-child`;
    animals.push(animal(parent), animal(child));
    relationships.push(relation(`family-${family}-edge`, parent, child));
  }
  const graph = genealogy.buildGlobalGenealogy(genealogy.createGenealogyIndex(animals, relationships));
  const tiles = graph.familyTiles;
  assert.ok(tiles, 'global family layout exposes summary geometry for each packed component');
  assert.equal(tiles.length, 18);
  assert.deepEqual(new Set(graph.nodes.map((node) => node.id)), new Set(animals.map((item) => item.id)));
  assert.deepEqual(new Set(graph.edges.map((edge) => edge.id)), new Set(relationships.map((item) => item.id)));
  assert.ok(new Set(tiles.map((tile) => tile.bounds.top)).size > 1, 'components occupy multiple tile rows');
  for (let leftIndex = 0; leftIndex < tiles.length; leftIndex += 1) {
    const left = tiles[leftIndex];
    assert.ok(left);
    for (let rightIndex = leftIndex + 1; rightIndex < tiles.length; rightIndex += 1) {
      const right = tiles[rightIndex];
      assert.ok(right);
      const overlaps = left.bounds.left < right.bounds.right && left.bounds.right > right.bounds.left
        && left.bounds.top < right.bounds.bottom && left.bounds.bottom > right.bounds.top;
      assert.equal(overlaps, false, `${left.id} must not overlap ${right.id}`);
    }
  }
});

test('family overview carries only authorized photo previews from identified nodes', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const parent = {
    ...animal('parent'),
    photo_confirmed: true,
    photo_url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Parent.jpg/330px-Parent.jpg',
    photo_fallback_url: '/atlas.red-panda/media/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/thumb',
    photo_credit: 'Named photographer',
    photo_license: 'CC BY 4.0',
  };
  const isolated = animal('isolated');
  const graph = genealogy.buildGlobalGenealogy(genealogy.createGenealogyIndex(
    [parent, animal('child'), isolated],
    [relation('parent-child', 'parent', 'child')],
  ));
  const familyTile = graph.familyTiles.find((tile) => tile.id === 'child');
  assert.ok(familyTile);
  assert.equal(familyTile.previewAnimalName, 'parent');
  assert.equal(familyTile.previewPhotoUrl, parent.photo_url);
  assert.equal(familyTile.previewCredit, 'Named photographer');
  assert.equal(familyTile.previewLicense, 'CC BY 4.0');
  const isolatedTile = graph.familyTiles.find((tile) => tile.id === 'isolated');
  assert.ok(isolatedTile);
  assert.equal(isolatedTile.previewPhotoUrl, undefined);
});

test('family summary map fits portrait and landscape viewports without overlaps', async () => {
  const genealogy = await loadGenealogy();
  assert.ok(genealogy, 'genealogy layout package should load');
  const tiles = Array.from({ length: 80 }, (_, index) => ({
    id: `component-${index}`,
    animalCount: index === 0 ? 823 : index === 1 ? 356 : 1 + (index % 9),
  }));
  assert.equal(typeof genealogy.layoutFamilyOverview, 'function', 'global summaries need a viewport-shaped packing layout');

  for (const aspectRatio of [0.7, 1.8]) {
    const layout = genealogy.layoutFamilyOverview(tiles, aspectRatio);
    assert.equal(layout.tileBounds.length, tiles.length);
    const width = layout.bounds.right - layout.bounds.left;
    const height = layout.bounds.bottom - layout.bounds.top;
    const actualAspectRatio = width / height;
    assert.ok(actualAspectRatio > aspectRatio * 0.55 && actualAspectRatio < aspectRatio * 1.8,
      `${actualAspectRatio.toFixed(2)} should use the ${aspectRatio.toFixed(2)} viewport shape`);
    for (let leftIndex = 0; leftIndex < layout.tileBounds.length; leftIndex += 1) {
      const left = layout.tileBounds[leftIndex];
      assert.ok(left);
      for (let rightIndex = leftIndex + 1; rightIndex < layout.tileBounds.length; rightIndex += 1) {
        const right = layout.tileBounds[rightIndex];
        assert.ok(right);
        const overlaps = left.bounds.left < right.bounds.right && left.bounds.right > right.bounds.left
          && left.bounds.top < right.bounds.bottom && left.bounds.bottom > right.bounds.top;
        assert.equal(overlaps, false, `${left.id} must not overlap ${right.id}`);
      }
    }
  }
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

test('global graph includes all 1555 red pandas and all 2394 canonical relationships within the layout budget', async () => {
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
  assert.equal(graph.nodes.length, 1555);
  assert.equal(graph.edges.length, 2394);
  assert.equal(new Set(graph.nodes.map((node) => node.id)).size, 1555);
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

test('shared route geometry matches global and focused renderer paths', async () => {
  const routes = await loadEdgeRoutes();
  assert.ok(routes, 'shared genealogy edge routes should load');
  const nodes = new Map([
    ['parent', metricNode('parent', 0, 0, -1)],
    ['child', metricNode('child', 100, 220, 0)],
  ]);
  const parentEdge = metricEdge('parent-child', 'parent', 'child');
  const globalRoute = routes.routeGenealogyEdge(parentEdge, nodes, 'global');
  assert.equal(globalRoute.pathType, 'cubic');
  assert.deepEqual(globalRoute.start, { x: 0, y: 37 });
  assert.deepEqual(globalRoute.control1, { x: 0, y: 110 });
  assert.deepEqual(globalRoute.control2, { x: 100, y: 110 });
  assert.deepEqual(globalRoute.end, { x: 100, y: 183 });

  const socialEdge = metricEdge('social', 'parent', 'child', 'social');
  const focusedSocialRoute = routes.routeGenealogyEdge(socialEdge, nodes, 'focused');
  const globalSocialRoute = routes.routeGenealogyEdge(socialEdge, nodes, 'global');
  assert.equal(focusedSocialRoute.pathType, 'line');
  assert.equal(globalSocialRoute.pathType, 'cubic');
  assert.ok(globalSocialRoute.length > Math.hypot(100, 220));
});

test('layout metrics count real curve crossings, exclude shared endpoints, and include dashed edges', async () => {
  const metricsModule = await loadLayoutMetrics();
  assert.ok(metricsModule, 'genealogy layout metrics should load');
  const crossingGraph = metricGraph([
    metricNode('left-parent', -80, 0, -1),
    metricNode('right-parent', 80, 0, -1),
    metricNode('left-child', -80, 220, 0),
    metricNode('right-child', 80, 220, 0),
  ], [
    metricEdge('left-to-right', 'left-parent', 'right-child', 'biological_mother', 'probable'),
    metricEdge('right-to-left', 'right-parent', 'left-child', 'biological_father', 'disputed'),
  ]);
  const crossings = metricsModule.measureGenealogyGraph(crossingGraph, 'global');
  assert.equal(crossings.crossingPairs, 1);
  assert.equal(crossings.edgeCount, 2);
  assert.ok(crossings.totalRouteLength > 400);

  const sharedEndpointGraph = metricGraph([
    metricNode('parent', 0, 0, -1),
    metricNode('child-left', -80, 220, 0),
    metricNode('child-right', 80, 220, 0),
  ], [
    metricEdge('parent-to-left', 'parent', 'child-left'),
    metricEdge('parent-to-right', 'parent', 'child-right'),
  ]);
  assert.equal(metricsModule.measureGenealogyGraph(sharedEndpointGraph, 'global').crossingPairs, 0);
});

test('rendered crossing metrics count separated route pairs exactly once across spatial regions', async () => {
  const metricsModule = await loadLayoutMetrics();
  assert.ok(metricsModule, 'genealogy layout metrics should load');
  const nodes = [];
  const edges = [];
  const pairs = 96;
  for (let index = 0; index < pairs; index += 1) {
    const center = index * 1000;
    nodes.push(
      metricNode(`pair-${index}-left-parent`, center - 80, 0, -1),
      metricNode(`pair-${index}-right-parent`, center + 80, 0, -1),
      metricNode(`pair-${index}-left-child`, center - 80, 220, 0),
      metricNode(`pair-${index}-right-child`, center + 80, 220, 0),
    );
    edges.push(
      metricEdge(`pair-${index}-left-to-right`, `pair-${index}-left-parent`, `pair-${index}-right-child`, 'biological_mother', 'probable'),
      metricEdge(`pair-${index}-right-to-left`, `pair-${index}-right-parent`, `pair-${index}-left-child`, 'biological_father', 'disputed'),
    );
  }
  assert.equal(metricsModule.countGenealogyRouteCrossings(metricGraph(nodes, edges), 'global'), pairs);
});

test('layout metrics report overlapping nodes, edge-card collisions, row violations, and focused parent-side violations', async () => {
  const metricsModule = await loadLayoutMetrics();
  assert.ok(metricsModule, 'genealogy layout metrics should load');
  const graph = metricGraph([
    metricNode('mother', 100, -200, -1, 'female'),
    metricNode('father', -100, -200, -1, 'male'),
    metricNode('child', 0, 0, 0),
    metricNode('middle', 0, -100, -1),
    metricNode('overlap-a', 300, 0, 0),
    metricNode('overlap-b', 400, 0, 0),
  ], [
    metricEdge('mother-child', 'mother', 'child', 'biological_mother'),
    metricEdge('father-child', 'father', 'child', 'biological_father'),
    metricEdge('skip-generation', 'mother', 'middle', 'biological_father'),
  ]);
  const focused = metricsModule.measureGenealogyGraph(graph, 'focused');
  assert.equal(focused.nodeOverlapPairs, 1);
  assert.ok(focused.edgeNodeCollisionPairs >= 1);
  assert.equal(focused.generationOrderViolations, 1);
  assert.equal(focused.parentOrderViolations, 1);
  assert.equal(metricsModule.measureGenealogyGraph(graph, 'global').parentOrderViolations, 0);
});

test('layout optimizer removes a feasible crossing without changing rows, nodes, or edges', async () => {
  const optimizer = await loadLayoutOptimizer();
  const metricsModule = await loadLayoutMetrics();
  assert.ok(optimizer, 'generation-row optimizer should load');
  assert.ok(metricsModule, 'layout metrics should load');
  const nodes = [
    metricNode('parent-a', -100, -160, -1),
    metricNode('parent-b', 100, -160, -1),
    metricNode('child-a', 100, 0, 0),
    metricNode('child-b', -100, 0, 0),
  ];
  const edges = [
    metricEdge('edge:a-a', 'parent-a', 'child-a'),
    metricEdge('edge:b-b', 'parent-b', 'child-b'),
  ];
  const rows = [
    { generation: -1, animalIds: ['parent-a', 'parent-b'] },
    { generation: 0, animalIds: ['child-a', 'child-b'] },
  ];
  const originalEdges = edges.map((edge) => ({ ...edge, sourceIds: [...edge.sourceIds] }));
  const result = optimizer.optimizeGenerationRows(rows, edges, new Map(nodes.map((node) => [node.id, node])), 'focused');
  assert.deepEqual(result.generationRows.map((row) => row.generation), [-1, 0]);
  assert.deepEqual(result.generationRows.flatMap((row) => row.animalIds).sort(), ['child-a', 'child-b', 'parent-a', 'parent-b']);
  assert.deepEqual(result.nodes.map((node) => node.id).sort(), nodes.map((node) => node.id).sort());
  assert.deepEqual(edges, originalEdges);
  assert.equal(metricsModule.measureGenealogyGraph({ nodes: result.nodes, edges, generationRows: result.generationRows, truncated: false }, 'focused').crossingPairs, 0);
});

test('large-graph optimizer detects and removes crossings between edges with different generation spans', async () => {
  const optimizer = await loadLayoutOptimizer();
  const metricsModule = await loadLayoutMetrics();
  assert.ok(optimizer, 'generation-row optimizer should load');
  assert.ok(metricsModule, 'layout metrics should load');
  const rows = [
    { generation: 0, animalIds: ['a'] },
    { generation: 1, animalIds: ['other-1', 'b'] },
    { generation: 2, animalIds: ['other-2', 'd'] },
    { generation: 3, animalIds: ['c'] },
    { generation: 10, animalIds: Array.from({ length: 501 }, (_, index) => `isolated-${index}`) },
  ];
  const nodes = rows.flatMap((row) => row.animalIds.map((id, index) => metricNode(
    id,
    (index - (row.animalIds.length - 1) / 2) * 200,
    row.generation * 200,
    row.generation,
  )));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = [metricEdge('long-edge', 'a', 'd'), metricEdge('offset-edge', 'b', 'c')];
  const options = { maxSweeps: 0, maxExactCandidates: 0, maxSwapEvaluations: 0 };
  const initial = optimizer.optimizeGenerationRows(rows, edges, nodesById, 'global', options);
  const crossings = (result) => metricsModule.countGenealogyRouteCrossings({
    nodes: result.nodes,
    edges,
    generationRows: result.generationRows,
    truncated: false,
  }, 'global');
  assert.equal(crossings(initial), 1, 'the fixture has one rendered crossing across overlapping, unequal edge spans');

  const optimized = optimizer.optimizeGenerationRows(rows, edges, nodesById, 'global', {
    ...options,
    maxSwapEvaluations: 1,
  });
  assert.equal(crossings(optimized), 0, 'the span-aware candidate score accepts the crossing-free adjacent swap');
});

test('default large-global optimization evaluates rendered crossings and improves the row order', async () => {
  const optimizer = await loadLayoutOptimizer();
  const metricsModule = await loadLayoutMetrics();
  assert.ok(optimizer, 'generation-row optimizer should load');
  assert.ok(metricsModule, 'layout metrics should load');
  const rows = [
    { generation: 0, animalIds: ['a'] },
    { generation: 1, animalIds: ['other-1', 'b'] },
    { generation: 2, animalIds: ['other-2', 'd'] },
    { generation: 3, animalIds: ['c'] },
    { generation: 10, animalIds: Array.from({ length: 501 }, (_, index) => `isolated-${index}`) },
  ];
  const nodes = rows.flatMap((row) => row.animalIds.map((id, index) => metricNode(
    id,
    (index - (row.animalIds.length - 1) / 2) * 200,
    row.generation * 200,
    row.generation,
  )));
  const edges = [metricEdge('long-edge', 'a', 'd'), metricEdge('offset-edge', 'b', 'c')];
  const result = optimizer.optimizeGenerationRows(
    rows,
    edges,
    new Map(nodes.map((node) => [node.id, node])),
    'global',
  );
  const metrics = metricsModule.measureGenealogyGraph({
    nodes: result.nodes,
    edges,
    generationRows: result.generationRows,
    truncated: false,
  }, 'global');
  assert.equal(metrics.crossingPairs, 0, 'the default large-graph budget should choose a crossing-free candidate');
  assert.ok(result.metrics.exactCandidatesEvaluated > 0, 'large global layouts must compare actual rendered crossings');
});

test('layout optimizer preserves one shared ancestor and every pedigree-collapse edge', async () => {
  const optimizer = await loadLayoutOptimizer();
  assert.ok(optimizer, 'generation-row optimizer should load');
  const nodes = [
    metricNode('shared-ancestor', 0, -320, -2),
    metricNode('mother', -100, -160, -1),
    metricNode('father', 100, -160, -1),
    metricNode('child', 0, 0, 0),
  ];
  const edges = [
    metricEdge('edge:shared-mother', 'shared-ancestor', 'mother'),
    metricEdge('edge:shared-father', 'shared-ancestor', 'father'),
    metricEdge('edge:mother-child', 'mother', 'child', 'biological_mother'),
    metricEdge('edge:father-child', 'father', 'child', 'biological_father'),
  ];
  const rows = [
    { generation: -2, animalIds: ['shared-ancestor'] },
    { generation: -1, animalIds: ['mother', 'father'] },
    { generation: 0, animalIds: ['child'] },
  ];
  const result = optimizer.optimizeGenerationRows(rows, edges, new Map(nodes.map((node) => [node.id, node])), 'focused');
  assert.equal(result.nodes.filter((node) => node.id === 'shared-ancestor').length, 1);
  assert.deepEqual(result.generationRows.flatMap((row) => row.animalIds).sort(), nodes.map((node) => node.id).sort());
  assert.deepEqual(edges.map((edge) => edge.id).sort(), [
    'edge:father-child', 'edge:mother-child', 'edge:shared-father', 'edge:shared-mother',
  ]);
  const positions = new Map(result.nodes.map((node) => [node.id, node.x]));
  assert.ok(positions.get('mother') < positions.get('father'));
});

test('focused optimizer terminates with one reported violation for contradictory parent-side constraints', async () => {
  const optimizer = await loadLayoutOptimizer();
  assert.ok(optimizer, 'generation-row optimizer should load');
  const nodes = [
    metricNode('parent-a', -100, -160, -1),
    metricNode('parent-b', 100, -160, -1),
    metricNode('child-a', -100, 0, 0),
    metricNode('child-b', 100, 0, 0),
  ];
  const edges = [
    metricEdge('edge:a-mother', 'parent-a', 'child-a', 'biological_mother'),
    metricEdge('edge:b-father', 'parent-b', 'child-a', 'biological_father'),
    metricEdge('edge:b-mother', 'parent-b', 'child-b', 'biological_mother'),
    metricEdge('edge:a-father', 'parent-a', 'child-b', 'biological_father'),
  ];
  const rows = [
    { generation: -1, animalIds: ['parent-a', 'parent-b'] },
    { generation: 0, animalIds: ['child-a', 'child-b'] },
  ];
  const result = optimizer.optimizeGenerationRows(rows, edges, new Map(nodes.map((node) => [node.id, node])), 'focused');
  assert.equal(result.metrics.parentOrderViolations, 1);
  assert.equal(new Set(result.nodes.map((node) => node.id)).size, nodes.length);
  assert.deepEqual(result.generationRows.flatMap((row) => row.animalIds).sort(), nodes.map((node) => node.id).sort());
});

test('focused layout orders every candidate mother before every candidate father independent of edge order', async () => {
  const optimizer = await loadLayoutOptimizer();
  const metricsModule = await loadLayoutMetrics();
  assert.ok(optimizer, 'generation-row optimizer should load');
  assert.ok(metricsModule, 'layout metrics should load');
  const nodes = [
    metricNode('mother-a', 160, -160, -1, 'female'),
    metricNode('mother-b', 240, -160, -1, 'female'),
    metricNode('father-a', -240, -160, -1, 'male'),
    metricNode('father-b', -160, -160, -1, 'male'),
    metricNode('child', 0, 0, 0),
  ];
  const edges = [
    metricEdge('mother-a-child', 'mother-a', 'child', 'biological_mother'),
    metricEdge('mother-b-child', 'mother-b', 'child', 'biological_mother'),
    metricEdge('father-a-child', 'father-a', 'child', 'biological_father'),
    metricEdge('father-b-child', 'father-b', 'child', 'biological_father'),
  ];
  const rows = [
    { generation: -1, animalIds: ['father-b', 'mother-a', 'father-a', 'mother-b'] },
    { generation: 0, animalIds: ['child'] },
  ];
  const initialGraph = { nodes, edges, generationRows: rows, truncated: false };
  assert.equal(metricsModule.measureGenealogyGraph(initialGraph, 'focused').parentOrderViolations, 4,
    'all four candidate mother/father combinations are measured');
  const run = (inputEdges) => optimizer.optimizeGenerationRows(
    rows,
    inputEdges,
    new Map(nodes.map((node) => [node.id, node])),
    'focused',
  );
  const first = run(edges);
  const second = run([...edges].reverse());
  assert.deepEqual(first.generationRows, second.generationRows);
  const positions = new Map(first.nodes.map((node) => [node.id, node.x]));
  for (const mother of ['mother-a', 'mother-b']) {
    for (const father of ['father-a', 'father-b']) {
      assert.ok(positions.get(mother) < positions.get(father), `${mother} stays left of ${father} for the child`);
    }
  }
  assert.equal(first.metrics.parentOrderViolations, 0);
});

test('focused layout keeps distinct feasible mother-father couples together without grouping all mothers', async () => {
  const optimizer = await loadLayoutOptimizer();
  assert.ok(optimizer, 'generation-row optimizer should load');
  const nodes = [
    metricNode('mother-a', -400, -160, -1, 'female'),
    metricNode('father-a', -200, -160, -1, 'male'),
    metricNode('mother-b', 0, -160, -1, 'female'),
    metricNode('father-b', 200, -160, -1, 'male'),
    metricNode('unrelated', 400, -160, -1),
    metricNode('child-a', -100, 0, 0),
    metricNode('child-b', 100, 0, 0),
  ];
  const edges = [
    metricEdge('mother-a-child-a', 'mother-a', 'child-a', 'biological_mother'),
    metricEdge('father-a-child-a', 'father-a', 'child-a', 'biological_father'),
    metricEdge('mother-b-child-b', 'mother-b', 'child-b', 'biological_mother'),
    metricEdge('father-b-child-b', 'father-b', 'child-b', 'biological_father'),
  ];
  const rows = [
    { generation: -1, animalIds: ['father-a', 'unrelated', 'mother-b', 'father-b', 'mother-a'] },
    { generation: 0, animalIds: ['child-a', 'child-b'] },
  ];
  const result = optimizer.optimizeGenerationRows(rows, edges, new Map(nodes.map((node) => [node.id, node])), 'focused');
  const parentRow = result.generationRows.find((row) => row.generation === -1)?.animalIds ?? [];
  const positions = new Map(parentRow.map((id, index) => [id, index]));
  assert.equal(positions.get('father-a'), positions.get('mother-a') + 1);
  assert.equal(positions.get('father-b'), positions.get('mother-b') + 1);
  assert.ok(positions.get('mother-a') < positions.get('mother-b') || positions.get('mother-b') < positions.get('mother-a'));
  assert.equal(parentRow.includes('unrelated'), true, 'unrelated animals remain in the same generation row');
  assert.equal(result.metrics.parentOrderViolations, 0);
});

test('layout optimizer is deterministic and applies no parent-sex order in global mode', async () => {
  const optimizer = await loadLayoutOptimizer();
  assert.ok(optimizer, 'generation-row optimizer should load');
  const nodes = [
    metricNode('father', -100, -160, -1),
    metricNode('mother', 100, -160, -1),
    metricNode('child', 0, 0, 0),
  ];
  const edges = [
    metricEdge('edge:mother-child', 'mother', 'child', 'biological_mother'),
    metricEdge('edge:father-child', 'father', 'child', 'biological_father'),
  ];
  const rows = [
    { generation: -1, animalIds: ['father', 'mother'] },
    { generation: 0, animalIds: ['child'] },
  ];
  const run = () => optimizer.optimizeGenerationRows(rows, edges, new Map(nodes.map((node) => [node.id, node])), 'global');
  const first = run();
  const second = run();
  assert.deepEqual(first, second);
  const positions = new Map(first.nodes.map((node) => [node.id, node.x]));
  assert.ok(positions.get('father') < positions.get('mother'));
});

test('global route optimization can place a father before a mother when that removes a crossing', async () => {
  const optimizer = await loadLayoutOptimizer();
  const metricsModule = await loadLayoutMetrics();
  assert.ok(optimizer, 'generation-row optimizer should load');
  assert.ok(metricsModule, 'layout metrics should load');
  const nodes = [
    metricNode('mother', -100, -160, -1, 'female'),
    metricNode('father', 100, -160, -1, 'male'),
    metricNode('child-a', -100, 0, 0),
    metricNode('child-b', 100, 0, 0),
  ];
  const edges = [
    metricEdge('father-to-left-child', 'father', 'child-a', 'biological_father'),
    metricEdge('mother-to-right-child', 'mother', 'child-b', 'biological_mother'),
  ];
  const rows = [
    { generation: -1, animalIds: ['mother', 'father'] },
    { generation: 0, animalIds: ['child-a', 'child-b'] },
  ];
  const result = optimizer.optimizeGenerationRows(rows, edges, new Map(nodes.map((node) => [node.id, node])), 'global', {
    maxSweeps: 0,
    maxSwapEvaluations: 20,
    maxExactCandidates: 3,
  });
  const positions = new Map(result.nodes.map((node) => [node.id, node.x]));
  assert.ok(positions.get('father') < positions.get('mother'));
  assert.equal(metricsModule.measureGenealogyGraph({ nodes: result.nodes, edges, generationRows: result.generationRows, truncated: false }, 'global').crossingPairs, 0);
});

test('layout optimizer handles a 5000-animal row within bounded work', async () => {
  const optimizer = await loadLayoutOptimizer();
  assert.ok(optimizer, 'generation-row optimizer should load');
  const nodes = Array.from({ length: 5000 }, (_, index) => metricNode(`animal-${String(index).padStart(4, '0')}`, index * 200, 0, 0));
  const ids = nodes.map((node) => node.id);
  const result = optimizer.optimizeGenerationRows(
    [{ generation: 0, animalIds: ids }],
    [],
    new Map(nodes.map((node) => [node.id, node])),
    'global',
    { maxSweeps: 2, maxSwapEvaluations: 16, maxExactCandidates: 2 },
  );
  assert.equal(result.nodes.length, 5000);
  assert.equal(result.generationRows[0].animalIds.length, 5000);
});
