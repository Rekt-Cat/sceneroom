import {
  edgeCount,
  edgeVertices,
  selectedEdges,
  type Topology,
} from "./topology";

/** What a selection tool gives back: the new selection as point numbers, or why nothing happened. */
export type SelectionResult =
  { ok: true; points: number[] } | { ok: false; reason: string };

/** Faces whose normals differ by less than this many degrees count as pointing the same way. */
export const SIMILAR_NORMAL_DEGREES = 8;
/** Edges whose lengths differ by less than this share of the longer one count as the same length. */
export const SIMILAR_LENGTH_SHARE = 0.05;

type Vec = [number, number, number];

/** The vertices (spots) the selected points sit on. */
function selectedVertices(
  topology: Topology,
  selected: readonly number[],
): Set<number> {
  const vertices = new Set<number>();
  for (const point of selected) {
    const vertex = topology.vertexOf[point];
    if (vertex !== undefined) vertices.add(vertex);
  }
  return vertices;
}

/** Every point of these vertices (all the points that sit on the same spots). */
function pointsOf(topology: Topology, vertices: Iterable<number>): number[] {
  const points: number[] = [];
  for (const vertex of vertices) points.push(...topology.vertexPoints[vertex]!);
  return points.sort((a, b) => a - b);
}

/** Select more: the selection grows by one step, to every point joined to a selected one by an edge. */
export function growSelection(
  topology: Topology,
  selected: readonly number[],
): SelectionResult {
  const chosen = selectedVertices(topology, selected);
  if (chosen.size === 0)
    return { ok: false, reason: "Select something first." };
  const grown = new Set(chosen);
  for (let e = 0; e < edgeCount(topology); e++) {
    const [a, b] = edgeVertices(topology, e);
    if (chosen.has(a)) grown.add(b);
    if (chosen.has(b)) grown.add(a);
  }
  if (grown.size === chosen.size) {
    return { ok: false, reason: "The selection cannot grow any further." };
  }
  return { ok: true, points: pointsOf(topology, grown) };
}

/** Select less: the selection shrinks by one step, losing every point that touches a point that is not selected. */
export function shrinkSelection(
  topology: Topology,
  selected: readonly number[],
): SelectionResult {
  const chosen = selectedVertices(topology, selected);
  if (chosen.size === 0)
    return { ok: false, reason: "Select something first." };
  const outer = new Set<number>();
  for (let e = 0; e < edgeCount(topology); e++) {
    const [a, b] = edgeVertices(topology, e);
    if (chosen.has(a) && !chosen.has(b)) outer.add(a);
    if (chosen.has(b) && !chosen.has(a)) outer.add(b);
  }
  // A point on the border of the whole shape (an edge with one face) also counts as an outer one
  for (let e = 0; e < edgeCount(topology); e++) {
    if (topology.edgeFaces[e]!.length === 1) {
      const [a, b] = edgeVertices(topology, e);
      if (chosen.has(a)) outer.add(a);
      if (chosen.has(b)) outer.add(b);
    }
  }
  const kept = [...chosen].filter((v) => !outer.has(v));
  if (kept.length === 0) {
    return { ok: false, reason: "The selection cannot shrink any further." };
  }
  return { ok: true, points: pointsOf(topology, kept) };
}

/** Invert: what was selected is not, and what was not is. */
export function invertSelection(
  topology: Topology,
  selected: readonly number[],
): SelectionResult {
  const chosen = selectedVertices(topology, selected);
  const rest: number[] = [];
  for (let v = 0; v < topology.vertexPoints.length; v++) {
    if (!chosen.has(v)) rest.push(v);
  }
  if (rest.length === 0) {
    return {
      ok: false,
      reason: "Everything is selected, so nothing is left to invert to.",
    };
  }
  return { ok: true, points: pointsOf(topology, rest) };
}

const position = (topology: Topology, v: number): Vec => [
  topology.vertexPositions[v * 3]!,
  topology.vertexPositions[v * 3 + 1]!,
  topology.vertexPositions[v * 3 + 2]!,
];

/** The unit normal of a face (Newell's method, so it also works for a bent square), or null if it has no area. */
function faceNormal(topology: Topology, face: number): Vec | null {
  const vertices = topology.faces[face]!.vertices;
  const normal: Vec = [0, 0, 0];
  for (let i = 0; i < vertices.length; i++) {
    const p = position(topology, vertices[i]!);
    const q = position(topology, vertices[(i + 1) % vertices.length]!);
    normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
    normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
    normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const length = Math.hypot(...normal);
  return length < 1e-12
    ? null
    : [normal[0] / length, normal[1] / length, normal[2] / length];
}

/**
 * Select similar: picks everything like what is selected.
 *  - "face": faces that point the same way as a selected face (within a few degrees),
 *  - "edge": edges about as long as a selected edge,
 *  - "point": points where as many edges meet as at a selected point.
 */
export function selectSimilar(
  topology: Topology,
  selected: readonly number[],
  mode: "point" | "edge" | "face",
): SelectionResult {
  const chosen = selectedVertices(topology, selected);
  if (chosen.size === 0)
    return { ok: false, reason: "Select something first." };

  if (mode === "point") {
    const counts = new Set(
      [...chosen].map((v) => topology.vertexEdges[v]!.length),
    );
    const similar: number[] = [];
    for (let v = 0; v < topology.vertexPoints.length; v++) {
      if (counts.has(topology.vertexEdges[v]!.length)) similar.push(v);
    }
    return { ok: true, points: pointsOf(topology, similar) };
  }

  if (mode === "edge") {
    const edges = selectedEdges(topology, selected);
    if (edges.length === 0) {
      return {
        ok: false,
        reason:
          "Select an edge first (press 2 for edge mode, then click an edge).",
      };
    }
    const length = (e: number) => {
      const [a, b] = edgeVertices(topology, e);
      const p = position(topology, a);
      const q = position(topology, b);
      return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    };
    const lengths = edges.map(length);
    const vertices = new Set<number>();
    for (let e = 0; e < edgeCount(topology); e++) {
      const own = length(e);
      if (
        lengths.some(
          (l) => Math.abs(l - own) <= Math.max(l, own) * SIMILAR_LENGTH_SHARE,
        )
      ) {
        const [a, b] = edgeVertices(topology, e);
        vertices.add(a);
        vertices.add(b);
      }
    }
    return { ok: true, points: pointsOf(topology, vertices) };
  }

  // Faces: those whose every vertex is selected
  const picked: Vec[] = [];
  for (let f = 0; f < topology.faces.length; f++) {
    if (topology.faces[f]!.vertices.every((v) => chosen.has(v))) {
      const n = faceNormal(topology, f);
      if (n) picked.push(n);
    }
  }
  if (picked.length === 0) {
    return {
      ok: false,
      reason: "Select a face first (press 3 for face mode, then click a face).",
    };
  }
  const limit = Math.cos((SIMILAR_NORMAL_DEGREES * Math.PI) / 180);
  const vertices = new Set<number>();
  for (let f = 0; f < topology.faces.length; f++) {
    const n = faceNormal(topology, f);
    if (!n) continue;
    if (picked.some((p) => p[0] * n[0] + p[1] * n[1] + p[2] * n[2] >= limit)) {
      for (const v of topology.faces[f]!.vertices) vertices.add(v);
    }
  }
  return { ok: true, points: pointsOf(topology, vertices) };
}

/**
 * Outline: the edges round the selected faces. Selecting the lid of a cylinder (face mode, Alt-click on it) and
 * pressing Outline selects the rim, which a loop cannot do because the lid is made of triangles. A face counts as
 * selected when all its corners are. The result is the points of the edges that have a selected face on one side and
 * something else (another face, or nothing) on the other.
 */
export function outlineSelection(
  topology: Topology,
  selected: readonly number[],
): SelectionResult {
  const chosen = selectedVertices(topology, selected);
  const inside = new Set<number>();
  for (let f = 0; f < topology.faces.length; f++) {
    if (topology.faces[f]!.vertices.every((v) => chosen.has(v))) inside.add(f);
  }
  if (inside.size === 0) {
    return {
      ok: false,
      reason:
        "Select a face first (press 3 for face mode; Alt-click selects a whole flat area, such as a lid), then press Outline.",
    };
  }
  const vertices = new Set<number>();
  for (let e = 0; e < edgeCount(topology); e++) {
    const faces = topology.edgeFaces[e]!;
    if (faces.filter((f) => inside.has(f)).length !== 1) continue;
    const [a, b] = edgeVertices(topology, e);
    vertices.add(a);
    vertices.add(b);
  }
  if (vertices.size === 0) {
    return {
      ok: false,
      reason:
        "The selected faces have no outline: they cover the whole closed shape.",
    };
  }
  return { ok: true, points: pointsOf(topology, vertices) };
}
