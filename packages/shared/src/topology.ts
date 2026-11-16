import type { Rect } from "./screenRect";
import { weldGroups, type EditMesh } from "./meshEdit";

/**
 * The shape of a mesh as modelling tools see it: which points are one spot, which edges are real, which
 * faces (quads, where the mesh has them) are next to which. A mesh is stored as a plain list of points and
 * triangles; this is worked out from it (and worked out again after each edit), so saving, undo and export
 * do not change.
 *
 *  - A VERTEX is a spot: all the points that sit on the same place (a cube has three at each corner).
 *  - A FACE is a quad where two flat, neighbouring triangles make one (a cube side is stored as two
 *    triangles but is one square), otherwise a triangle.
 *  - An EDGE is a side of a face. The diagonal that splits a quad into two triangles is NOT an edge.
 *
 * Edge loops and rings need quads, so they stop at triangles and at points where the face layout is not a
 * plain grid (the "poles" at the tip of a sphere or the middle of a fan-shaped cap).
 */
export type Topology = {
  /** The vertex of every point. */
  vertexOf: Uint32Array;
  /** The points of every vertex. */
  vertexPoints: number[][];
  /** Where every vertex is (x, y, z each): the position of its first point. */
  vertexPositions: Float32Array;
  /** The faces: each is 3 or 4 vertices in order around it, and the triangles (of the mesh) it is made of. */
  faces: { vertices: number[]; triangles: number[] }[];
  /** The face each triangle belongs to, or -1 for a triangle with no area. */
  triangleFace: Int32Array;
  /** The edges as pairs of vertices (a, b, a, b, ...), with a < b. */
  edges: Uint32Array;
  /** The faces on each edge (one for a boundary edge, two inside). */
  edgeFaces: number[][];
  /** The edges that meet at each vertex. */
  vertexEdges: number[][];
};

/**
 * Two neighbouring triangles that were found by their positions in the mesh's list (see below) join into one
 * quad only if their directions differ by less than this many degrees. Large, because a square whose points
 * were pulled about is still a square to the person modelling it.
 */
export const LISTED_QUAD_MAX_ANGLE_DEGREES = 80;

/** Two neighbouring triangles found by their SHAPE (not their place in the list) join only if flat within this many degrees. */
export const QUAD_MAX_ANGLE_DEGREES = 30;

/** The shared-edge test allows this much unevenness when the shared edge is "the longest" (rounding, ties). */
const LONGEST_TOLERANCE = 1e-5;

type Vec = [number, number, number];

function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec, b: Vec): Vec {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}
function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function lengthSquared(a: Vec): number {
  return dot(a, a);
}

/** The two vertex numbers packed into one number (for lookups). `count` is the number of vertices. */
function pack(a: number, b: number, count: number): number {
  return a < b ? a * count + b : b * count + a;
}

/** Works out the topology of a mesh. `weldTolerance` is how close two points must be to count as one spot. */
export function buildTopology(mesh: EditMesh, weldTolerance = 1e-4): Topology {
  const groups = weldGroups(mesh.positions, weldTolerance);
  const vertexCount = groups.members.length;
  const vertexPositions = new Float32Array(vertexCount * 3);
  groups.members.forEach((points, v) => {
    const p = points[0]!;
    vertexPositions.set(mesh.positions.subarray(p * 3, p * 3 + 3), v * 3);
  });
  const at = (v: number): Vec => [
    vertexPositions[v * 3]!,
    vertexPositions[v * 3 + 1]!,
    vertexPositions[v * 3 + 2]!,
  ];

  // The triangles, by vertex. One whose corners are not three different spots, or with no area, is skipped.
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const tri: (Vec | null)[] = [];
  const normal: (Vec | null)[] = [];
  for (let t = 0; t < triangleCount; t++) {
    const a = groups.ids[mesh.indices[t * 3]!]!;
    const b = groups.ids[mesh.indices[t * 3 + 1]!]!;
    const c = groups.ids[mesh.indices[t * 3 + 2]!]!;
    if (a === b || b === c || a === c) {
      tri.push(null);
      normal.push(null);
      continue;
    }
    const n = cross(sub(at(b), at(a)), sub(at(c), at(a)));
    const length = Math.hypot(n[0], n[1], n[2]);
    if (length < 1e-12) {
      tri.push(null);
      normal.push(null);
      continue;
    }
    tri.push([a, b, c]);
    normal.push([n[0] / length, n[1] / length, n[2] / length]);
  }

  // Which triangles use each edge (before any are joined)
  const trianglesOfEdge = new Map<number, number[]>();
  tri.forEach((corners, t) => {
    if (!corners) return;
    for (let k = 0; k < 3; k++) {
      const key = pack(corners[k]!, corners[(k + 1) % 3]!, vertexCount);
      const list = trianglesOfEdge.get(key);
      if (list) list.push(t);
      else trianglesOfEdge.set(key, [t]);
    }
  });

  const partner = new Int32Array(triangleCount).fill(-1);
  const quadOf = new Map<number, number[]>(); // first triangle of a pair -> the quad's four vertices

  // Pass 1, by the list: a square is made as two triangles in a row that share an edge (this is how every
  // shape, extrusion and tube is built). Two such triangles are a quad however the points have been moved,
  // so loops keep working on a mesh that has been pulled about. Only a fold of more than 80 degrees breaks it.
  const listedMinDot = Math.cos(
    (LISTED_QUAD_MAX_ANGLE_DEGREES * Math.PI) / 180,
  );
  for (let t = 0; t + 1 < triangleCount; t++) {
    const A = tri[t];
    const B = tri[t + 1];
    if (!A || !B || partner[t] !== -1 || partner[t + 1] !== -1) continue;
    const shared = A.filter((v) => B.includes(v));
    if (shared.length !== 2) continue;
    const [a, b] = shared as [number, number];
    // the edge must be used by just these two triangles
    if (trianglesOfEdge.get(pack(a, b, vertexCount))?.length !== 2) continue;
    if (dot(normal[t]!, normal[t + 1]!) < listedMinDot) continue;
    const c = A.find((v) => v !== a && v !== b)!;
    const d = B.find((v) => v !== a && v !== b)!;
    if (c === d) continue;
    partner[t] = t + 1;
    partner[t + 1] = t;
    quadOf.set(t, [a, d, b, c]);
  }

  // Pass 2, by shape, for the triangles that are left (a mesh whose triangles are in another order, such as
  // an imported one): a pair qualifies when the edge they share is the longest side of both (so it is the
  // diagonal of the quad, not one of its sides), the two lie nearly in one plane, and the result is convex.
  const minDot = Math.cos((QUAD_MAX_ANGLE_DEGREES * Math.PI) / 180);
  const isLongest = (corners: Vec, a: number, b: number): boolean => {
    const shared = lengthSquared(sub(at(a), at(b)));
    for (let k = 0; k < 3; k++) {
      const x = corners[k]!;
      const y = corners[(k + 1) % 3]!;
      if (lengthSquared(sub(at(x), at(y))) > shared * (1 + LONGEST_TOLERANCE)) {
        return false;
      }
    }
    return true;
  };
  for (const [key, list] of trianglesOfEdge) {
    if (list.length !== 2) continue;
    const [first, second] = list as [number, number];
    if (partner[first] !== -1 || partner[second] !== -1) continue;
    const A = tri[first]!;
    const B = tri[second]!;
    // The shared edge's two vertices, from the key
    const lo = Math.floor(key / vertexCount);
    const hi = key - lo * vertexCount;
    if (!isLongest(A, lo, hi) || !isLongest(B, lo, hi)) continue;
    const nA = normal[first]!;
    const nB = normal[second]!;
    if (dot(nA, nB) < minDot) continue;
    const c = A.find((v) => v !== lo && v !== hi)!;
    const d = B.find((v) => v !== lo && v !== hi)!;
    if (c === d) continue;
    const quad = [lo, d, hi, c];
    // Convex: every corner turns the same way, and none is straight
    const turns = quad.map((_, k) =>
      dot(
        cross(
          sub(at(quad[(k + 1) % 4]!), at(quad[k]!)),
          sub(at(quad[(k + 2) % 4]!), at(quad[(k + 1) % 4]!)),
        ),
        nA,
      ),
    );
    const convex =
      turns.every((turn) => turn > 1e-12) ||
      turns.every((turn) => turn < -1e-12);
    if (!convex) continue;
    partner[first] = second;
    partner[second] = first;
    quadOf.set(first, quad);
  }

  // Faces, in the order their first triangle appears
  const faces: Topology["faces"] = [];
  const triangleFace = new Int32Array(triangleCount).fill(-1);
  for (let t = 0; t < triangleCount; t++) {
    const corners = tri[t];
    if (!corners || triangleFace[t] !== -1) continue;
    const other = partner[t]!;
    if (other !== -1) {
      const lowest = Math.min(t, other);
      if (lowest !== t) continue; // made when its partner came first
      triangleFace[t] = triangleFace[other] = faces.length;
      faces.push({ vertices: quadOf.get(t)!, triangles: [t, other] });
    } else {
      triangleFace[t] = faces.length;
      faces.push({ vertices: [...corners], triangles: [t] });
    }
  }

  // The edges: the sides of the faces (a quad's diagonal is not one)
  const edgeId = new Map<number, number>();
  const edgePairs: number[] = [];
  const edgeFaces: number[][] = [];
  faces.forEach((face, f) => {
    const n = face.vertices.length;
    for (let k = 0; k < n; k++) {
      const a = face.vertices[k]!;
      const b = face.vertices[(k + 1) % n]!;
      const key = pack(a, b, vertexCount);
      let id = edgeId.get(key);
      if (id === undefined) {
        id = edgeFaces.length;
        edgeId.set(key, id);
        edgePairs.push(Math.min(a, b), Math.max(a, b));
        edgeFaces.push([]);
      }
      if (!edgeFaces[id]!.includes(f)) edgeFaces[id]!.push(f);
    }
  });
  const vertexEdges: number[][] = Array.from({ length: vertexCount }, () => []);
  for (let e = 0; e < edgeFaces.length; e++) {
    vertexEdges[edgePairs[e * 2]!]!.push(e);
    vertexEdges[edgePairs[e * 2 + 1]!]!.push(e);
  }

  return {
    vertexOf: groups.ids,
    vertexPoints: groups.members,
    vertexPositions,
    faces,
    triangleFace,
    edges: Uint32Array.from(edgePairs),
    edgeFaces,
    vertexEdges,
  };
}

/** How many edges the mesh has. */
export function edgeCount(topology: Topology): number {
  return topology.edgeFaces.length;
}

/** The two vertices of an edge. */
export function edgeVertices(
  topology: Topology,
  edge: number,
): [number, number] {
  return [topology.edges[edge * 2]!, topology.edges[edge * 2 + 1]!];
}

/** The edge between two vertices, or -1. */
export function edgeBetween(topology: Topology, a: number, b: number): number {
  for (const edge of topology.vertexEdges[a] ?? []) {
    const [x, y] = edgeVertices(topology, edge);
    if ((x === a && y === b) || (x === b && y === a)) return edge;
  }
  return -1;
}

/** Every point (not just one per spot) of the vertices of the given edges, without repeats. */
export function edgePoints(
  topology: Topology,
  edges: readonly number[],
): number[] {
  const points = new Set<number>();
  for (const edge of edges) {
    for (const vertex of edgeVertices(topology, edge)) {
      for (const point of topology.vertexPoints[vertex]!) points.add(point);
    }
  }
  return [...points];
}

/** Every point of the given face's vertices. */
export function facePoints(topology: Topology, face: number): number[] {
  const points: number[] = [];
  for (const vertex of topology.faces[face]?.vertices ?? []) {
    points.push(...topology.vertexPoints[vertex]!);
  }
  return points;
}

/**
 * The edges whose two ends are both selected: the edges a point selection amounts to. (Selecting the two
 * ends of an edge selects the edge; selecting the four corners of a face selects its four sides.)
 */
export function selectedEdges(
  topology: Topology,
  selected: readonly number[],
): number[] {
  const chosen = new Set<number>();
  for (const point of selected) {
    const vertex = topology.vertexOf[point];
    if (vertex !== undefined) chosen.add(vertex);
  }
  const edges: number[] = [];
  for (let e = 0; e < edgeCount(topology); e++) {
    const [a, b] = edgeVertices(topology, e);
    if (chosen.has(a) && chosen.has(b)) edges.push(e);
  }
  return edges;
}

// ---- Loops and rings ----

/** A run of connected edges. `closed` is true when it comes back to where it started. */
export type EdgeRun = { edges: number[]; closed: boolean };

function isBoundary(topology: Topology, edge: number): boolean {
  return topology.edgeFaces[edge]!.length === 1;
}

/**
 * The edge a loop continues along when it reaches `vertex` by `edge`, or -1 if it stops there. Through a
 * vertex where four quads meet it goes straight on, to the edge that shares no face with the one it came
 * by. Along the border of a surface it follows the border. Anywhere else (a triangle, a pole with three or
 * five edges, a seam) it stops.
 */
function continueLoop(
  topology: Topology,
  vertex: number,
  edge: number,
): number {
  const around = topology.vertexEdges[vertex]!;
  if (isBoundary(topology, edge)) {
    const border = around.filter((e) => isBoundary(topology, e));
    return border.length === 2 ? (border.find((e) => e !== edge) ?? -1) : -1;
  }
  if (around.length !== 4) return -1;
  // Four edges, and every face around the vertex a quad with two of those edges
  for (const e of around) {
    const faces = topology.edgeFaces[e]!;
    if (faces.length !== 2) return -1;
    if (faces.some((f) => topology.faces[f]!.vertices.length !== 4)) return -1;
  }
  const mine = new Set(topology.edgeFaces[edge]!);
  const straight = around.filter(
    (e) => e !== edge && !topology.edgeFaces[e]!.some((f) => mine.has(f)),
  );
  return straight.length === 1 ? straight[0]! : -1;
}

/**
 * The edge loop through an edge: the ring of edges that runs straight on at every vertex (a belt round a
 * waist). It follows the edge in both directions until it comes back to the start (`closed`) or stops at a
 * triangle, a pole or a seam.
 */
export function edgeLoop(topology: Topology, start: number): EdgeRun {
  if (start < 0 || start >= edgeCount(topology)) {
    return { edges: [], closed: false };
  }
  const [a, b] = edgeVertices(topology, start);
  const walk = (
    from: number,
    first: number,
  ): { edges: number[]; closed: boolean } => {
    const edges: number[] = [];
    let edge = first;
    let vertex = from;
    for (let guard = 0; guard < edgeCount(topology); guard++) {
      const next = continueLoop(topology, vertex, edge);
      if (next === -1) return { edges, closed: false };
      if (next === start) return { edges, closed: true };
      edges.push(next);
      // Across the next edge to its other end
      const [x, y] = edgeVertices(topology, next);
      vertex = x === vertex ? y : x;
      edge = next;
    }
    return { edges, closed: false };
  };
  const forward = walk(b, start);
  if (forward.closed) return { edges: [start, ...forward.edges], closed: true };
  const backward = walk(a, start);
  return {
    edges: [...backward.edges.reverse(), start, ...forward.edges],
    closed: false,
  };
}

/** The edge of a quad that shares no vertex with `edge` (across from it), or -1 if the face is not a quad. */
function oppositeInQuad(
  topology: Topology,
  face: number,
  edge: number,
): number {
  const quad = topology.faces[face]!.vertices;
  if (quad.length !== 4) return -1;
  const [a, b] = edgeVertices(topology, edge);
  const rest = quad.filter((v) => v !== a && v !== b);
  if (rest.length !== 2) return -1;
  return edgeBetween(topology, rest[0]!, rest[1]!);
}

/**
 * The edge ring through an edge: the edges that run side by side across the same strip of quads (the rungs
 * of a ladder). A loop cut goes across a ring. It stops at a triangle or the border of the surface.
 */
export function edgeRing(topology: Topology, start: number): EdgeRun {
  if (start < 0 || start >= edgeCount(topology)) {
    return { edges: [], closed: false };
  }
  const walk = (firstFace: number): { edges: number[]; closed: boolean } => {
    const edges: number[] = [];
    let edge = start;
    let face = firstFace;
    for (let guard = 0; guard < edgeCount(topology); guard++) {
      const next = oppositeInQuad(topology, face, edge);
      if (next === -1) return { edges, closed: false };
      if (next === start) return { edges, closed: true };
      edges.push(next);
      const faces = topology.edgeFaces[next]!;
      const onward = faces.find((f) => f !== face);
      if (onward === undefined) return { edges, closed: false };
      edge = next;
      face = onward;
    }
    return { edges, closed: false };
  };
  const faces = topology.edgeFaces[start]!;
  const quads = faces.filter((f) => topology.faces[f]!.vertices.length === 4);
  if (quads.length === 0) return { edges: [start], closed: false };
  const one = walk(quads[0]!);
  if (one.closed) return { edges: [start, ...one.edges], closed: true };
  const two =
    quads[1] === undefined
      ? { edges: [] as number[], closed: false }
      : walk(quads[1]);
  return {
    edges: [...two.edges.reverse(), start, ...one.edges],
    closed: false,
  };
}

// ---- Picking ----

/** The distance from a spot to the line segment between two spots, all on the screen. */
export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The edge nearest to a spot on the screen, or -1 if none is within `maxDistance` pixels. `projected` has the
 * screen position of every POINT (x, y, x, y, ...), as for picking points; an edge uses the first point of
 * each of its vertices, and one that cannot be shown (NaN) is never chosen. Equally near: the lower number.
 */
export function nearestEdge(
  topology: Topology,
  projected: Float32Array,
  x: number,
  y: number,
  maxDistance: number,
): number {
  let best = -1;
  let bestDistance = maxDistance;
  for (let e = 0; e < edgeCount(topology); e++) {
    const [a, b] = edgeVertices(topology, e);
    const pa = topology.vertexPoints[a]![0]!;
    const pb = topology.vertexPoints[b]![0]!;
    const distance = distanceToSegment(
      x,
      y,
      projected[pa * 2]!,
      projected[pa * 2 + 1]!,
      projected[pb * 2]!,
      projected[pb * 2 + 1]!,
    );
    if (distance <= bestDistance && (best === -1 || distance < bestDistance)) {
      best = e;
      bestDistance = distance;
    }
  }
  return best;
}

/** The edges that have both their ends inside a screen rectangle (for a box selection in edge mode). */
export function edgesInRect(
  topology: Topology,
  projected: Float32Array,
  rect: Rect,
): number[] {
  const inside = (point: number) => {
    const x = projected[point * 2]!;
    const y = projected[point * 2 + 1]!;
    return (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  };
  const edges: number[] = [];
  for (let e = 0; e < edgeCount(topology); e++) {
    const [a, b] = edgeVertices(topology, e);
    if (
      inside(topology.vertexPoints[a]![0]!) &&
      inside(topology.vertexPoints[b]![0]!)
    ) {
      edges.push(e);
    }
  }
  return edges;
}

// ---- What a click selects ----

/** What a click on an edge selects: just the edge, the loop through it, or the ring through it. */
export type EdgePick = "edge" | "loop" | "ring";

/** The edges an edge click picks. */
export function pickedEdges(
  topology: Topology,
  edge: number,
  pick: EdgePick,
): number[] {
  if (pick === "loop") return edgeLoop(topology, edge).edges;
  if (pick === "ring") return edgeRing(topology, edge).edges;
  return [edge];
}

/**
 * What the selection becomes after a click on an edge (`edge`, or -1 for empty space):
 * - a plain click selects only what was picked; on empty space it clears the selection
 * - with Shift (additive) it adds what was picked, or takes it out if all of it was already selected; on empty
 *   space it changes nothing
 * A selection is a list of points; selecting an edge selects the points at its two ends.
 */
export function selectionAfterEdgeClick(
  topology: Topology,
  current: readonly number[],
  edge: number,
  additive: boolean,
  pick: EdgePick = "edge",
): number[] {
  if (edge < 0) return additive ? [...current] : [];
  return combine(
    current,
    edgePoints(topology, pickedEdges(topology, edge, pick)),
    additive,
  );
}

/**
 * What the selection becomes after a click on a face (`face`, or -1 for empty space): the face's corner points,
 * replacing the selection, or (Shift) added to it or taken out if they were all selected already.
 */
export function selectionAfterFaceClick(
  topology: Topology,
  current: readonly number[],
  face: number,
  additive: boolean,
): number[] {
  if (face < 0) return additive ? [...current] : [];
  return combine(current, facePoints(topology, face), additive);
}

function combine(
  current: readonly number[],
  picked: readonly number[],
  additive: boolean,
): number[] {
  if (!additive) return [...picked];
  const have = new Set(current);
  return picked.every((point) => have.has(point))
    ? current.filter((point) => !picked.includes(point))
    : [...new Set([...current, ...picked])];
}

/**
 * Grows what is selected along its loops or rings: every selected edge brings the loop (or ring) through it.
 * Gives the new selection (the old points stay selected), or null if no edge is selected.
 */
export function growSelection(
  topology: Topology,
  selected: readonly number[],
  pick: "loop" | "ring",
): number[] | null {
  const edges = selectedEdges(topology, selected);
  if (edges.length === 0) return null;
  const grown = new Set(edges);
  for (const edge of edges) {
    for (const e of pickedEdges(topology, edge, pick)) grown.add(e);
  }
  return [...new Set([...selected, ...edgePoints(topology, [...grown])])];
}
