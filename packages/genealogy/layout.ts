import { optimizeGenerationRows } from './optimizer.ts';
import type { LayoutOptimizerOptions } from './optimizer.ts';

export type RelationshipStatus = 'confirmed' | 'probable' | 'disputed' | 'unknown';
export type RelationshipType = 'biological_mother' | 'biological_father' | 'foster' | 'adoptive' | 'social';

export interface GraphAnimal {
  id: string;
  name?: { canonical?: string };
  country_code?: string | null;
  sex?: string | null;
  status?: string | null;
  photo_confirmed?: boolean;
  photo_url?: string | null;
  photo_fallback_url?: string | null;
  photo_source_url?: string | null;
  photo_credit?: string | null;
  photo_license?: string | null;
  photo_license_url?: string | null;
  birth_date_label?: string | null;
  death_date_label?: string | null;
  institution_label?: string | null;
}

export interface GraphRelationship {
  id: string;
  subject: string;
  object: string;
  type: RelationshipType;
  status: RelationshipStatus;
  source_ids?: string[];
}

export interface GraphOptions {
  depth?: number | 'all';
  maxNodes?: number;
  columnGap?: number;
  rowGap?: number;
  optimizer?: LayoutOptimizerOptions;
}

export type GraphGrouping = 'family' | 'country';

export interface GlobalGraphOptions {
  grouping?: GraphGrouping;
  columnGap?: number;
  rowGap?: number;
  familyGap?: number;
  margin?: number;
  optimizer?: LayoutOptimizerOptions;
}

export interface GraphNode {
  id: string;
  name: string;
  generation: number;
  x: number;
  y: number;
  countryCode: string | null;
  sex: string | null;
  lifeStatus: string | null;
  photoConfirmed: boolean;
  photoUrl: string | null;
  photoFallbackUrl: string | null;
  photoSourceUrl: string | null;
  photoCredit: string | null;
  photoLicense: string | null;
  photoLicenseUrl: string | null;
  birthDateLabel: string | null;
  deathDateLabel: string | null;
  institutionLabel: string | null;
  componentId: string;
  tileId?: string | null;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: RelationshipType;
  status: RelationshipStatus;
  sourceIds: string[];
}

export interface GenerationRow {
  generation: number;
  animalIds: string[];
}

export interface GenealogyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  generationRows: GenerationRow[];
  truncated: boolean;
  bounds?: { left: number; top: number; right: number; bottom: number };
  grouping?: GraphGrouping;
  componentCount?: number;
  familyTiles?: GenealogyFamilyTile[];
}

export interface GenealogyFamilyTile {
  id: string;
  representativeId: string;
  label: string;
  previewAnimalName?: string;
  previewPhotoUrl?: string;
  previewFallbackUrl?: string;
  previewCredit?: string;
  previewLicense?: string;
  animalCount: number;
  familyGroupCount: number;
  countryCount: number;
  generationRows: Array<{ generation: number; y: number; left: number; right: number }>;
  bounds: { left: number; top: number; right: number; bottom: number };
}

export interface FamilyOverviewTileBounds {
  id: string;
  bounds: { left: number; top: number; right: number; bottom: number };
}

export interface FamilyOverviewLayout {
  tileBounds: FamilyOverviewTileBounds[];
  bounds: { left: number; top: number; right: number; bottom: number };
}

/** Move the active keyboard selection across the ordered family overview tiles. */
export function advanceFamilyTileIndex(currentIndex: number, direction: -1 | 1, count: number): number {
  if (count <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= count) return direction > 0 ? 0 : count - 1;
  return (currentIndex + direction + count) % count;
}

/** Pack one summary tile per real family component into a viewport-shaped overview. */
export function layoutFamilyOverview(
  tiles: Array<Pick<GenealogyFamilyTile, 'id' | 'animalCount'>>,
  targetAspectRatio: number,
): FamilyOverviewLayout {
  if (!tiles.length) return { tileBounds: [], bounds: { left: 0, top: 0, right: 1, bottom: 1 } };
  const aspect = Number.isFinite(targetAspectRatio) ? Math.max(0.35, Math.min(2.8, targetAspectRatio)) : 1.4;
  const tileAspect = Math.max(0.65, Math.min(1.5, aspect));
  const unit = 1000;
  const gap = 48;
  const layouts = tiles.map((tile) => {
    const weight = 1 + Math.sqrt(Math.max(1, tile.animalCount));
    const area = unit * unit * weight;
    const width = Math.sqrt(area * tileAspect);
    return { id: tile.id, width, height: area / width, area };
  }).sort((left, right) => right.area - left.area || left.id.localeCompare(right.id));
  const totalArea = layouts.reduce((total, tile) => total + tile.area, 0);
  const targetWidth = Math.sqrt(totalArea * aspect);
  const placed: FamilyOverviewTileBounds[] = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const tile of layouts) {
    if (x > 0 && x + tile.width > targetWidth) {
      x = 0;
      y += rowHeight + gap;
      rowHeight = 0;
    }
    placed.push({ id: tile.id, bounds: { left: x, top: y, right: x + tile.width, bottom: y + tile.height } });
    x += tile.width + gap;
    rowHeight = Math.max(rowHeight, tile.height);
  }
  const right = Math.max(...placed.map((tile) => tile.bounds.right));
  const bottom = Math.max(...placed.map((tile) => tile.bounds.bottom));
  return { tileBounds: placed, bounds: { left: 0, top: 0, right, bottom } };
}

export interface GenealogyComponent {
  id: string;
  representativeId: string;
  animalIds: string[];
}

export interface GenealogyIndex {
  animalById: Map<string, GraphAnimal>;
  relationships: GraphRelationship[];
  parentRelationsByChild: Map<string, GraphRelationship[]>;
  childRelationsByParent: Map<string, GraphRelationship[]>;
  incidentRelationshipsByAnimal: Map<string, GraphRelationship[]>;
  components: GenealogyComponent[];
  componentByAnimal: Map<string, GenealogyComponent>;
  familyComponents: GenealogyComponent[];
  familyComponentByAnimal: Map<string, GenealogyComponent>;
}

const DISPLAY_RELATION_TYPES = new Set<RelationshipType>([
  'biological_mother', 'biological_father', 'foster', 'adoptive', 'social',
]);
const GENERATION_RELATION_TYPES = new Set<RelationshipType>([
  'biological_mother', 'biological_father', 'foster', 'adoptive',
]);

/** Build the graph lookup once; focused layouts then visit only nearby animals and edges. */
export function createGenealogyIndex(animals: GraphAnimal[], relationships: GraphRelationship[]): GenealogyIndex {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const parentRelationsByChild = new Map<string, GraphRelationship[]>();
  const childRelationsByParent = new Map<string, GraphRelationship[]>();
  const incidentRelationshipsByAnimal = new Map<string, GraphRelationship[]>();

  for (const relationship of relationships) {
    if (!animalById.has(relationship.subject) || !animalById.has(relationship.object)) continue;
    const incidentSubject = incidentRelationshipsByAnimal.get(relationship.subject) ?? [];
    incidentSubject.push(relationship);
    incidentRelationshipsByAnimal.set(relationship.subject, incidentSubject);
    if (relationship.object !== relationship.subject) {
      const incidentObject = incidentRelationshipsByAnimal.get(relationship.object) ?? [];
      incidentObject.push(relationship);
      incidentRelationshipsByAnimal.set(relationship.object, incidentObject);
    }
    if (!GENERATION_RELATION_TYPES.has(relationship.type)) continue;
    const parents = parentRelationsByChild.get(relationship.object) ?? [];
    parents.push(relationship);
    parentRelationsByChild.set(relationship.object, parents);
    const children = childRelationsByParent.get(relationship.subject) ?? [];
    children.push(relationship);
    childRelationsByParent.set(relationship.subject, children);
  }

  const { components, componentByAnimal } = buildComponents(animalById, incidentRelationshipsByAnimal, DISPLAY_RELATION_TYPES);
  const { components: familyComponents, componentByAnimal: familyComponentByAnimal } = buildComponents(
    animalById,
    incidentRelationshipsByAnimal,
    GENERATION_RELATION_TYPES,
  );

  return {
    animalById,
    relationships,
    parentRelationsByChild,
    childRelationsByParent,
    incidentRelationshipsByAnimal,
    components,
    componentByAnimal,
    familyComponents,
    familyComponentByAnimal,
  };
}

function buildComponents(
  animalById: Map<string, GraphAnimal>,
  incidentRelationshipsByAnimal: Map<string, GraphRelationship[]>,
  allowedTypes: Set<RelationshipType>,
): { components: GenealogyComponent[]; componentByAnimal: Map<string, GenealogyComponent> } {
  const components: GenealogyComponent[] = [];
  const componentByAnimal = new Map<string, GenealogyComponent>();
  const visited = new Set<string>();
  for (const animalId of [...animalById.keys()].sort()) {
    if (visited.has(animalId)) continue;
    const animalIds: string[] = [];
    const queue = [animalId];
    visited.add(animalId);
    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      animalIds.push(currentId);
      for (const relationship of incidentRelationshipsByAnimal.get(currentId) ?? []) {
        if (!allowedTypes.has(relationship.type)) continue;
        const neighborId = relationship.subject === currentId ? relationship.object : relationship.subject;
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
    animalIds.sort();
    const representativeId = animalIds[0] ?? animalId;
    const component = { id: representativeId, representativeId, animalIds };
    components.push(component);
    for (const memberId of animalIds) componentByAnimal.set(memberId, component);
  }
  return { components, componentByAnimal };
}

export function buildFocusedGenealogy(
  index: GenealogyIndex,
  focusId: string,
  options: GraphOptions = {},
): GenealogyGraph {
  const focus = index.animalById.get(focusId);
  if (!focus) return { nodes: [], edges: [], generationRows: [], truncated: false };

  const allDepths = options.depth === 'all';
  const maxDepth = allDepths ? Number.POSITIVE_INFINITY : Math.max(0, typeof options.depth === 'number' ? options.depth : 2);
  const maxNodes = Math.max(1, options.maxNodes ?? (allDepths ? index.animalById.size : 250));
  const generationById = new Map<string, number>([[focusId, 0]]);
  let truncated = false;

  const walk = (
    initialId: string,
    relationIndex: Map<string, GraphRelationship[]>,
    nextId: (relationship: GraphRelationship) => string,
    generationStep: -1 | 1,
  ) => {
    const queue: Array<{ id: string; distance: number }> = [{ id: initialId, distance: 0 }];
    const visited = new Set([initialId]);
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const current = queue[queueIndex];
      if (current.distance >= maxDepth) continue;
      for (const relationship of relationIndex.get(current.id) ?? []) {
        const neighborId = nextId(relationship);
        if (!index.animalById.has(neighborId)) continue;
        const candidateGeneration = generationStep * (current.distance + 1);
        if (!generationById.has(neighborId)) {
          if (generationById.size >= maxNodes) {
            truncated = true;
            continue;
          }
          generationById.set(neighborId, candidateGeneration);
        }
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({ id: neighborId, distance: current.distance + 1 });
        }
      }
    }
  };

  walk(focusId, index.parentRelationsByChild, (relationship) => relationship.subject, -1);
  walk(focusId, index.childRelationsByParent, (relationship) => relationship.object, 1);

  const grouped = new Map<number, GraphAnimal[]>();
  for (const [id, generation] of generationById) {
    const animal = index.animalById.get(id);
    if (!animal) continue;
    const row = grouped.get(generation) ?? [];
    row.push(animal);
    grouped.set(generation, row);
  }

  const columnGap = Math.max(120, options.columnGap ?? 200);
  const rowGap = Math.max(100, options.rowGap ?? 160);
  const nodes: GraphNode[] = [];
  const generationRows: GenerationRow[] = [];
  for (const generation of [...grouped.keys()].sort((left, right) => left - right)) {
    const row = grouped.get(generation) ?? [];
    row.sort((left, right) => {
      const countryOrder = (left.country_code ?? '').localeCompare(right.country_code ?? '');
      return countryOrder
        || (left.name?.canonical ?? left.id).localeCompare(right.name?.canonical ?? right.id)
        || left.id.localeCompare(right.id);
    });
    generationRows.push({ generation, animalIds: row.map((animal) => animal.id) });
    row.forEach((animal, position) => {
      nodes.push({
        id: animal.id,
        name: animal.name?.canonical ?? animal.id,
        generation,
        x: (position - (row.length - 1) / 2) * columnGap,
        y: generation * rowGap,
        countryCode: animal.country_code ?? null,
        sex: animal.sex ?? null,
        lifeStatus: animal.status ?? null,
        photoConfirmed: animal.photo_confirmed === true,
        photoUrl: animal.photo_url ?? null,
        photoFallbackUrl: animal.photo_fallback_url ?? null,
        photoSourceUrl: animal.photo_source_url ?? null,
        photoCredit: animal.photo_credit ?? null,
        photoLicense: animal.photo_license ?? null,
        photoLicenseUrl: animal.photo_license_url ?? null,
        birthDateLabel: animal.birth_date_label ?? null,
        deathDateLabel: animal.death_date_label ?? null,
        institutionLabel: animal.institution_label ?? null,
        componentId: index.familyComponentByAnimal.get(animal.id)?.id ?? animal.id,
      });
    });
  }

  const includedIds = new Set(generationById.keys());
  const visibleRelationships = new Map<string, GraphRelationship>();
  for (const id of includedIds) {
    for (const relationship of index.incidentRelationshipsByAnimal.get(id) ?? []) {
      if (
        DISPLAY_RELATION_TYPES.has(relationship.type)
        && includedIds.has(relationship.subject)
        && includedIds.has(relationship.object)
      ) visibleRelationships.set(relationship.id, relationship);
    }
  }
  const edges = [...visibleRelationships.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((relationship) => ({
      id: relationship.id,
      from: relationship.subject,
      to: relationship.object,
      type: relationship.type,
      status: relationship.status,
      sourceIds: relationship.source_ids ?? [],
    }));

  const optimized = optimizeGenerationRows(generationRows, edges, new Map(nodes.map((node) => [node.id, node])), 'focused', {
    nodeSpacing: columnGap,
    ...options.optimizer,
  });
  return { nodes: optimized.nodes, edges, generationRows: optimized.generationRows, truncated };
}

/**
 * Lay out the complete indexed corpus. Each ancestry component uses its own
 * oldest-known generation as row zero; no generation is inferred between
 * disconnected components. Parentage levels use longest-path order so every
 * accepted parent edge moves toward a later generation row.
 */
export function buildGlobalGenealogy(index: GenealogyIndex, options: GlobalGraphOptions = {}): GenealogyGraph {
  const grouping = options.grouping === 'country' ? 'country' : 'family';
  const columnGap = Math.max(12, options.columnGap ?? 38);
  const nodeWidth = 176;
  const nodeHeight = 74;
  const rowGap = Math.max(nodeHeight + 20, options.rowGap ?? 220);
  const familyGap = Math.max(12, options.familyGap ?? 32);
  const margin = Math.max(0, options.margin ?? 40);
  const generationById = assignGlobalGenerations(index);
  const orderedIds = new Map<string, string[]>();

  if (grouping === 'family') {
    for (const component of index.components) {
      const rows = new Map<number, string[]>();
      for (const animalId of component.animalIds) {
        const generation = generationById.get(animalId) ?? 0;
        const row = rows.get(generation) ?? [];
        row.push(animalId);
        rows.set(generation, row);
      }
      orderRowsByRelationships(rows, index, generationById, false);
      for (const [generation, ids] of rows) orderedIds.set(`${component.id}\u0000${generation}`, ids);
    }
  } else {
    const rows = new Map<number, string[]>();
    for (const animalId of index.animalById.keys()) {
      const generation = generationById.get(animalId) ?? 0;
      const row = rows.get(generation) ?? [];
      row.push(animalId);
      rows.set(generation, row);
    }
    orderRowsByRelationships(rows, index, generationById, true);
    for (const [generation, ids] of rows) orderedIds.set(`global\u0000${generation}`, ids);
  }

  let nodes: GraphNode[] = [];
  if (grouping === 'family') {
    const groups = [...index.components].sort((left, right) => right.animalIds.length - left.animalIds.length || left.id.localeCompare(right.id));
    for (const component of groups) {
      const componentRows = [...new Set(component.animalIds.map((id) => generationById.get(id) ?? 0))]
        .sort((left, right) => left - right)
        .map((generation) => [generation, orderedIds.get(`${component.id}\u0000${generation}`)
          ?? component.animalIds.filter((id) => (generationById.get(id) ?? 0) === generation)] as const);
      const widest = Math.max(1, ...componentRows.map(([, ids]) => ids.length));
      const groupWidth = widest * nodeWidth + Math.max(0, widest - 1) * columnGap;
      for (const [generation, ids] of componentRows) {
        const rowWidth = ids.length * nodeWidth + Math.max(0, ids.length - 1) * columnGap;
        const rowLeft = margin + (groupWidth - rowWidth) / 2;
        ids.forEach((animalId, position) => {
          const animal = index.animalById.get(animalId);
          if (!animal) return;
          nodes.push(makeGraphNode(
            animal,
            generation,
            rowLeft + nodeWidth / 2 + position * (nodeWidth + columnGap),
            margin + generation * rowGap,
            index.familyComponentByAnimal.get(animalId)?.id ?? animalId,
            component.id,
          ));
        });
      }
    }
  } else {
    let generationLeft = margin;
    const generations = [...new Set([...generationById.values()])].sort((left, right) => left - right);
    for (const generation of generations) {
      const ids = orderedIds.get(`global\u0000${generation}`) ?? [];
      const byCountry = new Map<string, string[]>();
      for (const id of ids) {
        const code = index.animalById.get(id)?.country_code ?? 'ZZ';
        const row = byCountry.get(code) ?? [];
        row.push(id);
        byCountry.set(code, row);
      }
      for (const [countryCode, countryIds] of [...byCountry].sort(([left], [right]) => left.localeCompare(right))) {
        countryIds.forEach((animalId, position) => {
          const animal = index.animalById.get(animalId);
          if (!animal) return;
          nodes.push(makeGraphNode(
            animal,
            generation,
            generationLeft + nodeWidth / 2 + position * (nodeWidth + columnGap),
            margin + generation * rowGap,
            index.familyComponentByAnimal.get(animalId)?.id ?? animalId,
          ));
        });
        generationLeft += countryIds.length * (nodeWidth + columnGap) + familyGap;
      }
      generationLeft += familyGap;
    }
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgesById = new Map<string, GraphRelationship>();
  for (const relationship of index.relationships) {
    if (DISPLAY_RELATION_TYPES.has(relationship.type)
      && nodeById.has(relationship.subject)
      && nodeById.has(relationship.object)) edgesById.set(relationship.id, relationship);
  }
  const edges = [...edgesById.values()].sort((left, right) => left.id.localeCompare(right.id)).map((relationship) => ({
    id: relationship.id,
    from: relationship.subject,
    to: relationship.object,
    type: relationship.type,
    status: relationship.status,
    sourceIds: relationship.source_ids ?? [],
  }));

  let generationRows: GenerationRow[];
  let familyTiles: GenealogyFamilyTile[] | undefined;
  if (grouping === 'family') {
    const localNodes = optimizeFamilyGroups(nodes, edges, index, nodeWidth + columnGap, options.optimizer);
    const packed = packFamilyComponents(localNodes, index, margin, familyGap);
    nodes = packed.nodes;
    familyTiles = packed.tiles;
    generationRows = rowsFromNodes(nodes);
  } else {
    generationRows = rowsFromNodes(nodes);
    const optimized = optimizeGenerationRows(generationRows, edges, new Map(nodes.map((node) => [node.id, node])), 'global', {
      nodeSpacing: nodeWidth + columnGap,
      ...options.optimizer,
    });
    nodes = optimized.nodes;
    generationRows = optimized.generationRows;
  }
  const bounds = familyTiles?.length ? {
    left: Math.min(...familyTiles.map((tile) => tile.bounds.left)),
    top: Math.min(...familyTiles.map((tile) => tile.bounds.top)),
    right: Math.max(...familyTiles.map((tile) => tile.bounds.right)),
    bottom: Math.max(...familyTiles.map((tile) => tile.bounds.bottom)),
  } : nodes.length ? {
    left: Math.min(...nodes.map((node) => node.x - nodeWidth / 2)),
    top: Math.min(...nodes.map((node) => node.y - nodeHeight / 2)),
    right: Math.max(...nodes.map((node) => node.x + nodeWidth / 2)),
    bottom: Math.max(...nodes.map((node) => node.y + nodeHeight / 2)),
  } : { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    nodes,
    edges,
    generationRows,
    truncated: false,
    bounds,
    grouping,
    componentCount: index.familyComponents.length,
    familyTiles,
  };
}

function makeGraphNode(animal: GraphAnimal, generation: number, x: number, y: number, componentId: string, tileId: string | null = null): GraphNode {
  return {
    id: animal.id,
    name: animal.name?.canonical ?? animal.id,
    generation,
    x,
    y,
    countryCode: animal.country_code ?? null,
    sex: animal.sex ?? null,
    lifeStatus: animal.status ?? null,
    photoConfirmed: animal.photo_confirmed === true,
    photoUrl: animal.photo_url ?? null,
    photoFallbackUrl: animal.photo_fallback_url ?? null,
    photoSourceUrl: animal.photo_source_url ?? null,
    photoCredit: animal.photo_credit ?? null,
    photoLicense: animal.photo_license ?? null,
    photoLicenseUrl: animal.photo_license_url ?? null,
    birthDateLabel: animal.birth_date_label ?? null,
    deathDateLabel: animal.death_date_label ?? null,
    institutionLabel: animal.institution_label ?? null,
    componentId,
    tileId,
  };
}

function optimizeFamilyGroups(
  nodes: GraphNode[],
  edges: GraphEdge[],
  index: GenealogyIndex,
  nodeSpacing: number,
  optimizerOptions: LayoutOptimizerOptions | undefined,
): GraphNode[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const optimizedById = new Map<string, GraphNode>();
  for (const component of index.components) {
    const componentNodes = component.animalIds.flatMap((id) => {
      const node = nodeById.get(id);
      return node ? [node] : [];
    });
    if (componentNodes.length < 2) {
      for (const node of componentNodes) optimizedById.set(node.id, node);
      continue;
    }
    const componentIds = new Set(componentNodes.map((node) => node.id));
    const componentEdges = edges.filter((edge) => componentIds.has(edge.from) && componentIds.has(edge.to));
    const componentRows = rowsFromNodes(componentNodes);
    const componentSearch: LayoutOptimizerOptions = componentNodes.length > 500
      ? { maxSweeps: 5, maxSwapEvaluations: 1, maxExactCandidates: 2 }
      : componentNodes.length > 100
        ? { maxSweeps: 3, maxSwapEvaluations: 2, maxExactCandidates: 1 }
        : componentNodes.length > 20
          ? { maxSweeps: 2, maxSwapEvaluations: 2, maxExactCandidates: 1 }
          : componentNodes.length > 1
            ? { maxSweeps: 2, maxSwapEvaluations: 2, maxExactCandidates: 1 }
            : {};
    const optimized = optimizeGenerationRows(componentRows, componentEdges,
      new Map(componentNodes.map((node) => [node.id, node])), 'global', {
        nodeSpacing,
        ...componentSearch,
        ...optimizerOptions,
      });
    for (const node of optimized.nodes) optimizedById.set(node.id, node);
  }
  return nodes.map((node) => optimizedById.get(node.id) ?? node);
}

function packFamilyComponents(
  nodes: GraphNode[],
  index: GenealogyIndex,
  margin: number,
  requestedGap: number,
): { nodes: GraphNode[]; tiles: GenealogyFamilyTile[] } {
  const tilePadding = 40;
  const gap = Math.max(72, requestedGap);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const layouts = index.components.flatMap((component) => {
    const componentNodes = component.animalIds.flatMap((id) => {
      const node = nodeById.get(id);
      return node ? [node] : [];
    });
    if (!componentNodes.length) return [];
    const left = Math.min(...componentNodes.map((node) => node.x - 88));
    const top = Math.min(...componentNodes.map((node) => node.y - 37));
    const right = Math.max(...componentNodes.map((node) => node.x + 88));
    const bottom = Math.max(...componentNodes.map((node) => node.y + 37));
    const width = right - left + tilePadding * 2;
    const height = bottom - top + tilePadding * 2;
    return [{ component, componentNodes, left, top, right, bottom, width, height }];
  }).sort((left, right) => right.width * right.height - left.width * left.height
    || right.height - left.height
    || right.width - left.width
    || left.component.id.localeCompare(right.component.id));
  const totalArea = layouts.reduce((sum, item) => sum + item.width * item.height, 0);
  const targetWidth = Math.max(...layouts.map((item) => item.width), Math.sqrt(Math.max(1, totalArea) * 1.45));
  const packedNodes = new Map<string, GraphNode>();
  const tiles: GenealogyFamilyTile[] = [];
  let cursorX = margin;
  let cursorY = margin;
  let rowHeight = 0;
  for (const item of layouts) {
    if (cursorX > margin && cursorX + item.width > margin + targetWidth) {
      cursorX = margin;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }
    const left = cursorX;
    const top = cursorY;
    const right = left + item.width;
    const bottom = top + item.height;
    const offsetX = left + tilePadding - item.left;
    const offsetY = top + tilePadding - item.top;
    for (const node of item.componentNodes) packedNodes.set(node.id, { ...node, x: node.x + offsetX, y: node.y + offsetY });

    const generationBuckets = new Map<number, GraphNode[]>();
    for (const node of item.componentNodes) {
      const bucket = generationBuckets.get(node.generation) ?? [];
      bucket.push(node);
      generationBuckets.set(node.generation, bucket);
    }
    const generationRows = [...generationBuckets.entries()].map(([generation, row]) => ({
      generation,
      y: (row[0]?.y ?? 0) + offsetY,
      left: Math.min(...row.map((node) => node.x - 88)) + offsetX,
      right: Math.max(...row.map((node) => node.x + 88)) + offsetX,
    })).sort((leftRow, rightRow) => leftRow.generation - rightRow.generation);
    const representative = index.animalById.get(item.component.representativeId);
    const preview = item.componentNodes
      .filter((node) => node.photoConfirmed && node.photoUrl)
      .sort((leftNode, rightNode) => leftNode.name.localeCompare(rightNode.name) || leftNode.id.localeCompare(rightNode.id))[0];
    tiles.push({
      id: item.component.id,
      representativeId: item.component.representativeId,
      label: representative?.name?.canonical ?? item.component.representativeId,
      ...(preview ? {
        previewAnimalName: preview.name,
        previewPhotoUrl: preview.photoUrl ?? undefined,
        previewFallbackUrl: preview.photoFallbackUrl ?? undefined,
        previewCredit: preview.photoCredit ?? undefined,
        previewLicense: preview.photoLicense ?? undefined,
      } : {}),
      animalCount: item.component.animalIds.length,
      familyGroupCount: new Set(item.component.animalIds.map((id) => index.familyComponentByAnimal.get(id)?.id ?? id)).size,
      countryCount: new Set(item.component.animalIds.map((id) => index.animalById.get(id)?.country_code).filter((code): code is string => Boolean(code))).size,
      generationRows,
      bounds: { left, top, right, bottom },
    });
    cursorX = right + gap;
    rowHeight = Math.max(rowHeight, item.height);
  }
  return { nodes: nodes.map((node) => packedNodes.get(node.id) ?? node), tiles };
}

function rowsFromNodes(nodes: GraphNode[]): GenerationRow[] {
  const rows = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const row = rows.get(node.generation) ?? [];
    row.push(node);
    rows.set(node.generation, row);
  }
  return [...rows.keys()].sort((left, right) => left - right).map((generation) => ({
    generation,
    animalIds: (rows.get(generation) ?? []).sort((left, right) => left.x - right.x || left.id.localeCompare(right.id)).map((node) => node.id),
  }));
}

function assignGlobalGenerations(index: GenealogyIndex): Map<string, number> {
  const generationById = new Map<string, number>();
  for (const component of index.familyComponents) {
    const memberIds = new Set(component.animalIds);
    const inDegree = new Map(component.animalIds.map((id) => [id, 0]));
    const childrenByParent = new Map<string, string[]>();
    for (const childId of component.animalIds) {
      for (const relationship of index.parentRelationsByChild.get(childId) ?? []) {
        if (!memberIds.has(relationship.subject)) continue;
        inDegree.set(childId, (inDegree.get(childId) ?? 0) + 1);
        const children = childrenByParent.get(relationship.subject) ?? [];
        children.push(childId);
        childrenByParent.set(relationship.subject, children);
      }
    }
    const ready = component.animalIds.filter((id) => (inDegree.get(id) ?? 0) === 0).sort();
    const componentGeneration = new Map(component.animalIds.map((id) => [id, 0]));
    const processed = new Set<string>();
    for (let cursor = 0; cursor < ready.length; cursor += 1) {
      const parentId = ready[cursor];
      if (!parentId) continue;
      processed.add(parentId);
      const parentGeneration = componentGeneration.get(parentId) ?? 0;
      for (const childId of childrenByParent.get(parentId) ?? []) {
        componentGeneration.set(childId, Math.max(componentGeneration.get(childId) ?? 0, parentGeneration + 1));
        const remainingParents = (inDegree.get(childId) ?? 0) - 1;
        inDegree.set(childId, remainingParents);
        if (remainingParents === 0) ready.push(childId);
      }
    }
    const unresolved = component.animalIds.filter((id) => !processed.has(id));
    if (unresolved.length) throw new Error(`Cannot assign generations because the parentage graph contains a cycle: ${unresolved.join(', ')}`);
    for (const [animalId, generation] of componentGeneration) generationById.set(animalId, generation);
  }
  for (const animalId of index.animalById.keys()) if (!generationById.has(animalId)) generationById.set(animalId, 0);
  return generationById;
}

function orderRowsByRelationships(
  rows: Map<number, string[]>,
  index: GenealogyIndex,
  generationById: Map<string, number>,
  keepCountriesTogether: boolean,
): void {
  const compareNames = (leftId: string, rightId: string) => {
    const left = index.animalById.get(leftId);
    const right = index.animalById.get(rightId);
    if (keepCountriesTogether) {
      const countryOrder = (left?.country_code ?? 'ZZ').localeCompare(right?.country_code ?? 'ZZ');
      if (countryOrder) return countryOrder;
    }
    return (left?.name?.canonical ?? leftId).localeCompare(right?.name?.canonical ?? rightId) || leftId.localeCompare(rightId);
  };
  const generations = [...rows.keys()].sort((left, right) => left - right);
  for (const ids of rows.values()) ids.sort(compareNames);
  const rankById = new Map<string, number>();
  const updateRanks = (ids: string[]) => ids.forEach((id, position) => rankById.set(id, position / Math.max(1, ids.length - 1)));
  for (const ids of rows.values()) updateRanks(ids);
  for (let pass = 0; pass < 4; pass += 1) {
    const scan = pass % 2 === 0 ? generations : [...generations].reverse();
    for (const generation of scan) {
      const ids = rows.get(generation);
      if (!ids || ids.length < 2) continue;
      const baselineRank = new Map(ids.map((id, position) => [id, position]));
      const score = (id: string) => {
        const neighbors: number[] = [];
        for (const relationship of index.incidentRelationshipsByAnimal.get(id) ?? []) {
          if (!GENERATION_RELATION_TYPES.has(relationship.type)) continue;
          const neighbor = relationship.subject === id ? relationship.object : relationship.subject;
          const neighborGeneration = generationById.get(neighbor);
          const rank = rankById.get(neighbor);
          if (neighborGeneration !== undefined && neighborGeneration !== generation && rank !== undefined) neighbors.push(rank);
        }
        return neighbors.length ? neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length : null;
      };
      ids.sort((left, right) => {
        if (keepCountriesTogether) {
          const countryOrder = (index.animalById.get(left)?.country_code ?? 'ZZ')
            .localeCompare(index.animalById.get(right)?.country_code ?? 'ZZ');
          if (countryOrder) return countryOrder;
        }
        const leftScore = score(left);
        const rightScore = score(right);
        if (leftScore !== null && rightScore !== null && Math.abs(leftScore - rightScore) > 1e-8) return leftScore - rightScore;
        if (leftScore !== null && rightScore === null) return -1;
        if (leftScore === null && rightScore !== null) return 1;
        return compareNames(left, right) || (baselineRank.get(left) ?? 0) - (baselineRank.get(right) ?? 0);
      });
      updateRanks(ids);
    }
  }
}

/** Backward-compatible helper for callers that do not retain a prebuilt index. */
export function buildGenealogy(
  animals: GraphAnimal[],
  relationships: GraphRelationship[],
  focusId: string,
  options: GraphOptions = {},
): GenealogyGraph {
  return buildFocusedGenealogy(createGenealogyIndex(animals, relationships), focusId, options);
}
