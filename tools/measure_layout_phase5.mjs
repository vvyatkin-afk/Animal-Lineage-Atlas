import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFocusedGenealogy, buildGlobalGenealogy, createGenealogyIndex } from '../packages/genealogy/layout.ts';
import { measureGenealogyGraph } from '../packages/genealogy/metrics.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const afterPath = resolve(repositoryRoot, process.argv[2] ?? 'reports/phase5/after/layout-metrics.json');
const baselinePath = resolve(repositoryRoot, 'reports/phase5/baseline/layout-metrics.json');
const productionBaseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const atlas = JSON.parse(await readFile(resolve(repositoryRoot, 'atlases/red-panda/atlas.json'), 'utf8'));
const animals = atlas.animals.map((animal) => ({
  id: animal.id,
  name: animal.name,
  sex: animal.sex,
  country_code: animal.country_code,
  status: animal.status,
  birth_date_label: animal.birth_date_label,
  death_date_label: animal.death_date_label,
}));
const relationships = atlas.relationships.map((relationship) => ({
  id: relationship.id,
  subject: relationship.subject,
  object: relationship.object,
  type: relationship.type,
  status: relationship.status,
  source_ids: relationship.source_ids,
}));
const index = createGenealogyIndex(animals, relationships);
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();

function summarize(graph, mode) {
  const metrics = measureGenealogyGraph(graph, mode);
  return {
    nodes: metrics.nodeCount,
    edges: metrics.edgeCount,
    generations: graph.generationRows.length,
    truncated: graph.truncated,
    crossings: { edge_pairs: metrics.crossingPairs, samples_per_curve: metrics.samplesPerCurve },
    total_route_length: Number(metrics.totalRouteLength.toFixed(2)),
    node_overlap_pairs: metrics.nodeOverlapPairs,
    edge_node_collision_pairs: metrics.edgeNodeCollisionPairs,
    generation_order_violations: metrics.generationOrderViolations,
    parent_order_violations: metrics.parentOrderViolations,
    width: Number(metrics.bounds.width.toFixed(2)),
    height: Number(metrics.bounds.height.toFixed(2)),
  };
}

function parentPairSummary(graph) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const mothersByChild = new Map();
  const fathersByChild = new Map();
  for (const edge of graph.edges) {
    if (edge.type === 'biological_mother') {
      const ids = mothersByChild.get(edge.to) ?? [];
      ids.push(edge.from);
      mothersByChild.set(edge.to, ids);
    }
    if (edge.type === 'biological_father') {
      const ids = fathersByChild.get(edge.to) ?? [];
      ids.push(edge.from);
      fathersByChild.set(edge.to, ids);
    }
  }
  let candidates = 0;
  let ordered = 0;
  let adjacent = 0;
  for (const [childId, mothers] of mothersByChild) {
    const fathers = fathersByChild.get(childId) ?? [];
    for (const motherId of mothers) for (const fatherId of fathers) {
      const mother = nodeById.get(motherId);
      const father = nodeById.get(fatherId);
      if (!mother || !father || mother.generation !== father.generation) continue;
      candidates += 1;
      if (mother.x < father.x) ordered += 1;
      if (Math.abs(mother.x - father.x) <= 200 + 1e-7) adjacent += 1;
    }
  }
  return { parent_pair_candidates: candidates, parent_pair_ordered: ordered, parent_pair_adjacent: adjacent };
}

function runSamples(build, mode, includeParentPairs = false) {
  const samples = [];
  for (let repetition = 0; repetition < 2; repetition += 1) {
    const started = performance.now();
    const graph = build();
    const buildMs = performance.now() - started;
    const metrics = summarize(graph, mode);
    samples.push({ build_ms: Number(buildMs.toFixed(3)), metrics,
      ...(includeParentPairs ? parentPairSummary(graph) : {}) });
  }
  const signatures = samples.map((sample) => JSON.stringify({
    metrics: sample.metrics,
    ...(includeParentPairs ? {
      parent_pair_candidates: sample.parent_pair_candidates,
      parent_pair_ordered: sample.parent_pair_ordered,
      parent_pair_adjacent: sample.parent_pair_adjacent,
    } : {}),
  }));
  return {
    samples,
    measurement_repeatable_across_two_runs: signatures[0] === signatures[1],
    ...(includeParentPairs ? {
      parent_pair_candidates: samples[0]?.parent_pair_candidates,
      parent_pair_ordered: samples[0]?.parent_pair_ordered,
      parent_pair_adjacent: samples[0]?.parent_pair_adjacent,
    } : {}),
  };
}

function withComparison(name, record) {
  const before = productionBaseline.cases[name];
  const after = record.samples[0].metrics;
  return {
    before: {
      nodes: before.nodes,
      edges: before.edges,
      crossings: before.crossings.edge_pairs,
      total_route_length: before.total_route_length,
    },
    after: {
      nodes: after.nodes,
      edges: after.edges,
      crossings: after.crossings.edge_pairs,
      total_route_length: after.total_route_length,
    },
    crossings_delta: after.crossings.edge_pairs - before.crossings.edge_pairs,
    route_length_delta: Number((after.total_route_length - before.total_route_length).toFixed(2)),
  };
}

const largestComponent = [...index.components].sort((left, right) =>
  right.animalIds.length - left.animalIds.length || left.id.localeCompare(right.id))[0];
const largestIds = new Set(largestComponent?.animalIds ?? []);
const largestIndex = createGenealogyIndex(
  animals.filter((animal) => largestIds.has(animal.id)),
  relationships.filter((relationship) => largestIds.has(relationship.subject) && largestIds.has(relationship.object)),
);

const cases = {
  all_animals: runSamples(() => buildGlobalGenealogy(index), 'global'),
  largest_component: runSamples(() => buildGlobalGenealogy(largestIndex), 'global'),
  futa_depth_3: runSamples(() => buildFocusedGenealogy(index, 'red-panda:futa', { depth: 3, maxNodes: animals.length }), 'focused', true),
  futa_all_known: runSamples(() => buildFocusedGenealogy(index, 'red-panda:futa', { depth: 'all', maxNodes: animals.length }), 'focused', true),
  rakesh_depth_3: runSamples(() => buildFocusedGenealogy(index, 'red-panda:upstream-449', { depth: 3, maxNodes: animals.length }), 'focused', true),
  bandit_depth_3: runSamples(() => buildFocusedGenealogy(index, 'red-panda:upstream-1186', { depth: 3, maxNodes: animals.length }), 'focused', true),
  bandit_all_known: runSamples(() => buildFocusedGenealogy(index, 'red-panda:upstream-1186', { depth: 'all', maxNodes: animals.length }), 'focused', true),
};

const comparison = Object.fromEntries(Object.entries(cases).map(([name, record]) => [name, withComparison(name, record)]));
const output = {
  schema_version: 'phase5-layout-after-v3',
  captured_at: new Date().toISOString(),
  source_parent_revision: sourceRevision,
  source_worktree_dirty: true,
  baseline_release: productionBaseline.production_revision,
  method: {
    route: 'Shared renderer route geometry; cubic Bezier curves sampled into 24 segments; route length sums complete rendered centerlines. Crossing candidate indexing uses a 256-world-unit spatial grid, then applies the unchanged bounding-box, segment-intersection, and opposite-side polyline tests. Shared-endpoint edge pairs are excluded; solid and dashed edges are included.',
    node_rect: '176x74 world-unit bounds; edge-node collision pairs exclude each edge endpoint.',
    repeatability: 'Global and focused layouts and exact route metrics are repeated twice against identical canonical records and deterministic optimizer settings.',
    objective: 'Exact rendered crossings first, complete rendered route length second; focused mode enforces feasible mother-left-of-father constraints and proposes adjacent couples. Global mode has no sex-based candidate or ordering constraint. Later tie-breaks preserve readable spacing. Search is bounded and deterministic; it does not claim global optimality.',
    performance_budget_ms: 2000,
  },
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  dataset: {
    species: 'red-panda',
    animals: animals.length,
    relationships: relationships.length,
    media_references: atlas.media.length,
    relationship_components: index.components.length,
  },
  cases,
  comparisons: comparison,
  bandit_identity: {
    canonical_id: 'red-panda:upstream-1186',
    name: 'Bandit',
    biological_mother: 'red-panda:upstream-999',
    biological_father: 'red-panda:upstream-394',
    relationship_status: 'probable',
  },
};

await writeFile(afterPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: afterPath, cases: Object.keys(cases), repeatable: Object.values(cases).every((item) => item.measurement_repeatable_across_two_runs) }, null, 2));
