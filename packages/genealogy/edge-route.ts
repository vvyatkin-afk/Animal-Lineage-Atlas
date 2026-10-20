import type { GraphEdge, GraphNode } from './layout.ts';

export type GenealogyRouteMode = 'focused' | 'global';
export type RoutePoint = { x: number; y: number };
export type RouteBounds = { left: number; top: number; right: number; bottom: number };

export interface GenealogyEdgeRoute {
  id: string;
  edge: GraphEdge;
  pathType: 'line' | 'cubic';
  start: RoutePoint;
  control1: RoutePoint;
  control2: RoutePoint;
  end: RoutePoint;
  points: RoutePoint[];
  length: number;
  bounds: RouteBounds;
}

export const EDGE_ROUTE_SAMPLE_COUNT = 24;
export const GENEALOGY_NODE_WIDTH = 176;
export const GENEALOGY_NODE_HEIGHT = 74;

function bezierPoint(points: [RoutePoint, RoutePoint, RoutePoint, RoutePoint], t: number): RoutePoint {
  const [start, control1, control2, end] = points;
  const inverse = 1 - t;
  const a = inverse ** 3;
  const b = 3 * inverse ** 2 * t;
  const c = 3 * inverse * t ** 2;
  const d = t ** 3;
  return {
    x: a * start.x + b * control1.x + c * control2.x + d * end.x,
    y: a * start.y + b * control1.y + c * control2.y + d * end.y,
  };
}

function routePoints(pathType: GenealogyEdgeRoute['pathType'], start: RoutePoint, control1: RoutePoint, control2: RoutePoint, end: RoutePoint) {
  if (pathType === 'line') return [start, end];
  const controls: [RoutePoint, RoutePoint, RoutePoint, RoutePoint] = [start, control1, control2, end];
  return Array.from({ length: EDGE_ROUTE_SAMPLE_COUNT + 1 }, (_, index) =>
    bezierPoint(controls, index / EDGE_ROUTE_SAMPLE_COUNT));
}

function boundsFor(points: RoutePoint[]): RouteBounds {
  return points.reduce<RouteBounds>((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    top: Math.min(bounds.top, point.y),
    right: Math.max(bounds.right, point.x),
    bottom: Math.max(bounds.bottom, point.y),
  }), { left: Number.POSITIVE_INFINITY, top: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY });
}

function polylineLength(points: RoutePoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current) length += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return length;
}

/** Construct the exact centerline path used by the focused SVG and global canvas renderers. */
export function routeGenealogyEdge(
  edge: GraphEdge,
  nodesById: ReadonlyMap<string, GraphNode>,
  mode: GenealogyRouteMode,
): GenealogyEdgeRoute | null {
  const parent = nodesById.get(edge.from);
  const child = nodesById.get(edge.to);
  if (!parent || !child) return null;

  let pathType: GenealogyEdgeRoute['pathType'] = 'cubic';
  let start: RoutePoint;
  let end: RoutePoint;
  let control1: RoutePoint;
  let control2: RoutePoint;

  if (mode === 'focused' && edge.type === 'social') {
    pathType = 'line';
    start = { x: parent.x, y: parent.y };
    end = { x: child.x, y: child.y };
    control1 = start;
    control2 = end;
  } else if (edge.type === 'social') {
    start = { x: parent.x, y: parent.y };
    end = { x: child.x, y: child.y };
    const midpointX = (parent.x + child.x) / 2;
    const midpointY = (parent.y + child.y) / 2;
    const lift = Math.max(GENEALOGY_NODE_HEIGHT, Math.abs(child.x - parent.x) * 0.08);
    control1 = { x: midpointX, y: midpointY - lift };
    control2 = { x: midpointX, y: midpointY - lift };
  } else {
    start = { x: parent.x, y: parent.y + GENEALOGY_NODE_HEIGHT / 2 };
    end = { x: child.x, y: child.y - GENEALOGY_NODE_HEIGHT / 2 };
    const midpointY = (start.y + end.y) / 2;
    control1 = { x: start.x, y: midpointY };
    control2 = { x: end.x, y: midpointY };
  }

  const points = routePoints(pathType, start, control1, control2, end);
  const routeBounds = boundsFor(pathType === 'cubic' ? [start, control1, control2, end] : points);
  const padding = 4;
  return {
    id: edge.id,
    edge,
    pathType,
    start,
    control1,
    control2,
    end,
    points,
    length: polylineLength(points),
    bounds: {
      left: routeBounds.left - padding,
      top: routeBounds.top - padding,
      right: routeBounds.right + padding,
      bottom: routeBounds.bottom + padding,
    },
  };
}
