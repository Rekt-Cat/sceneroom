import type { ShapeMesh } from "./modifiers";
import { MAX_SUBDIVIDE_LEVELS } from "./scene";
import { edgeBetween, edgeVertices, type Topology } from "./topology";

/**
 * Edge creases: marking an edge as sharp so that smoothing (the Smooth modifier) keeps it crisp instead of
 * rounding it off. A crease is stored with the mesh as a pair of points (the two ends of the edge) and a value
 * from 0 (not creased) to 1 (fully sharp). Points on the same spot count as one, so a crease may name any of the
 * points at each end.
 *
 * A fully sharp crease stays sharp through every level of smoothing; a value in between is "semi-sharp": it
 * stays sharp for part of the levels and then softens (the Pixar rule), so 0.5 is a gently softened edge.
 */
export type Crease = { a: number; b: number; value: number };

/** Most creases one mesh may have. */
export const MAX_CREASES = 200_000;

/** How many levels of smoothing a fully sharp crease (value 1) survives. */
export const FULL_SHARPNESS_LEVELS = MAX_SUBDIVIDE_LEVELS;

/** What was wrong with a list of creases, or null if it can be stored with a mesh of `points` points. */
export function checkCreases(
  creases: readonly Crease[],
  points: number,
): string | null {
  if (creases.length > MAX_CREASES) {
    return `it has ${creases.length.toLocaleString("en-US")} creases; the limit is ${MAX_CREASES.toLocaleString("en-US")}.`;
  }
  for (const crease of creases) {
    if (!Number.isInteger(crease.a) || !Number.isInteger(crease.b)) {
      return "a crease names a point that is not a whole number.";
    }
    if (
      crease.a < 0 ||
      crease.b < 0 ||
      crease.a >= points ||
      crease.b >= points
    ) {
      return "a crease uses a point that does not exist.";
    }
    if (crease.a === crease.b) return "a crease joins a point to itself.";
    if (!(crease.value >= 0 && crease.value <= 1)) {
      return "a crease value is not between 0 and 1.";
    }
  }
  return null;
}

/** The sharpness (in levels of smoothing) of each edge of a topology, from a mesh's creases. 0 where there is none. */
export function edgeSharpness(
  topology: Topology,
  creases: readonly Crease[] | undefined,
): Float64Array {
  const sharp = new Float64Array(topology.edgeFaces.length);
  for (const crease of creases ?? []) {
    const a = topology.vertexOf[crease.a];
    const b = topology.vertexOf[crease.b];
    if (a === undefined || b === undefined || a === b) continue;
    const edge = edgeBetween(topology, a, b);
    if (edge === -1) continue;
    sharp[edge] = Math.max(sharp[edge]!, crease.value * FULL_SHARPNESS_LEVELS);
  }
  return sharp;
}

/** The crease value (0 to 1) of every edge of a topology. */
export function edgeCreaseValues(
  topology: Topology,
  creases: readonly Crease[] | undefined,
): Float64Array {
  const values = edgeSharpness(topology, creases);
  for (let e = 0; e < values.length; e++)
    values[e] = values[e]! / FULL_SHARPNESS_LEVELS;
  return values;
}

/**
 * The creases after setting the given edges to `value` (0 removes a crease). Other creases are kept; a crease
 * already on one of the edges is replaced, whichever points it named. Returns a new list.
 */
export function setCreases(
  mesh: ShapeMesh,
  topology: Topology,
  edges: readonly number[],
  value: number,
): Crease[] {
  const clamped = Math.min(1, Math.max(0, value));
  const target = new Set(edges);
  const kept = (mesh.creases ?? []).filter((crease) => {
    const a = topology.vertexOf[crease.a];
    const b = topology.vertexOf[crease.b];
    if (a === undefined || b === undefined) return false;
    const edge = edgeBetween(topology, a, b);
    // A crease that is no longer on an edge of the mesh is dropped; one on a chosen edge is replaced
    return edge !== -1 && !target.has(edge);
  });
  if (clamped === 0) return kept;
  const made = edges.map((edge): Crease => {
    const [a, b] = edgeVertices(topology, edge);
    return {
      a: topology.vertexPoints[a]![0]!,
      b: topology.vertexPoints[b]![0]!,
      value: clamped,
    };
  });
  return [...kept, ...made];
}

/** The creases after the points were renumbered (`newNumber[old]`, or -1 if the point is gone); creases on a gone point are dropped. */
export function remapCreases(
  creases: readonly Crease[] | undefined,
  newNumber: ArrayLike<number>,
): Crease[] | undefined {
  if (!creases || creases.length === 0) return undefined;
  const kept: Crease[] = [];
  for (const crease of creases) {
    const a = newNumber[crease.a];
    const b = newNumber[crease.b];
    if (a === undefined || b === undefined || a < 0 || b < 0 || a === b)
      continue;
    kept.push({ a, b, value: crease.value });
  }
  return kept.length > 0 ? kept : undefined;
}

/** True if two crease lists say the same thing (order does not matter). */
export function sameCreases(
  a: readonly Crease[] | undefined,
  b: readonly Crease[] | undefined,
): boolean {
  const key = (c: Crease) =>
    `${Math.min(c.a, c.b)}-${Math.max(c.a, c.b)}:${Math.round(c.value * 255)}`;
  const left = (a ?? []).map(key).sort();
  const right = (b ?? []).map(key).sort();
  return left.length === right.length && left.every((k, i) => k === right[i]);
}
