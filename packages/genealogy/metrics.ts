import {
  EDGE_ROUTE_SAMPLE_COUNT,
  GENEALOGY_NODE_HEIGHT,
  GENEALOGY_NODE_WIDTH,
  routeGenealogyEdge,
  type GenealogyRouteMode,
  type RouteBounds,
  type RoutePoint,
  type GenealogyEdgeRoute,
} from './edge-route.ts';
import type { GenealogyGraph, GraphNode } from './layout.ts';

const GENERATION_EDGE_TYPES = new Set(['biological_mother', 'biological_father', 'foster', 'adoptive']);
const EPSILON = 1e-8;

export interface LayoutMetrics {
  nodeCount: number;
  edgeCount: number;
  routeCount: number;
  crossingPairs: number;
  samplesPerCurve: number;
  totalRouteLength: number;
  nodeOverlapPairs: number;
  edgeNodeCollisionPairs: number;
  generationOrderViolations: number;
  parentOrderViolations: number;
  bounds: RouteBounds & { width: number; height: number };
  generationWidths: Array<{ generation: number; width: number }>;
}

function boxesOverlap(left: RouteBounds, right: RouteBounds): boolean {
  return left.left <= right.right && left.right >= right.left
    && left.top <= right.bottom && left.bottom >= right.top;
}

function segmentBounds(start: RoutePoint, end: RoutePoint): RouteBounds {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

function cross(a: RoutePoint, b: RoutePoint, c: RoutePoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Return the segment parameters for a non-parallel intersection, including polyline joints. */
function segmentIntersection(startA: RoutePoint, endA: RoutePoint, startB: RoutePoint, endB: RoutePoint): { alongA: number; alongB: number } | null {
  const directionA = { x: endA.x - startA.x, y: endA.y - startA.y };
  const directionB = { x: endB.x - startB.x, y: endB.y - startB.y };
  const denominator = directionA.x * directionB.y - directionA.y * directionB.x;
  if (Math.abs(denominator) <= EPSILON) return null;
  const offset = { x: startB.x - startA.x, y: startB.y - startA.y };
  const alongA = (offset.x * directionB.y - offset.y * directionB.x) / denominator;
  const alongB = (offset.x * directionA.y - offset.y * directionA.x) / denominator;
  if (alongA < -EPSILON || alongA > 1 + EPSILON || alongB < -EPSILON || alongB > 1 + EPSILON) return null;
  return { alongA, alongB };
}

function pointAtPolyline(points: RoutePoint[], position: number): RoutePoint | null {
  if (!points.length) return null;
  const bounded = Math.max(0, Math.min(points.length - 1, position));
  const index = Math.min(points.length - 2, Math.floor(bounded));
  const start = points[index];
  const end = points[index + 1];
  if (!start || !end) return points[0] ?? null;
  const fraction = bounded - index;
  return { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
}

function pathCrossesAt(
  left: GenealogyEdgeRoute,
  leftPosition: number,
  right: GenealogyEdgeRoute,
  rightPosition: number,
): boolean {
  const lastLeftPosition = left.points.length - 1;
  const lastRightPosition = right.points.length - 1;
  if (leftPosition <= EPSILON || leftPosition >= lastLeftPosition - EPSILON
    || rightPosition <= EPSILON || rightPosition >= lastRightPosition - EPSILON) return false;
  const neighborhood = 0.5;
  const leftBefore = pointAtPolyline(left.points, leftPosition - neighborhood);
  const leftAfter = pointAtPolyline(left.points, leftPosition + neighborhood);
  const rightBefore = pointAtPolyline(right.points, rightPosition - neighborhood);
  const rightAfter = pointAtPolyline(right.points, rightPosition + neighborhood);
  if (!leftBefore || !leftAfter || !rightBefore || !rightAfter) return false;
  const leftSideBefore = cross(rightBefore, rightAfter, leftBefore);
  const leftSideAfter = cross(rightBefore, rightAfter, leftAfter);
  const rightSideBefore = cross(leftBefore, leftAfter, rightBefore);
  const rightSideAfter = cross(leftBefore, leftAfter, rightAfter);
  return leftSideBefore * leftSideAfter < -EPSILON
    && rightSideBefore * rightSideAfter < -EPSILON;
}

function routeIntersectsRoute(left: GenealogyEdgeRoute, right: GenealogyEdgeRoute): boolean {
  if (!boxesOverlap(left.bounds, right.bounds)) return false;
  for (let leftIndex = 1; leftIndex < left.points.length; leftIndex += 1) {
    const leftStart = left.points[leftIndex - 1];
    const leftEnd = left.points[leftIndex];
    if (!leftStart || !leftEnd) continue;
    const leftSegmentBounds = segmentBounds(leftStart, leftEnd);
    for (let rightIndex = 1; rightIndex < right.points.length; rightIndex += 1) {
      const rightStart = right.points[rightIndex - 1];
      const rightEnd = right.points[rightIndex];
      if (!rightStart || !rightEnd || !boxesOverlap(leftSegmentBounds, segmentBounds(rightStart, rightEnd))) continue;
      const intersection = segmentIntersection(leftStart, leftEnd, rightStart, rightEnd);
      if (!intersection) continue;
      const leftPosition = leftIndex - 1 + intersection.alongA;
      const rightPosition = rightIndex - 1 + intersection.alongB;
      if (pathCrossesAt(left, leftPosition, right, rightPosition)) return true;
    }
  }
  return false;
}

function segmentIntersectsRectangle(start: RoutePoint, end: RoutePoint, bounds: RouteBounds): boolean {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  let minimum = 0;
  let maximum = 1;
  const constraints: Array<[number, number]> = [
    [-deltaX, start.x - bounds.left],
    [deltaX, bounds.right - start.x],
    [-deltaY, start.y - bounds.top],
    [deltaY, bounds.bottom - start.y],
  ];
  for (const [denominator, numerator] of constraints) {
    if (Math.abs(denominator) <= EPSILON) {
      if (numerator < 0) return false;
      continue;
    }
    const ratio = numerator / denominator;
    if (denominator < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return false;
  }
  return true;
}

function nodeBounds(node: GraphNode): RouteBounds {
  return {
    left: node.x - GENEALOGY_NODE_WIDTH / 2,
    top: node.y - GENEALOGY_NODE_HEIGHT / 2,
    right: node.x + GENEALOGY_NODE_WIDTH / 2,
    bottom: node.y + GENEALOGY_NODE_HEIGHT / 2,
  };
}

function countNodeOverlaps(nodes: GraphNode[]): number {
  const rows = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const row = rows.get(node.generation) ?? [];
    row.push(node);
    rows.set(node.generation, row);
  }
  let count = 0;
  for (const row of rows.values()) {
    row.sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));
    for (let leftIndex = 0; leftIndex < row.length; leftIndex += 1) {
      const left = row[leftIndex];
      if (!left) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < row.length; rightIndex += 1) {
        const right = row[rightIndex];
        if (!right || right.x - left.x >= GENEALOGY_NODE_WIDTH) break;
        if (Math.abs(right.y - left.y) < GENEALOGY_NODE_HEIGHT) count += 1;
      }
    }
  }
  return count;
}

function measureBounds(nodes: GraphNode[]): { bounds: LayoutMetrics['bounds']; generationWidths: LayoutMetrics['generationWidths'] } {
  if (!nodes.length) {
    return { bounds: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }, generationWidths: [] };
  }
  const rectangles = nodes.map(nodeBounds);
  const left = Math.min(...rectangles.map((bounds) => bounds.left));
  const top = Math.min(...rectangles.map((bounds) => bounds.top));
  const right = Math.max(...rectangles.map((bounds) => bounds.right));
  const bottom = Math.max(...rectangles.map((bounds) => bounds.bottom));
  const rows = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const row = rows.get(node.generation) ?? [];
    row.push(node);
    rows.set(node.generation, row);
  }
  const generationWidths = [...rows.entries()].map(([generation, row]) => {
    const bounds = row.map(nodeBounds);
    return {
      generation,
      width: Math.max(...bounds.map((item) => item.right)) - Math.min(...bounds.map((item) => item.left)),
    };
  }).sort((a, b) => a.generation - b.generation);
  return { bounds: { left, top, right, bottom, width: right - left, height: bottom - top }, generationWidths };
}

/** Measure centerline geometry shared by the renderer, diagnostics, and release reports. */
export function measureGenealogyGraph(graph: GenealogyGraph, mode: GenealogyRouteMode): LayoutMetrics {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const routes = graph.edges.flatMap((edge) => {
    const route = routeGenealogyEdge(edge, nodesById, mode);
    return route ? [route] : [];
  }).sort((left, right) => left.bounds.left - right.bounds.left || left.id.localeCompare(right.id));

  let crossingPairs = 0;
  for (let leftIndex = 0; leftIndex < routes.length; leftIndex += 1) {
    const left = routes[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < routes.length; rightIndex += 1) {
      const right = routes[rightIndex];
      if (!right || right.bounds.left > left.bounds.right) break;
      if (left.edge.from === right.edge.from || left.edge.from === right.edge.to
        || left.edge.to === right.edge.from || left.edge.to === right.edge.to) continue;
      if (routeIntersectsRoute(left, right)) crossingPairs += 1;
    }
  }

  let edgeNodeCollisionPairs = 0;
  for (const route of routes) {
    for (const node of graph.nodes) {
      if (node.id === route.edge.from || node.id === route.edge.to) continue;
      const rectangle = nodeBounds(node);
      if (!boxesOverlap(route.bounds, rectangle)) continue;
      let collision = false;
      for (let index = 1; index < route.points.length; index += 1) {
        const start = route.points[index - 1];
        const end = route.points[index];
        if (start && end && segmentIntersectsRectangle(start, end, rectangle)) {
          collision = true;
          break;
        }
      }
      if (collision) edgeNodeCollisionPairs += 1;
    }
  }

  const generationOrderViolations = graph.edges.filter((edge) => {
    if (!GENERATION_EDGE_TYPES.has(edge.type)) return false;
    const parent = nodesById.get(edge.from);
    const child = nodesById.get(edge.to);
    return Boolean(parent && child && parent.generation >= child.generation);
  }).length;

  let parentOrderViolations = 0;
  if (mode === 'focused') {
    const parentsByChild = new Map<string, { mother?: GraphNode; father?: GraphNode }>();
    for (const edge of graph.edges) {
      if (edge.type !== 'biological_mother' && edge.type !== 'biological_father') continue;
      const parent = nodesById.get(edge.from);
      if (!parent) continue;
      const parents = parentsByChild.get(edge.to) ?? {};
      if (edge.type === 'biological_mother') parents.mother = parent;
      else parents.father = parent;
      parentsByChild.set(edge.to, parents);
    }
    for (const parents of parentsByChild.values()) {
      if (parents.mother && parents.father && parents.mother.x >= parents.father.x) parentOrderViolations += 1;
    }
  }

  const geometry = measureBounds(graph.nodes);
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    routeCount: routes.length,
    crossingPairs,
    samplesPerCurve: EDGE_ROUTE_SAMPLE_COUNT,
    totalRouteLength: routes.reduce((total, route) => total + route.length, 0),
    nodeOverlapPairs: countNodeOverlaps(graph.nodes),
    edgeNodeCollisionPairs,
    generationOrderViolations,
    parentOrderViolations,
    ...geometry,
  };
}
