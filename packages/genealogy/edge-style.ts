import type { RelationshipStatus, RelationshipType } from './layout.ts';

const RELATIONSHIP_STROKES: Record<RelationshipType, string> = {
  biological_mother: '#9b6f55',
  biological_father: '#53768a',
  foster: '#7c6695',
  adoptive: '#7c6695',
  social: '#87978d',
};

const STATUS_DASHES: Record<RelationshipStatus, number[]> = {
  confirmed: [],
  probable: [5, 4],
  disputed: [8, 4],
  unknown: [2, 4],
};

export interface RelationshipEdgeStyle {
  stroke: string;
  dashArray: number[];
}

/** Relationship type controls color; confidence controls the independent line pattern. */
export function relationshipEdgeStyle(
  type: RelationshipType,
  status: RelationshipStatus,
  scale = 1,
): RelationshipEdgeStyle {
  return {
    stroke: RELATIONSHIP_STROKES[type],
    dashArray: STATUS_DASHES[status].map((length) => length * scale),
  };
}
