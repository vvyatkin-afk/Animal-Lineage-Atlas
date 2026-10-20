import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFocusedGenealogy, buildGlobalGenealogy, createGenealogyIndex } from '../packages/genealogy/layout.ts';
import { measureGenealogyGraph } from '../packages/genealogy/metrics.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const afterPath = resolve(repositoryRoot, process.argv[2] ?? 'reports/phase4/after/layout-metrics.json');
const comparisonPath = resolve(repositoryRoot, 'reports/phase4/comparisons/layout-comparison.json');
const baselinePath = resolve(repositoryRoot, 'reports/phase4/baseline/layout-metrics.json');
const productionBaseline = JSON.parse(await readFile(baselinePath, 'utf8'));
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const atlasIds = ['red-panda', 'polar-bear', 'hippopotamus'];
const after = {
  schema_version: 'phase4-layout-after-v1',
  captured_at: new Date().toISOString(),
  source_revision: sourceRevision,
  baseline_revision: productionBaseline.production_revision,
  method: productionBaseline.method,
  atlases: {},
};

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

for (const species of atlasIds) {
  const atlasPath = resolve(repositoryRoot, 'atlases', species, 'atlas.json');
  const atlas = JSON.parse(await readFile(atlasPath, 'utf8'));
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
  const measured = {
    records: animals.length,
    relationships: relationships.length,
    components: index.components.length,
    largest_component_animals: index.components.reduce((max, component) => Math.max(max, component.animalIds.length), 0),
    global: summarize(buildGlobalGenealogy(index), 'global'),
  };

  if (species === 'red-panda') {
    const largest = [...index.components].sort((left, right) =>
      right.animalIds.length - left.animalIds.length || left.id.localeCompare(right.id))[0];
    const largestIds = new Set(largest?.animalIds ?? []);
    const largestIndex = createGenealogyIndex(
      animals.filter((animal) => largestIds.has(animal.id)),
      relationships.filter((relationship) => largestIds.has(relationship.subject) && largestIds.has(relationship.object)),
    );
    measured.largest_component = summarize(buildGlobalGenealogy(largestIndex), 'global');
    measured.focus = {};
    for (const [name, focusId, depth] of [
      ['futa_default', 'red-panda:futa', 3],
      ['futa_all', 'red-panda:futa', 'all'],
      ['rakesh_default', 'red-panda:upstream-449', 3],
    ]) {
      measured.focus[name] = summarize(
        buildFocusedGenealogy(index, focusId, { depth, maxNodes: animals.length }),
        'focused',
      );
    }
  }
  after.atlases[species] = measured;
}

const cases = [
  ['red-panda', 'focus.futa_default', 'red panda · Futa · 3 generations'],
  ['red-panda', 'focus.futa_all', 'red panda · Futa · all known generations'],
  ['red-panda', 'focus.rakesh_default', 'red panda · Rakesh · 3 generations'],
  ['red-panda', 'largest_component', 'red panda · largest component'],
  ['red-panda', 'global', 'red panda · all animals'],
  ['polar-bear', 'global', 'polar bears · all animals'],
  ['hippopotamus', 'global', 'hippos · all animals'],
];
const comparison = {
  schema_version: 'phase4-layout-comparison-v1',
  captured_at: after.captured_at,
  baseline_revision: productionBaseline.production_revision,
  after_revision: sourceRevision,
  method: 'Crossings count renderer-route pairs; length sums rendered route centerlines. Each before/after view uses identical records and edges.',
  cases: [],
};
for (const [species, selector, label] of cases) {
  const baseline = selector.split('.').reduce((value, key) => value[key], productionBaseline.atlases[species]);
  const current = selector.split('.').reduce((value, key) => value[key], after.atlases[species]);
  if (baseline.nodes !== current.nodes || baseline.edges !== current.edges) {
    throw new Error(`${label}: node or edge counts changed (${baseline.nodes}/${baseline.edges} vs ${current.nodes}/${current.edges})`);
  }
  const crossingsBefore = baseline.crossings.edge_pairs;
  const crossingsAfter = current.crossings.edge_pairs;
  const lengthBefore = baseline.total_route_length;
  const lengthAfter = current.total_route_length;
  comparison.cases.push({
    label,
    nodes: current.nodes,
    edges: current.edges,
    crossings: {
      baseline: crossingsBefore,
      after: crossingsAfter,
      reduction_percent: Number(((crossingsBefore - crossingsAfter) / crossingsBefore * 100).toFixed(1)),
    },
    route_length: {
      baseline: lengthBefore,
      after: lengthAfter,
      reduction_percent: Number(((lengthBefore - lengthAfter) / lengthBefore * 100).toFixed(1)),
    },
    constraints: {
      node_overlap_pairs: current.node_overlap_pairs,
      generation_order_violations: current.generation_order_violations,
      focused_parent_order_violations: selector.startsWith('focus.') ? current.parent_order_violations : null,
      global_parent_ordering: selector.startsWith('focus.') ? 'focused constraint' : 'unconstrained',
    },
  });
}
comparison.all_cases_reduce_crossings = comparison.cases.every((entry) => entry.crossings.reduction_percent > 0);
comparison.all_cases_reduce_route_length = comparison.cases.every((entry) => entry.route_length.reduction_percent > 0);

await mkdir(dirname(afterPath), { recursive: true });
await mkdir(dirname(comparisonPath), { recursive: true });
await writeFile(afterPath, `${JSON.stringify(after, null, 2)}\n`);
await writeFile(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ after: afterPath, comparison: comparisonPath, cases: comparison.cases }, null, 2)}\n`);
