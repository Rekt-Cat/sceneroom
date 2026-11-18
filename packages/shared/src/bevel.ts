import { remapCreases } from "./creases";
import { remapSeams, seamsOf } from "./seams";
import type { EditMesh } from "./meshEdit";
import { edgeBetween, edgeVertices, type Topology } from "./topology";

/**
 * Bevel: replace a sharp edge by a narrow strip (a chamfer, or a rounded profile with several segments), so
 * the edge catches the light and stops being a razor line. The selected edges are cut back by `width` on both
 * faces; a strip joins the two cut edges; where several bevelled edges meet at a corner the gap is filled.
 *
 * Works on the inside of a surface (an edge with a face on each side, at corners where the whole ring of faces
 * is there). The width is measured on the faces, and is limited so it cannot reach the other end of an edge.
 */
export const MAX_BEVEL_SEGMENTS = 8;
/** How far along an edge a bevel may reach (a fraction of the edge, so two ends never cross). */
const MAX_REACH = 0.45;

type Vec = [number, number, number];

export type BevelResult =
  | {
      ok: true;
      mesh: EditMesh;
      /** The points of the new strips (the bevel itself), ready to be moved or scaled. */
      selected: number[];
      /** The width that was really used (it may be smaller than asked). */
      width: number;
    }
  | { ok: false; reason: string };

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec): Vec => {
  const l = length(a);
  return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};
const same = (a: Vec, b: Vec) => length(sub(a, b)) < 1e-7;

/** The point a fraction `t` of the way along the curve from `a` to `b` that bends towards `control`. */
function curve(a: Vec, control: Vec, b: Vec, t: number): Vec {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
    u * u * a[2] + 2 * u * t * control[2] + t * t * b[2],
  ];
}

/** The widest bevel that is safe for these edges: a fraction of the shortest edge at any corner it touches. */
export function maxBevelWidth(
  mesh: EditMesh,
  topology: Topology,
  edges: readonly number[],
): number {
  const touched = new Set<number>();
  for (const e of edges)
    for (const v of edgeVertices(topology, e)) touched.add(v);
  let shortest = Infinity;
  for (const v of touched) {
    for (const e of topology.vertexEdges[v]!) {
      const [a, b] = edgeVertices(topology, e);
      const pa = point(topology, a);
      const pb = point(topology, b);
      shortest = Math.min(shortest, length(sub(pa, pb)));
    }
  }
  void mesh;
  return Number.isFinite(shortest) ? shortest * MAX_REACH : 0;
}

function point(topology: Topology, v: number): Vec {
  return [
    topology.vertexPositions[v * 3]!,
    topology.vertexPositions[v * 3 + 1]!,
    topology.vertexPositions[v * 3 + 2]!,
  ];
}

/**
 * Bevels the edges (by id in `topology`). `width` is how far the bevel reaches across each face, `segments` how
 * many flat pieces make up the profile (1 is a straight chamfer, more is rounder).
 */
export function bevelEdges(
  mesh: EditMesh,
  topology: Topology,
  edgeIds: readonly number[],
  width: number,
  segments = 1,
): BevelResult {
  const bevelled = new Set(
    edgeIds.filter((e) => e >= 0 && e < topology.edgeFaces.length),
  );
  if (bevelled.size === 0) {
    return {
      ok: false,
      reason:
        "Select some edges first (press 2 for edge mode, then click an edge).",
    };
  }
  for (const e of bevelled) {
    if (topology.edgeFaces[e]!.length !== 2) {
      return {
        ok: false,
        reason:
          "An edge on the border of a surface cannot be bevelled yet (it needs a face on each side).",
      };
    }
  }
  const touched = new Set<number>();
  for (const e of bevelled)
    for (const v of edgeVertices(topology, e)) touched.add(v);
  for (const v of touched) {
    if (
      topology.vertexEdges[v]!.some((e) => topology.edgeFaces[e]!.length !== 2)
    ) {
      return {
        ok: false,
        reason:
          "A bevel cannot reach the border of a surface yet: one of its corners is on the border.",
      };
    }
  }
  const n = Math.min(MAX_BEVEL_SEGMENTS, Math.max(1, Math.round(segments)));
  const w = Math.min(
    Math.max(width, 1e-6),
    maxBevelWidth(mesh, topology, [...bevelled]),
  );
  if (!(w > 0))
    return { ok: false, reason: "There is no room for a bevel here." };

  const faceCycle = (f: number) => topology.faces[f]!.vertices;
  /** The two edges of a face that meet at a vertex. */
  const edgesAt = (f: number, v: number): [number, number] => {
    const cycle = faceCycle(f);
    const i = cycle.indexOf(v);
    const prev = cycle[(i + cycle.length - 1) % cycle.length]!;
    const next = cycle[(i + 1) % cycle.length]!;
    return [edgeBetween(topology, prev, v), edgeBetween(topology, v, next)];
  };
  const otherEnd = (e: number, v: number) => {
    const [a, b] = edgeVertices(topology, e);
    return a === v ? b : a;
  };
  /** Unit direction from v along the edge. */
  const dir = (e: number, v: number): Vec =>
    unit(sub(point(topology, otherEnd(e, v)), point(topology, v)));
  const edgeLength = (e: number) => {
    const [a, b] = edgeVertices(topology, e);
    return length(sub(point(topology, a), point(topology, b)));
  };

  // The normal of every face, taken the way its own triangles face
  const faceNormal = (f: number): Vec => {
    const t = topology.faces[f]!.triangles[0]!;
    const p = (i: number): Vec => [
      mesh.positions[i * 3]!,
      mesh.positions[i * 3 + 1]!,
      mesh.positions[i * 3 + 2]!,
    ];
    const a = p(mesh.indices[t * 3]!);
    const b = p(mesh.indices[t * 3 + 1]!);
    const c = p(mesh.indices[t * 3 + 2]!);
    return unit(cross(sub(b, a), sub(c, a)));
  };
  const normals = topology.faces.map((_, f) => faceNormal(f));

  // How far along each plain (not bevelled) edge, at each touched corner, the cut reaches; and the corner of a
  // face between two bevelled edges
  const reach = new Map<string, number>(); // `${edge}:${vertex}` -> distance along the edge
  const insetCorner = new Map<string, Vec>(); // `${face}:${vertex}` -> where the two cuts meet
  const key = (a: number, b: number) => `${a}:${b}`;
  for (const v of touched) {
    for (const e of topology.vertexEdges[v]!) {
      if (bevelled.has(e)) continue;
      let t = 0;
      for (const f of topology.edgeFaces[e]!) {
        const [e1, e2] = edgesAt(f, v);
        const other = e1 === e ? e2 : e1;
        if (!bevelled.has(other)) continue;
        const sin = Math.max(0.05, length(cross(dir(e, v), dir(other, v))));
        t = Math.max(t, w / sin);
      }
      reach.set(key(e, v), Math.min(t, edgeLength(e) * MAX_REACH));
    }
    for (const f of topology.vertexEdges[v]!.flatMap(
      (e) => topology.edgeFaces[e]!,
    )) {
      const [e1, e2] = edgesAt(f, v);
      if (bevelled.has(e1) && bevelled.has(e2) && !insetCorner.has(key(f, v))) {
        const a = dir(e1, v);
        const b = dir(e2, v);
        const bisector = unit(add(a, b));
        const sinHalf = Math.max(
          0.05,
          Math.sqrt(Math.max(0, (1 - dot(a, b)) / 2)),
        );
        insetCorner.set(
          key(f, v),
          add(point(topology, v), scale(bisector, w / sinHalf)),
        );
      }
    }
  }
  const plainPoint = (e: number, v: number): Vec =>
    add(point(topology, v), scale(dir(e, v), reach.get(key(e, v)) ?? 0));
  /** Where the face's boundary meets edge `e` at corner `v`. */
  const onSide = (e: number, f: number, v: number): Vec => {
    if (!touched.has(v)) return point(topology, v);
    const [e1, e2] = edgesAt(f, v);
    if (!bevelled.has(e)) return plainPoint(e, v);
    const other = e1 === e ? e2 : e1;
    return bevelled.has(other)
      ? insetCorner.get(key(f, v))!
      : plainPoint(other, v);
  };

  const positions: number[] = Array.from(mesh.positions);
  // The map: a new point takes a place on it from the points of the faces round it (a cut point lies on its own face,
  // a strip point between the two faces it joins), so the bevel stays on the map
  const uvs: number[] | null = mesh.uvs ? Array.from(mesh.uvs) : null;
  const uvOf = (i: number): [number, number] =>
    uvs ? [uvs[i * 2]!, uvs[i * 2 + 1]!] : [0, 0];
  const indices: number[] = [];
  const shared = new Map<string, number>();
  const strip = new Set<number>();
  const alloc = (
    p: Vec,
    name?: string,
    uv: [number, number] = [0, 0],
  ): number => {
    if (name !== undefined) {
      const found = shared.get(name);
      if (found !== undefined) return found;
    }
    const id = positions.length / 3;
    positions.push(p[0], p[1], p[2]);
    uvs?.push(uv[0], uv[1]);
    if (name !== undefined) shared.set(name, id);
    return id;
  };
  const at = (i: number): Vec => [
    positions[i * 3]!,
    positions[i * 3 + 1]!,
    positions[i * 3 + 2]!,
  ];

  /** Turns a polygon of points into triangles facing `target`. */
  const fill = (poly: number[], target: Vec) => {
    if (poly.length < 3) return;
    // The Newell normal of the polygon, to see which way round it goes
    const normal: Vec = [0, 0, 0];
    for (let i = 0; i < poly.length; i++) {
      const p = at(poly[i]!);
      const q = at(poly[(i + 1) % poly.length]!);
      normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
      normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
      normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const ordered = dot(normal, target) < 0 ? [...poly].reverse() : poly;
    for (let i = 1; i + 1 < ordered.length; i++) {
      indices.push(ordered[0]!, ordered[i]!, ordered[i + 1]!);
    }
  };

  // Faces that touch a changed corner are rebuilt; the others keep their triangles
  const rebuilt = new Set<number>();
  for (const v of touched) {
    for (const e of topology.vertexEdges[v]!)
      for (const f of topology.edgeFaces[e]!) rebuilt.add(f);
  }
  for (let t = 0; t * 3 < mesh.indices.length; t++) {
    const f = topology.triangleFace[t]!;
    if (f !== -1 && rebuilt.has(f)) continue;
    indices.push(
      mesh.indices[t * 3]!,
      mesh.indices[t * 3 + 1]!,
      mesh.indices[t * 3 + 2]!,
    );
  }

  /** The point of the mesh that stands for a vertex in a face (so untouched corners keep their own points). */
  const ownPoint = (f: number, v: number): number => {
    for (const t of topology.faces[f]!.triangles) {
      for (let k = 0; k < 3; k++) {
        const p = mesh.indices[t * 3 + k]!;
        if (topology.vertexOf[p] === v) return p;
      }
    }
    return topology.vertexPoints[v]![0]!;
  };

  for (const f of rebuilt) {
    const cycle = faceCycle(f);
    const poly: number[] = [];
    cycle.forEach((v, i) => {
      if (!touched.has(v)) {
        poly.push(ownPoint(f, v));
        return;
      }
      const prev = edgeBetween(
        topology,
        cycle[(i + cycle.length - 1) % cycle.length]!,
        v,
      );
      const next = edgeBetween(topology, v, cycle[(i + 1) % cycle.length]!);
      const first = onSide(prev, f, v);
      const second = onSide(next, f, v);
      const make = (p: Vec) =>
        same(p, point(topology, v))
          ? ownPoint(f, v)
          : alloc(p, undefined, uvOf(ownPoint(f, v)));
      poly.push(make(first));
      if (!same(first, second)) poly.push(make(second));
    });
    fill(poly, normals[f]!);
  }

  // The strip along each bevelled edge, one profile at each end
  const profile = (e: number, v: number): number[] => {
    const [left, right] = topology.edgeFaces[e]! as [number, number];
    const a = onSide(e, left, v);
    const b = onSide(e, right, v);
    const control = point(topology, v);
    const ua = uvOf(ownPoint(left, v));
    const ub = uvOf(ownPoint(right, v));
    return Array.from({ length: n + 1 }, (_, j) => {
      const t = j / n;
      const id = alloc(curve(a, control, b, t), `strip:${e}:${v}:${j}`, [
        ua[0] + (ub[0] - ua[0]) * t,
        ua[1] + (ub[1] - ua[1]) * t,
      ]);
      strip.add(id);
      return id;
    });
  };
  for (const e of bevelled) {
    const [u, v] = edgeVertices(topology, e);
    const pu = profile(e, u);
    const pv = profile(e, v);
    const [left, right] = topology.edgeFaces[e]!;
    const target = unit(add(normals[left!]!, normals[right!]!));
    for (let j = 0; j < n; j++) {
      fill([pu[j]!, pu[j + 1]!, pv[j + 1]!, pv[j]!], target);
    }
  }

  // The gap at each corner where bevels meet
  for (const v of touched) {
    // The edges and faces round the corner in order: faces[i] lies between ring[i] and ring[i + 1]
    const ring: number[] = [];
    const faces: number[] = [];
    let edge = topology.vertexEdges[v]![0]!;
    let face = topology.edgeFaces[edge]![0]!;
    for (let guard = 0; guard < topology.vertexEdges[v]!.length + 2; guard++) {
      ring.push(edge);
      faces.push(face);
      const [e1, e2] = edgesAt(face, v);
      edge = e1 === edge ? e2 : e1;
      const [fa, fb] = topology.edgeFaces[edge]! as [number, number];
      face = fa === face ? fb : fa;
      if (edge === ring[0]) break;
    }
    const border: number[] = [];
    ring.forEach((e, i) => {
      const before = faces[(i + faces.length - 1) % faces.length]!;
      if (bevelled.has(e)) {
        const [left] = topology.edgeFaces[e]! as [number, number];
        const strips = Array.from({ length: n + 1 }, (_, j) =>
          shared.get(`strip:${e}:${v}:${j}`)!,
        );
        border.push(...(left === before ? strips : [...strips].reverse()));
      } else {
        const p = plainPoint(e, v);
        border.push(
          alloc(p, undefined, uvOf(ownPoint(topology.edgeFaces[e]![0]!, v))),
        );
      }
    });
    // Drop points that sit on top of the one before them
    const distinct = border.filter(
      (p, i) =>
        !same(at(p), at(border[(i + border.length - 1) % border.length]!)),
    );
    if (distinct.length < 3) continue;
    // Where two bevelled edges meet at a corner whose other edge is plain, the two strips share the same end curve (a
    // mitre), so the border of the "gap" has no area: filling it would stack zero-area faces on the strips
    const borderNormal: Vec = [0, 0, 0];
    for (let i = 0; i < distinct.length; i++) {
      const p = at(distinct[i]!);
      const q = at(distinct[(i + 1) % distinct.length]!);
      borderNormal[0] += (p[1] - q[1]) * (p[2] + q[2]);
      borderNormal[1] += (p[2] - q[2]) * (p[0] + q[0]);
      borderNormal[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    if (length(borderNormal) < 1e-6 * w * w) continue;
    const target = unit(
      faces.reduce<Vec>((sum, f) => add(sum, normals[f]!), [0, 0, 0]),
    );
    if (n === 1 || distinct.length === 3) {
      fill(distinct, target);
    } else {
      // A rounded corner: a fan from a middle point drawn a little towards the old corner
      const middle = scale(
        distinct.reduce<Vec>((sum, p) => add(sum, at(p)), [0, 0, 0]),
        1 / distinct.length,
      );
      let su = 0;
      let sv = 0;
      for (const p of distinct) {
        su += uvOf(p)[0];
        sv += uvOf(p)[1];
      }
      const centre = alloc(
        add(middle, scale(sub(point(topology, v), middle), 0.3)),
        undefined,
        [su / distinct.length, sv / distinct.length],
      );
      for (let i = 0; i < distinct.length; i++) {
        fill(
          [distinct[i]!, distinct[(i + 1) % distinct.length]!, centre],
          target,
        );
      }
    }
  }

  // Only the points that are used stay, renumbered; creases follow
  const used = new Set(indices);
  const renumber = new Int32Array(positions.length / 3).fill(-1);
  const kept: number[] = [];
  const keptUvs: number[] | null = uvs ? [] : null;
  let next = 0;
  for (let p = 0; p < positions.length / 3; p++) {
    if (!used.has(p)) continue;
    renumber[p] = next++;
    kept.push(positions[p * 3]!, positions[p * 3 + 1]!, positions[p * 3 + 2]!);
    if (keptUvs && uvs) keptUvs.push(uvs[p * 2]!, uvs[p * 2 + 1]!);
  }
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(kept),
      indices: Uint32Array.from(indices, (p) => renumber[p]!),
      creases: remapCreases(
        mesh.creases,
        renumber.subarray(0, mesh.positions.length / 3),
      ),
      ...seamsOf(
        remapSeams(mesh.seams, renumber.subarray(0, mesh.positions.length / 3)),
      ),
      ...(keptUvs ? { uvs: Float32Array.from(keptUvs) } : {}),
    },
    selected: [...strip]
      .filter((p) => renumber[p]! >= 0)
      .map((p) => renumber[p]!),
    width: w,
  };
}
