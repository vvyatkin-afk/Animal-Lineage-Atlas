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

  const components: GenealogyComponent[] = [];
  const componentByAnimal = new Map<string, GenealogyComponent>();
  const visited = new Set<string>();
  for (const animalId of animalById.keys()) {
    if (visited.has(animalId)) continue;
    const animalIds: string[] = [];
    const queue = [animalId];
    visited.add(animalId);
    for (let index = 0; index < queue.length; index += 1) {
      const currentId = queue[index];
      animalIds.push(currentId);
      for (const relationship of incidentRelationshipsByAnimal.get(currentId) ?? []) {
        if (!DISPLAY_RELATION_TYPES.has(relationship.type)) continue;
        const neighborId = relationship.subject === currentId ? relationship.object : relationship.subject;
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);
        queue.push(neighborId);
      }
    }
    const component = { id: animalId, representativeId: animalId, animalIds };
    components.push(component);
    for (const memberId of animalIds) componentByAnimal.set(memberId, component);
  }

  return {
    animalById,
    relationships,
    parentRelationsByChild,
    childRelationsByParent,
    incidentRelationshipsByAnimal,
    components,
    componentByAnimal,
  };
}

export function buildFocusedGenealogy(
  index: GenealogyIndex,
  focusId: string,
  options: GraphOptions = {},
): GenealogyGraph {
  const focus = index.animalById.get(focusId);
  if (!focus) return { nodes: [], edges: [], generationRows: [], truncated: false };

  const maxDepth = Math.max(0, options.depth ?? 2);
  const maxNodes = Math.max(1, options.maxNodes ?? 250);
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

  return { nodes, edges, generationRows, truncated };
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
