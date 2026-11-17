import type { ShapeMesh } from "./modifiers";
import { MAX_SUBDIVIDE_LEVELS } from "./scene";
import { FULL_SHARPNESS_LEVELS, edgeSharpness } from "./creases";
import { buildTopology, edgeVertices, type Topology } from "./topology";

/**
 * Smoothing by subdivision (Catmull-Clark): every face is cut into smaller ones and the points are moved so
 * the surface becomes a smooth curve that follows the original shape. A box becomes a rounded blob, a
 * pipe of a few sides a round pipe. Extra loops close to an edge (see Loop cut) keep that edge tight.
 *
 * Points on the same spot count as one (a cube has three at each corner), so the result has no cracks and
 * is smooth everywhere. Faces are the quads and triangles of the topology layer; every face of the result is
 * a quad (made of two triangles in a row, as every other shape here is).
 */

type Vec = [number, number, number];

/** An edge that stays creased into the next level: the two points that are its ends, and how many levels it still stays sharp. */
type ChildCrease = { a: number; b: number; sharpness: number };

/**
 * One level of smoothing, or null if the mesh has nothing to smooth. `sharpOf` says how sharp each creased
 * edge still is (in levels); the result carries the creases on to the next level, one level less sharp.
 */
function subdivideOnce(
  mesh: ShapeMesh,
  sharpOf: (topology: Topology) => Float64Array,
): { mesh: ShapeMesh; children: ChildCrease[] } | null {
  const topology = buildTopology(mesh);
  if (topology.faces.length === 0) return null;
  return smooth(mesh, topology, sharpOf(topology));
}

const lerp = (a: Vec, b: Vec, t: number): Vec => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function smooth(
  mesh: ShapeMesh,
  topology: Topology,
  sharp: Float64Array,
): { mesh: ShapeMesh; children: ChildCrease[] } {
  const vertexCount = topology.vertexPoints.length;
  const edgeCount = topology.edgeFaces.length;
  const faceCount = topology.faces.length;
  const at = (v: number): Vec => [
    topology.vertexPositions[v * 3]!,
    topology.vertexPositions[v * 3 + 1]!,
    topology.vertexPositions[v * 3 + 2]!,
  ];
  const mean = (list: readonly Vec[]): Vec => {
    const sum: Vec = [0, 0, 0];
    for (const p of list) {
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
    }
    const n = list.length || 1;
    return [sum[0] / n, sum[1] / n, sum[2] / n];
  };

  // Face points: the middle of each face
  const facePoint: Vec[] = topology.faces.map((face) =>
    mean(face.vertices.map(at)),
  );

  // Edge points: the middle of an inside edge is pulled towards the middle of its two faces; a border edge
  // (one face, or more than two) just uses its own middle
  const edgeMid: Vec[] = [];
  const edgePoint: Vec[] = [];
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edgeVertices(topology, e);
    const mid = mean([at(a), at(b)]);
    edgeMid.push(mid);
    const faces = topology.edgeFaces[e]!;
    if (faces.length !== 2) {
      edgePoint.push(mid);
      continue;
    }
    const soft = mean([
      at(a),
      at(b),
      facePoint[faces[0]!]!,
      facePoint[faces[1]!]!,
    ]);
    // A creased edge keeps to its own middle: all the way when it is sharp (1 or more levels), part of the way when semi-sharp
    edgePoint.push(lerp(soft, mid, Math.min(1, sharp[e]!)));
  }

  // Facing of each face: the new quads must wind the same way as the old triangles
  const flips = topology.faces.map((face) =>
    windingFlipped(mesh, topology, face),
  );

  // New positions of the old vertices
  const vertexPoint: Vec[] = [];
  for (let v = 0; v < vertexCount; v++) {
    const p = at(v);
    const edges = topology.vertexEdges[v]!;
    const border = edges.filter((e) => topology.edgeFaces[e]!.length !== 2);
    if (edges.length === 0) {
      vertexPoint.push(p);
    } else if (border.length === 0) {
      // Inside the surface: (F + 2R + (n - 3) P) / n ...
      const n = edges.length;
      const faces = new Set<number>();
      for (const e of edges)
        for (const f of topology.edgeFaces[e]!) faces.add(f);
      const F = mean([...faces].map((f) => facePoint[f]!));
      const R = mean(edges.map((e) => edgeMid[e]!));
      const soft: Vec = [
        (F[0] + 2 * R[0] + (n - 3) * p[0]) / n,
        (F[1] + 2 * R[1] + (n - 3) * p[1]) / n,
        (F[2] + 2 * R[2] + (n - 3) * p[2]) / n,
      ];
      // ... except where creased edges meet it: two make a crease line (the cubic rule along it), three or
      // more make a corner that stays put; semi-sharp creases blend between that and the soft rule
      const creased = edges.filter((e) => sharp[e]! > 0);
      if (creased.length < 2) {
        vertexPoint.push(soft);
      } else {
        const average =
          creased.reduce((sum, e) => sum + sharp[e]!, 0) / creased.length;
        let hard: Vec = p;
        if (creased.length === 2) {
          const [a, b] = creased.map((e) => {
            const [x, y] = edgeVertices(topology, e);
            return at(x === v ? y : x);
          }) as [Vec, Vec];
          hard = [
            (a[0] + 6 * p[0] + b[0]) / 8,
            (a[1] + 6 * p[1] + b[1]) / 8,
            (a[2] + 6 * p[2] + b[2]) / 8,
          ];
        }
        vertexPoint.push(lerp(soft, hard, Math.min(1, average)));
      }
    } else if (
      border.length === 2 &&
      edges.every((e) => topology.edgeFaces[e]!.length <= 2)
    ) {
      // On the border of the surface: the cubic curve through its two border neighbours, (a + 6P + b) / 8
      const [a, b] = border.map((e) => {
        const [x, y] = edgeVertices(topology, e);
        return at(x === v ? y : x);
      }) as [Vec, Vec];
      vertexPoint.push([
        (a[0] + 6 * p[0] + b[0]) / 8,
        (a[1] + 6 * p[1] + b[1]) / 8,
        (a[2] + 6 * p[2] + b[2]) / 8,
      ]);
    } else {
      vertexPoint.push(p); // a corner where the surface is not a simple sheet: left where it is
    }
  }

  // The new mesh: old vertices, then edge points, then face points
  const positions = new Float32Array((vertexCount + edgeCount + faceCount) * 3);
  vertexPoint.forEach((p, v) => positions.set(p, v * 3));
  edgePoint.forEach((p, e) => positions.set(p, (vertexCount + e) * 3));
  facePoint.forEach((p, f) =>
    positions.set(p, (vertexCount + edgeCount + f) * 3),
  );

  const edgeOf = new Map<number, number>();
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edgeVertices(topology, e);
    edgeOf.set(a * vertexCount + b, e);
  }
  const edgeBetween = (a: number, b: number) =>
    edgeOf.get(Math.min(a, b) * vertexCount + Math.max(a, b))!;

  const indices: number[] = [];
  topology.faces.forEach((face, f) => {
    const cycle = flips[f] ? [...face.vertices].reverse() : face.vertices;
    const k = cycle.length;
    const centre = vertexCount + edgeCount + f;
    for (let i = 0; i < k; i++) {
      const prev = cycle[(i + k - 1) % k]!;
      const here = cycle[i]!;
      const next = cycle[(i + 1) % k]!;
      // One quad of the face at each of its corners: corner, edge after, middle, edge before
      const corner = here;
      const after = vertexCount + edgeBetween(here, next);
      const before = vertexCount + edgeBetween(prev, here);
      indices.push(corner, after, centre, corner, centre, before);
    }
  });
  // The creases go on to the next level: each creased edge becomes two edges, one level less sharp
  const children: ChildCrease[] = [];
  for (let e = 0; e < edgeCount; e++) {
    const left = sharp[e]! - 1;
    if (left <= 0 || topology.edgeFaces[e]!.length !== 2) continue;
    const [a, b] = edgeVertices(topology, e);
    children.push({ a, b: vertexCount + e, sharpness: left });
    children.push({ a: b, b: vertexCount + e, sharpness: left });
  }
  return { mesh: { positions, indices: Uint32Array.from(indices) }, children };
}

/** True if the face's corners, in the order the topology lists them, run the opposite way to its own triangles. */
function windingFlipped(
  mesh: ShapeMesh,
  topology: Topology,
  face: { vertices: number[]; triangles: number[] },
): boolean {
  const p = (i: number): Vec => [
    mesh.positions[i * 3]!,
    mesh.positions[i * 3 + 1]!,
    mesh.positions[i * 3 + 2]!,
  ];
  const t = face.triangles[0]!;
  const a = p(mesh.indices[t * 3]!);
  const b = p(mesh.indices[t * 3 + 1]!);
  const c = p(mesh.indices[t * 3 + 2]!);
  const own = cross(sub(b, a), sub(c, a));
  // The face's corners as a polygon: the Newell normal is the sum of the turns round it
  const poly = face.vertices.map((v) => [
    topology.vertexPositions[v * 3]!,
    topology.vertexPositions[v * 3 + 1]!,
    topology.vertexPositions[v * 3 + 2]!,
  ]) as Vec[];
  const normal: Vec = [0, 0, 0];
  for (let i = 0; i < poly.length; i++) {
    const q = poly[i]!;
    const r = poly[(i + 1) % poly.length]!;
    normal[0] += (q[1] - r[1]) * (q[2] + r[2]);
    normal[1] += (q[2] - r[2]) * (q[0] + r[0]);
    normal[2] += (q[0] - r[0]) * (q[1] + r[1]);
  }
  return own[0] * normal[0] + own[1] * normal[1] + own[2] * normal[2] < 0;
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/**
 * Smooths a mesh `levels` times (1 to 3). Each level multiplies the number of faces by about four, so a level
 * that would pass `maxPoints` is not done (the result so far is returned). The input is not changed.
 */
export function subdivideMesh(
  mesh: ShapeMesh,
  levels: number,
  maxPoints: number,
): ShapeMesh {
  const count = Math.max(0, Math.min(MAX_SUBDIVIDE_LEVELS, Math.round(levels)));
  let current = mesh;
  // The creases carried on from the level before (the first level uses the mesh's own)
  let carried: ChildCrease[] | null = null;
  for (let level = 0; level < count; level++) {
    // Each face adds a middle point, each edge one: about 4 times the points
    if ((current.positions.length / 3) * 4 > maxPoints) break;
    const from: ChildCrease[] | null = carried;
    const next = subdivideOnce(current, (topology) =>
      from === null
        ? edgeSharpness(topology, current.creases)
        : edgeSharpness(
            topology,
            from.map((c) => ({
              a: c.a,
              b: c.b,
              value: c.sharpness / FULL_SHARPNESS_LEVELS,
            })),
          ),
    );
    if (!next) break;
    current = next.mesh;
    carried = next.children;
  }
  return current;
}
