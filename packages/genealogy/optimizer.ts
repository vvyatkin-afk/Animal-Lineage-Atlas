import { countGenealogyRouteCrossings } from './metrics.ts';
import { routeGenealogyEdge, GENEALOGY_NODE_WIDTH, type GenealogyRouteMode } from './edge-route.ts';
import type { GenerationRow, GraphEdge, GraphNode, GenealogyGraph } from './layout.ts';

const EPSILON = 1e-7;

export interface LayoutOptimizerOptions {
  /** Horizontal center-to-center spacing. It must be at least the card width. */
  nodeSpacing?: number;
  maxSweeps?: number;
  maxSwapEvaluations?: number;
  maxExactCandidates?: number;
}

export interface LayoutOptimizationMetrics {
  parentOrderViolations: number;
  crossingPairs: number | null;
  layeredCrossingEstimate: number;
  totalRouteLength: number;
  width: number;
  movement: number;
  exactCandidatesEvaluated: number;
}

export interface OptimizedGenerationRows {
  generationRows: GenerationRow[];
  nodes: GraphNode[];
  metrics: LayoutOptimizationMetrics;
}

interface ParentPair {
  childId: string;
  motherId: string;
  fatherId: string;
}

interface Candidate {
  rows: GenerationRow[];
  nodes: GraphNode[];
  parentOrderViolations: number;
  layeredCrossingEstimate: number;
  crossingPairs?: number;
  totalRouteLength: number;
  width: number;
  movement: number;
  signature: string;
}

interface Neighbor {
  id: string;
}

/**
 * Reorder animals inside their existing generation rows. Bounded sweeps and
 * adjacent sifting propose candidates; the final choice uses sampled rendered
 * route crossings and route lengths, with focused parent order as a hard
 * precedence constraint whenever the precedence graph is feasible.
 */
export function optimizeGenerationRows(
  rows: GenerationRow[],
  edges: GraphEdge[],
  nodesById: ReadonlyMap<string, GraphNode>,
  mode: GenealogyRouteMode,
  options: LayoutOptimizerOptions = {},
): OptimizedGenerationRows {
  const nodeSpacing = Math.max(GENEALOGY_NODE_WIDTH, finiteOption(options.nodeSpacing, 200));
  const largeGlobalGraph = mode === 'global' && nodesById.size > 500;
  const maxSweeps = boundedInteger(options.maxSweeps, mode === 'focused' ? 6 : 4, 0, 16);
  const maxSwapEvaluations = boundedInteger(options.maxSwapEvaluations, mode === 'focused' ? 48 : largeGlobalGraph ? 0 : 20, 0, 1024);
  const maxExactCandidates = boundedInteger(options.maxExactCandidates, mode === 'focused' ? 4 : largeGlobalGraph ? 0 : 3, 0, 8);
  const initialRows = copyRows(rows);
  const initialX = new Map([...nodesById].map(([id, node]) => [id, node.x]));
  const parents = getFocusedParentPairs(edges, nodesById);
  const rowGenerationById = new Map<string, number>();
  for (const row of initialRows) for (const id of row.animalIds) rowGenerationById.set(id, row.generation);
  const constraints = mode === 'focused' ? getSameRowConstraints(parents, rowGenerationById) : new Map<number, Array<[string, string]>>();
  const neighbors = buildNeighbors(edges, nodesById);
  const candidateBySignature = new Map<string, Candidate>();

  const addCandidate = (candidateRows: GenerationRow[]) => {
    const signature = rowsSignature(candidateRows);
    const known = candidateBySignature.get(signature);
    if (known) return known;
    const candidate = scoreCandidate(candidateRows, edges, nodesById, initialX, parents, mode, nodeSpacing);
    candidateBySignature.set(signature, candidate);
    return candidate;
  };

  // Preserve the input ordering as a safe candidate, then project it onto any
  // feasible focused mother-before-father precedence constraints.
  addCandidate(initialRows);
  let workingRows = normalizeFocusedRows(initialRows, constraints);
  addCandidate(workingRows);

  for (let pass = 0; pass < maxSweeps; pass += 1) {
    const ascending = pass % 2 === 0;
    const generations = workingRows.map((row) => row.generation);
    if (!ascending) generations.reverse();
    let rankById = makeNormalizedRanks(workingRows);

    for (const generation of generations) {
      const row = workingRows.find((item) => item.generation === generation);
      if (!row || row.animalIds.length < 2) continue;
      const priorRank = new Map(row.animalIds.map((id, position) => [id, position]));
      const useMedian = pass % 2 === 1;
      const score = (id: string): number | null => {
        const values = (neighbors.get(id) ?? [])
          .map((neighbor) => rankById.get(neighbor.id))
          .filter((value): value is number => value !== undefined);
        if (!values.length) return null;
        values.sort((left, right) => left - right);
        if (useMedian) {
          const middle = Math.floor(values.length / 2);
          return values.length % 2 ? values[middle] ?? 0 : ((values[middle - 1] ?? 0) + (values[middle] ?? 0)) / 2;
        }
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      };
      const scores = new Map(row.animalIds.map((id) => [id, score(id)]));
      row.animalIds.sort((left, right) => {
        const leftScore = scores.get(left) ?? null;
        const rightScore = scores.get(right) ?? null;
        if (leftScore !== null && rightScore === null) return -1;
        if (leftScore === null && rightScore !== null) return 1;
        if (leftScore !== null && rightScore !== null && Math.abs(leftScore - rightScore) > EPSILON) return leftScore - rightScore;
        return (priorRank.get(left) ?? 0) - (priorRank.get(right) ?? 0) || left.localeCompare(right);
      });
      rankById = makeNormalizedRanks(workingRows);
    }

    workingRows = normalizeFocusedRows(workingRows, constraints);
    addCandidate(workingRows);
  }

  let current = bestApproximateCandidate(candidateBySignature.values());
  let swapEvaluations = 0;
  for (let round = 0; round < 2 && swapEvaluations < maxSwapEvaluations; round += 1) {
    let changed = false;
    const scan = round % 2 === 0 ? current.rows : [...current.rows].reverse();
    for (const selectedRow of scan) {
      const rowIndex = current.rows.findIndex((row) => row.generation === selectedRow.generation);
      const row = current.rows[rowIndex];
      if (!row || row.animalIds.length < 2) continue;
      let index = round % 2 === 0 ? 0 : row.animalIds.length - 2;
      while (index >= 0 && index < row.animalIds.length - 1 && swapEvaluations < maxSwapEvaluations) {
        const trialRows = copyRows(current.rows);
        const trialRow = trialRows[rowIndex];
        if (!trialRow) break;
        [trialRow.animalIds[index], trialRow.animalIds[index + 1]] = [trialRow.animalIds[index + 1] as string, trialRow.animalIds[index] as string];
        const normalizedTrial = normalizeFocusedRows(trialRows, constraints);
        swapEvaluations += 1;
        const trial = addCandidate(normalizedTrial);
        if (compareApproximate(trial, current) < 0) {
          current = trial;
          changed = true;
        }
        index += round % 2 === 0 ? 1 : -1;
      }
      if (swapEvaluations >= maxSwapEvaluations) break;
    }
    if (!changed) break;
  }

  const approximateCandidates = [...candidateBySignature.values()].sort(compareApproximate);
  const exactSet: Candidate[] = [];
  const include = (candidate: Candidate | undefined) => {
    if (!candidate || exactSet.some((item) => item.signature === candidate.signature)) return;
    if (exactSet.length < maxExactCandidates) exactSet.push(candidate);
  };
  if (maxExactCandidates > 0) {
    if (maxExactCandidates === 1) include(approximateCandidates[0]);
    else {
      include(candidateBySignature.get(rowsSignature(initialRows)));
      include([...candidateBySignature.values()].sort((left, right) =>
        left.parentOrderViolations - right.parentOrderViolations
          || compareApproximate(left, right))[0]);
      for (const candidate of approximateCandidates) include(candidate);
    }
  }

  let exactCandidatesEvaluated = 0;
  for (const candidate of exactSet) {
    candidate.crossingPairs = countGenealogyRouteCrossings({
      nodes: candidate.nodes,
      edges,
      generationRows: candidate.rows,
      truncated: false,
    }, mode);
    exactCandidatesEvaluated += 1;
  }
  const selected = (exactSet.length ? exactSet.sort(compareExact)[0] : approximateCandidates[0])
    ?? scoreCandidate(initialRows, edges, nodesById, initialX, parents, mode, nodeSpacing);
  return {
    generationRows: copyRows(selected.rows),
    nodes: selected.nodes,
    metrics: {
      parentOrderViolations: selected.parentOrderViolations,
      crossingPairs: selected.crossingPairs ?? null,
      layeredCrossingEstimate: selected.layeredCrossingEstimate,
      totalRouteLength: selected.totalRouteLength,
      width: selected.width,
      movement: selected.movement,
      exactCandidatesEvaluated,
    },
  };
}

function scoreCandidate(
  rows: GenerationRow[],
  edges: GraphEdge[],
  nodesById: ReadonlyMap<string, GraphNode>,
  initialX: ReadonlyMap<string, number>,
  parents: ParentPair[],
  mode: GenealogyRouteMode,
  nodeSpacing: number,
): Candidate {
  const candidateRows = copyRows(rows);
  const xById = new Map<string, number>();
  for (const row of candidateRows) {
    const center = (row.animalIds.length - 1) / 2;
    row.animalIds.forEach((id, position) => xById.set(id, (position - center) * nodeSpacing));
  }
  const candidateNodes = [...nodesById.values()].map((node) => ({ ...node, x: xById.get(node.id) ?? node.x }));
  const candidateNodesById = new Map(candidateNodes.map((node) => [node.id, node]));
  let totalRouteLength = 0;
  for (const edge of edges) totalRouteLength += routeGenealogyEdge(edge, candidateNodesById, mode)?.length ?? 0;
  const xs = candidateNodes.map((node) => node.x);
  const width = xs.length ? Math.max(...xs) - Math.min(...xs) + GENEALOGY_NODE_WIDTH : 0;
  const movement = candidateNodes.reduce((total, node) => total + Math.abs(node.x - (initialX.get(node.id) ?? node.x)), 0);
  return {
    rows: candidateRows,
    nodes: candidateNodes,
    parentOrderViolations: mode === 'focused' ? countParentOrderViolations(parents, candidateNodesById) : 0,
    layeredCrossingEstimate: countLayeredCrossings(candidateRows, edges, candidateNodesById),
    totalRouteLength,
    width,
    movement,
    signature: rowsSignature(candidateRows),
  };
}

function getFocusedParentPairs(edges: GraphEdge[], nodesById: ReadonlyMap<string, GraphNode>): ParentPair[] {
  const parentsByChild = new Map<string, { motherId?: string; fatherId?: string }>();
  for (const edge of edges) {
    if (edge.type !== 'biological_mother' && edge.type !== 'biological_father') continue;
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) continue;
    const parents = parentsByChild.get(edge.to) ?? {};
    if (edge.type === 'biological_mother') parents.motherId = edge.from;
    else parents.fatherId = edge.from;
    parentsByChild.set(edge.to, parents);
  }
  return [...parentsByChild.entries()].flatMap(([childId, pair]) =>
    pair.motherId && pair.fatherId && pair.motherId !== pair.fatherId
      ? [{ childId, motherId: pair.motherId, fatherId: pair.fatherId }]
      : []);
}

function getSameRowConstraints(parents: ParentPair[], generationById: ReadonlyMap<string, number>): Map<number, Array<[string, string]>> {
  const constraints = new Map<number, Array<[string, string]>>();
  for (const pair of parents) {
    const motherGeneration = generationById.get(pair.motherId);
    const fatherGeneration = generationById.get(pair.fatherId);
    if (motherGeneration === undefined || motherGeneration !== fatherGeneration) continue;
    const row = constraints.get(motherGeneration) ?? [];
    row.push([pair.motherId, pair.fatherId]);
    constraints.set(motherGeneration, row);
  }
  return constraints;
}

function countParentOrderViolations(parents: ParentPair[], nodesById: ReadonlyMap<string, GraphNode>): number {
  return parents.reduce((count, pair) => {
    const mother = nodesById.get(pair.motherId);
    const father = nodesById.get(pair.fatherId);
    return count + (mother && father && mother.x >= father.x ? 1 : 0);
  }, 0);
}

function normalizeFocusedRows(rows: GenerationRow[], constraints: Map<number, Array<[string, string]>>): GenerationRow[] {
  if (!constraints.size) return copyRows(rows);
  return copyRows(rows).map((row) => ({
    generation: row.generation,
    animalIds: constraints.has(row.generation)
      ? stableTopologicalOrder(row.animalIds, constraints.get(row.generation) ?? [])
      : row.animalIds,
  }));
}

function stableTopologicalOrder(ids: string[], constraints: Array<[string, string]>): string[] {
  const present = new Set(ids);
  const rank = new Map(ids.map((id, index) => [id, index]));
  const outgoing = new Map(ids.map((id) => [id, new Set<string>()]));
  const inDegree = new Map(ids.map((id) => [id, 0]));
  for (const [left, right] of constraints) {
    if (!present.has(left) || !present.has(right) || left === right) continue;
    const neighbors = outgoing.get(left);
    if (!neighbors || neighbors.has(right)) continue;
    neighbors.add(right);
    inDegree.set(right, (inDegree.get(right) ?? 0) + 1);
  }

  const compare = (left: string, right: string) => (rank.get(left) ?? 0) - (rank.get(right) ?? 0) || left.localeCompare(right);
  const heap: string[] = [];
  const push = (id: string) => {
    heap.push(id);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compare(heap[parent] ?? '', heap[index] ?? '') <= 0) break;
      [heap[parent], heap[index]] = [heap[index] as string, heap[parent] as string];
      index = parent;
    }
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      heap[0] = last;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < heap.length && compare(heap[left] ?? '', heap[smallest] ?? '') < 0) smallest = left;
        if (right < heap.length && compare(heap[right] ?? '', heap[smallest] ?? '') < 0) smallest = right;
        if (smallest === index) break;
        [heap[smallest], heap[index]] = [heap[index] as string, heap[smallest] as string];
        index = smallest;
      }
    }
    return first;
  };
  for (const id of ids) if ((inDegree.get(id) ?? 0) === 0) push(id);

  const ordered: string[] = [];
  while (heap.length) {
    const id = pop();
    if (!id) continue;
    ordered.push(id);
    for (const child of outgoing.get(id) ?? []) {
      const remaining = (inDegree.get(child) ?? 0) - 1;
      inDegree.set(child, remaining);
      if (remaining === 0) push(child);
    }
  }
  const emitted = new Set(ordered);
  for (const id of ids) if (!emitted.has(id)) ordered.push(id);
  return ordered;
}

function buildNeighbors(edges: GraphEdge[], nodesById: ReadonlyMap<string, GraphNode>): Map<string, Neighbor[]> {
  const neighbors = new Map<string, Neighbor[]>();
  for (const edge of edges) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to || from.id === to.id || from.generation === to.generation) continue;
    const fromList = neighbors.get(from.id) ?? [];
    fromList.push({ id: to.id });
    neighbors.set(from.id, fromList);
    const toList = neighbors.get(to.id) ?? [];
    toList.push({ id: from.id });
    neighbors.set(to.id, toList);
  }
  return neighbors;
}

function makeNormalizedRanks(rows: GenerationRow[]): Map<string, number> {
  const ranks = new Map<string, number>();
  for (const row of rows) {
    const denominator = Math.max(1, row.animalIds.length - 1);
    row.animalIds.forEach((id, index) => ranks.set(id, index / denominator));
  }
  return ranks;
}

/** Split long edges into virtual row-to-row segments so mixed generation spans can cross. */
function countLayeredCrossings(rows: GenerationRow[], edges: GraphEdge[], nodesById: ReadonlyMap<string, GraphNode>): number {
  const generations = rows.map((row) => row.generation).sort((left, right) => left - right);
  const crossingsByBand = new Map<string, Array<{ startX: number; endX: number; edge: GraphEdge }>>();
  const sameGeneration = new Map<number, Array<{ startX: number; endX: number; edge: GraphEdge }>>();
  for (const edge of edges) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to || from.id === to.id) continue;
    if (from.generation === to.generation) {
      const group = sameGeneration.get(from.generation) ?? [];
      group.push({ startX: from.x, endX: to.x, edge });
      sameGeneration.set(from.generation, group);
      continue;
    }

    const minimumGeneration = Math.min(from.generation, to.generation);
    const maximumGeneration = Math.max(from.generation, to.generation);
    for (let index = 0; index < generations.length - 1; index += 1) {
      const upperGeneration = generations[index];
      const lowerGeneration = generations[index + 1];
      if (upperGeneration === undefined || lowerGeneration === undefined
        || upperGeneration < minimumGeneration || lowerGeneration > maximumGeneration) continue;
      const span = to.generation - from.generation;
      const upperFraction = (upperGeneration - from.generation) / span;
      const lowerFraction = (lowerGeneration - from.generation) / span;
      const groupKey = `${upperGeneration}\u0000${lowerGeneration}`;
      const group = crossingsByBand.get(groupKey) ?? [];
      group.push({
        startX: from.x + (to.x - from.x) * upperFraction,
        endX: from.x + (to.x - from.x) * lowerFraction,
        edge,
      });
      crossingsByBand.set(groupKey, group);
    }
  }

  return [...crossingsByBand.values(), ...sameGeneration.values()]
    .reduce((total, segments) => total + countSegmentCrossings(segments), 0);
}

function countSegmentCrossings(segments: Array<{ startX: number; endX: number; edge: GraphEdge }>): number {
  const ordered = [...segments].sort((left, right) => left.startX - right.startX
    || left.endX - right.endX
    || left.edge.from.localeCompare(right.edge.from)
    || left.edge.to.localeCompare(right.edge.to));
  if (ordered.length < 2) return 0;
  const endRanks = new Map([...new Set(ordered.map((item) => item.endX))]
    .sort((left, right) => left - right)
    .map((x, index) => [x, index]));
  const tree = new FenwickTree(endRanks.size);
  let inserted = 0;
  let crossings = 0;
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && Math.abs((ordered[end]?.startX ?? 0) - (ordered[start]?.startX ?? 0)) <= EPSILON) end += 1;
    for (let index = start; index < end; index += 1) {
      const item = ordered[index];
      if (!item) continue;
      const endRank = endRanks.get(item.endX);
      if (endRank !== undefined) crossings += inserted - tree.sum(endRank + 1);
    }
    for (let index = start; index < end; index += 1) {
      const item = ordered[index];
      if (!item) continue;
      const endRank = endRanks.get(item.endX);
      if (endRank === undefined) continue;
      tree.add(endRank, 1);
      inserted += 1;
    }
    start = end;
  }
  return crossings;
}

class FenwickTree {
  private readonly values: number[];

  constructor(size: number) {
    this.values = Array.from({ length: Math.max(1, size) + 1 }, () => 0);
  }

  add(zeroBasedIndex: number, value: number): void {
    for (let index = zeroBasedIndex + 1; index < this.values.length; index += index & -index) {
      this.values[index] = (this.values[index] ?? 0) + value;
    }
  }

  /** Sum of the first `count` zero-based slots. */
  sum(count: number): number {
    let total = 0;
    for (let index = Math.min(count, this.values.length - 1); index > 0; index -= index & -index) total += this.values[index] ?? 0;
    return total;
  }
}

function compareApproximate(left: Candidate, right: Candidate): number {
  return left.parentOrderViolations - right.parentOrderViolations
    || left.layeredCrossingEstimate - right.layeredCrossingEstimate
    || compareNumber(left.totalRouteLength, right.totalRouteLength)
    || compareNumber(left.width, right.width)
    || compareNumber(left.movement, right.movement)
    || left.signature.localeCompare(right.signature);
}

function compareExact(left: Candidate, right: Candidate): number {
  return left.parentOrderViolations - right.parentOrderViolations
    || (left.crossingPairs ?? Number.MAX_SAFE_INTEGER) - (right.crossingPairs ?? Number.MAX_SAFE_INTEGER)
    || compareNumber(left.totalRouteLength, right.totalRouteLength)
    || compareNumber(left.width, right.width)
    || compareNumber(left.movement, right.movement)
    || left.signature.localeCompare(right.signature);
}

function bestApproximateCandidate(candidates: Iterable<Candidate>): Candidate {
  return [...candidates].sort(compareApproximate)[0] as Candidate;
}

function compareNumber(left: number, right: number): number {
  if (Math.abs(left - right) <= EPSILON) return 0;
  return left < right ? -1 : 1;
}

function rowsSignature(rows: GenerationRow[]): string {
  return rows.map((row) => `${row.generation}:${row.animalIds.join('\u0001')}`).join('\u0002');
}

function copyRows(rows: GenerationRow[]): GenerationRow[] {
  return rows.map((row) => ({ generation: row.generation, animalIds: [...row.animalIds] }));
}

function finiteOption(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  const selected = value !== undefined && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(minimum, Math.min(maximum, selected));
}
