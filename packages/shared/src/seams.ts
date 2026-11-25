import type { ShapeMesh } from "./modifiers";
import { edgeBetween, edgeVertices, type Topology } from "./topology";

/**
 * Seams: edges marked as the cuts along which a surface is laid flat for a UV map (like the seams of a shirt). A
 * seam is stored with the mesh as a pair of points (the two ends of the edge). Points on the same spot count as
 * one, so a seam may name any of the points at each end. See docs/editor/UVS-AND-SEAMS.md.
 */
export type Seam = { a: number; b: number };

/** `{ seams }` for a mesh that has some, and nothing for one that has none (so a mesh without seams gets no empty field). */
export function seamsOf(seams: readonly Seam[] | undefined): {
  seams?: readonly Seam[];
} {
  return seams && seams.length > 0 ? { seams } : {};
}

/** Most seams one mesh may have. */
export const MAX_SEAMS = 200_000;

/** What was wrong with a list of seams, or null if it can be stored with a mesh of `points` points. */
export function checkSeams(
  seams: readonly Seam[],
  points: number,
): string | null {
  if (seams.length > MAX_SEAMS) {
    return `it has ${seams.length.toLocaleString("en-US")} seams; the limit is ${MAX_SEAMS.toLocaleString("en-US")}.`;
  }
  for (const seam of seams) {
    if (!Number.isInteger(seam.a) || !Number.isInteger(seam.b)) {
      return "a seam names a point that is not a whole number.";
    }
    if (seam.a < 0 || seam.b < 0 || seam.a >= points || seam.b >= points) {
      return "a seam uses a point that does not exist.";
    }
    if (seam.a === seam.b) return "a seam joins a point to itself.";
  }
  return null;
}

/** Which edges of a topology are seams (1) and which are not (0). */
export function edgeSeams(
  topology: Topology,
  seams: readonly Seam[] | undefined,
): Uint8Array {
  const marked = new Uint8Array(topology.edgeFaces.length);
  for (const seam of seams ?? []) {
    const a = topology.vertexOf[seam.a];
    const b = topology.vertexOf[seam.b];
    if (a === undefined || b === undefined || a === b) continue;
    const edge = edgeBetween(topology, a, b);
    if (edge !== -1) marked[edge] = 1;
  }
  return marked;
}

/**
 * The seams after marking the given edges as seams (`on`), or clearing them. Other seams are kept; seams that are
 * not on an edge of the mesh any more are dropped. Returns a new list.
 */
export function setSeams(
  mesh: ShapeMesh,
  topology: Topology,
  edges: readonly number[],
  on: boolean,
): Seam[] {
  const target = new Set(edges);
  const kept = (mesh.seams ?? []).filter((seam) => {
    const a = topology.vertexOf[seam.a];
    const b = topology.vertexOf[seam.b];
    if (a === undefined || b === undefined) return false;
    const edge = edgeBetween(topology, a, b);
    return edge !== -1 && !target.has(edge);
  });
  if (!on) return kept;
  const made = edges.map((edge): Seam => {
    const [a, b] = edgeVertices(topology, edge);
    return {
      a: topology.vertexPoints[a]![0]!,
      b: topology.vertexPoints[b]![0]!,
    };
  });
  return [...kept, ...made];
}

/** True if two lists of seams are the same edges (in any order, whichever points they name). */
export function sameSeams(
  topology: Topology,
  a: readonly Seam[] | undefined,
  b: readonly Seam[] | undefined,
): boolean {
  const left = edgeSeams(topology, a);
  const right = edgeSeams(topology, b);
  return left.every((value, e) => value === right[e]);
}

/** The seams after the points were renumbered (`newNumber[old]`, or -1 if the point is gone); seams on a gone point are dropped. */
export function remapSeams(
  seams: readonly Seam[] | undefined,
  newNumber: ArrayLike<number>,
): Seam[] | undefined {
  if (!seams || seams.length === 0) return undefined;
  const kept: Seam[] = [];
  for (const seam of seams) {
    const a = newNumber[seam.a];
    const b = newNumber[seam.b];
    if (a === undefined || b === undefined || a < 0 || b < 0 || a === b) {
      continue;
    }
    kept.push({ a, b });
  }
  return kept.length > 0 ? kept : undefined;
}
