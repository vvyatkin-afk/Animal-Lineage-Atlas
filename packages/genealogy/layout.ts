export type RelationshipStatus = 'confirmed' | 'probable' | 'disputed' | 'unknown';
export type RelationshipType = 'biological_mother' | 'biological_father' | 'foster' | 'adoptive' | 'social';

export interface GraphAnimal {
  id: string;
  name?: { canonical?: string };
  country_code?: string | null;
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
  depth?: number;
  maxNodes?: number;
  columnGap?: number;
  rowGap?: number;
}

export interface GraphNode {
  id: string;
  name: string;
  generation: number;
  x: number;
  y: number;
  countryCode: string | null;
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
}

const DISPLAY_RELATION_TYPES = new Set<RelationshipType>([
  'biological_mother', 'biological_father', 'foster', 'adoptive', 'social',
]);
const GENERATION_RELATION_TYPES = new Set<RelationshipType>([
  'biological_mother', 'biological_father', 'foster', 'adoptive',
]);

export function buildGenealogy(
  animals: GraphAnimal[],
  relationships: GraphRelationship[],
  focusId: string,
  options: GraphOptions = {},
): GenealogyGraph {
  const animalById = new Map(animals.map((animal) => [animal.id, animal]));
  const focus = animalById.get(focusId);
  if (!focus) return { nodes: [], edges: [], generationRows: [], truncated: false };

  const maxDepth = Math.max(0, options.depth ?? 2);
  const maxNodes = Math.max(1, options.maxNodes ?? 250);
  const parentRelations = new Map<string, GraphRelationship[]>();
  const childRelations = new Map<string, GraphRelationship[]>();
  for (const relation of relationships) {
    if (!GENERATION_RELATION_TYPES.has(relation.type)) continue;
    const childEdges = parentRelations.get(relation.object) ?? [];
    childEdges.push(relation);
    parentRelations.set(relation.object, childEdges);
    const parentEdges = childRelations.get(relation.subject) ?? [];
    parentEdges.push(relation);
    childRelations.set(relation.subject, parentEdges);
  }

  const generationById = new Map<string, number>([[focusId, 0]]);
  let truncated = false;

  const walk = (
    initialId: string,
    initialGeneration: number,
    relationIndex: Map<string, GraphRelationship[]>,
    nextId: (relation: GraphRelationship) => string,
    generationStep: -1 | 1,
  ) => {
    const queue: Array<{ id: string; distance: number }> = [{ id: initialId, distance: 0 }];
    const visited = new Set([initialId]);
    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const current = queue[queueIndex];
      if (current.distance >= maxDepth) continue;
      for (const relation of relationIndex.get(current.id) ?? []) {
        const neighborId = nextId(relation);
        if (!animalById.has(neighborId)) continue;
        const candidateGeneration = initialGeneration + generationStep * (current.distance + 1);
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

  walk(focusId, 0, parentRelations, (relation) => relation.subject, -1);
  walk(focusId, 0, childRelations, (relation) => relation.object, 1);

  const grouped = new Map<number, GraphAnimal[]>();
  for (const [id, generation] of generationById) {
    const animal = animalById.get(id);
    if (!animal) continue;
    const row = grouped.get(generation) ?? [];
    row.push(animal);
    grouped.set(generation, row);
  }

  const columnGap = Math.max(120, options.columnGap ?? 200);
  const rowGap = Math.max(100, options.rowGap ?? 160);
  const nodes: GraphNode[] = [];
  const generationRows: GenerationRow[] = [];
  for (const generation of [...grouped.keys()].sort((a, b) => a - b)) {
    const row = grouped.get(generation) ?? [];
    row.sort((left, right) => {
      const countryOrder = (left.country_code ?? '').localeCompare(right.country_code ?? '');
      return countryOrder || (left.name?.canonical ?? left.id).localeCompare(right.name?.canonical ?? right.id) || left.id.localeCompare(right.id);
    });
    generationRows.push({ generation, animalIds: row.map((animal) => animal.id) });
    row.forEach((animal, index) => {
      nodes.push({
        id: animal.id,
        name: animal.name?.canonical ?? animal.id,
        generation,
        x: (index - (row.length - 1) / 2) * columnGap,
        y: generation * rowGap,
        countryCode: animal.country_code ?? null,
      });
    });
  }

  const includedIds = new Set(nodes.map((node) => node.id));
  const edges = relationships
    .filter((relation) => includedIds.has(relation.subject) && includedIds.has(relation.object) && DISPLAY_RELATION_TYPES.has(relation.type))
    .map((relation) => ({
      id: relation.id,
      from: relation.subject,
      to: relation.object,
      type: relation.type,
      status: relation.status,
      sourceIds: [...(relation.source_ids ?? [])],
    }));

  return { nodes, edges, generationRows, truncated };
}
