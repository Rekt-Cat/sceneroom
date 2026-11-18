import { remapCreases } from "./creases";
import { weldGroups, type EditMesh } from "./meshEdit";
import { remapSeams, seamsOf } from "./seams";
import {
  DEFAULT_UV_MARGIN,
  faceLinks,
  finishUnwrap,
  type Flat,
  type UnwrapOptions,
  type UnwrapResult,
} from "./unwrap";

/** The most triangles the careful unwrap solves for (it is a large system of equations; a bigger mesh is refused). */
export const MAX_LSCM_TRIANGLES = 60_000;
/** The solver stops after this many rounds, or earlier when the answer stops improving. */
const MAX_ITERATIONS = 4000;
const TOLERANCE = 1e-9;

type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (a: Vec) => Math.hypot(a[0], a[1], a[2]);

export type SeamUnwrapResult =
  | (Extract<UnwrapResult, { ok: true }> & {
      /** Faces that came out turned over (the piece folds over itself there); 0 when the map is clean. */
      folded: number;
    })
  | { ok: false; reason: string };

/**
 * The WEDGE of every triangle corner (3 per triangle): corners round one spot that are joined by faces without
 * crossing a seam have the same number. A spot cut by a seam has one wedge on each side, so each becomes its own
 * vertex on the map.
 */
function wedgesOf(mesh: EditMesh): Int32Array {
  const groups = weldGroups(mesh.positions);
  const { neighbours } = faceLinks(mesh, groups);
  const triangleCount = mesh.indices.length / 3;
  const parent = Int32Array.from({ length: triangleCount * 3 }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let t = 0; t < triangleCount; t++) {
    for (const u of neighbours(t)) {
      if (u < t) continue;
      for (let k = 0; k < 3; k++) {
        for (let m = 0; m < 3; m++) {
          if (
            groups.ids[mesh.indices[t * 3 + k]!] ===
            groups.ids[mesh.indices[u * 3 + m]!]
          ) {
            parent[find(t * 3 + k)] = find(u * 3 + m);
          }
        }
      }
    }
  }
  return Int32Array.from(parent, (_, c) => find(c));
}

/**
 * A mesh whose points are split along its seams: a point used by faces on both sides of a seam becomes one point for
 * each side (same place), so that every point has one place on the map. Returns the same mesh when nothing needs
 * splitting. Creases and seams follow their points.
 */
function splitPointsAtSeams(mesh: EditMesh): EditMesh {
  if (!mesh.seams || mesh.seams.length === 0) return mesh;
  const wedge = wedgesOf(mesh);
  const find = (c: number) => wedge[c]!;
  const positions = Array.from(mesh.positions);
  const indices = Uint32Array.from(mesh.indices);
  const made = new Map<string, number>();
  const first = new Int32Array(mesh.positions.length / 3).fill(-1);
  let split = false;
  for (let c = 0; c < indices.length; c++) {
    const point = mesh.indices[c]!;
    const root = find(c);
    if (first[point] === -1) {
      first[point] = root;
      made.set(`${point}:${root}`, point);
    }
    const key = `${point}:${root}`;
    let id = made.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      positions.push(
        mesh.positions[point * 3]!,
        mesh.positions[point * 3 + 1]!,
        mesh.positions[point * 3 + 2]!,
      );
      made.set(key, id);
      split = true;
    }
    indices[c] = id;
  }
  if (!split) return mesh;
  // Seams and creases keep naming the original point of each place; the original points are still there
  return {
    positions: Float32Array.from(positions),
    indices,
    creases: remapCreases(
      mesh.creases,
      Int32Array.from({ length: mesh.positions.length / 3 }, (_, i) => i),
    ),
    ...seamsOf(
      remapSeams(
        mesh.seams,
        Int32Array.from({ length: mesh.positions.length / 3 }, (_, i) => i),
      ),
    ),
  };
}

/**
 * Unwrap along seams: lays each piece of the surface (the faces that touch without crossing a seam) flat with the
 * least squares conformal map (LSCM), which keeps angles: a small shape stays the same shape on the map, so a
 * texture does not shear. Each piece must be open (cut along the seams so it can lie flat, like a shirt): a closed
 * piece is refused with a plain message. The pieces keep their real size relative to each other and are packed
 * into the 0 to 1 square.
 *
 * A piece that cannot lie flat without folding (a ring with no cut across it, a bump) still gets a map, and
 * `folded` says how many faces came out turned over, so the person can add a seam.
 */
export function unwrapAlongSeams(
  input: EditMesh,
  options: UnwrapOptions = {},
): SeamUnwrapResult {
  // Points shared across a seam are split first, so each point has one place on the map
  const mesh = splitPointsAtSeams(input);
  const margin = Math.min(
    0.2,
    Math.max(0, options.margin ?? DEFAULT_UV_MARGIN),
  );
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount === 0)
    return { ok: false, reason: "There are no faces to unwrap." };
  if (triangleCount > MAX_LSCM_TRIANGLES) {
    return {
      ok: false,
      reason: `Unwrapping along seams works on up to ${MAX_LSCM_TRIANGLES.toLocaleString("en-US")} triangles; this mesh has ${triangleCount.toLocaleString("en-US")}. Use Unwrap instead.`,
    };
  }
  const groups = weldGroups(mesh.positions);
  const { neighbours, edgeKey } = faceLinks(mesh, groups);
  const wedge = wedgesOf(mesh);
  const point = (i: number): Vec => [
    mesh.positions[i * 3]!,
    mesh.positions[i * 3 + 1]!,
    mesh.positions[i * 3 + 2]!,
  ];

  // The pieces: faces joined across edges that are not seams
  const pieceOf = new Int32Array(triangleCount).fill(-1);
  const pieces: number[][] = [];
  for (let seed = 0; seed < triangleCount; seed++) {
    if (pieceOf[seed] !== -1) continue;
    const id = pieces.length;
    const members = [seed];
    pieceOf[seed] = id;
    for (let k = 0; k < members.length; k++) {
      for (const other of neighbours(members[k]!)) {
        if (pieceOf[other] === -1) {
          pieceOf[other] = id;
          members.push(other);
        }
      }
    }
    pieces.push(members);
  }

  let folded = 0;
  const flats: Flat[] = [];
  for (let id = 0; id < pieces.length; id++) {
    const members = pieces[id]!;
    // A piece that is closed has no edge to cut along: it cannot be laid flat
    const edgeCount = new Map<string, number>();
    for (const t of members) {
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(
          mesh.indices[t * 3 + k]!,
          mesh.indices[t * 3 + ((k + 1) % 3)]!,
        );
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }
    if (![...edgeCount.values()].some((n) => n === 1)) {
      return {
        ok: false,
        reason:
          "A piece of the surface is closed, with no seam or open edge, so it cannot be laid flat. Mark seams to cut it open first, like cutting along the edges of a box. A cylinder with lids needs a seam round its top edge and round its bottom edge as well as one down its side. (Or use Unwrap, which needs no seams.)",
      };
    }
    const solved = solvePiece(mesh, wedge, members, edgeCount, edgeKey, point);
    folded += solved.folded;
    flats.push(solved.flat);
  }
  const result = finishUnwrap(mesh, pieceOf, flats, pieces.length, margin);
  return result.ok ? { ...result, folded } : result;
}

/** Lays one piece flat (the conformal map), turned and shifted so it starts at the corner. */
function solvePiece(
  mesh: EditMesh,
  wedge: Int32Array,
  members: readonly number[],
  edgeCount: ReadonlyMap<string, number>,
  edgeKey: (a: number, b: number) => string,
  point: (i: number) => Vec,
): { flat: Flat; folded: number } {
  // The vertices (spots) of the piece, numbered from 0
  const local = new Map<number, number>();
  const spotPoint: number[] = []; // a point standing for each local vertex
  const corners: [number, number, number][] = [];
  for (const t of members) {
    const c: number[] = [];
    for (let k = 0; k < 3; k++) {
      const pt = mesh.indices[t * 3 + k]!;
      const spot = wedge[t * 3 + k]!;
      let index = local.get(spot);
      if (index === undefined) {
        index = local.size;
        local.set(spot, index);
        spotPoint.push(pt);
      }
      c.push(index);
    }
    corners.push(c as [number, number, number]);
  }
  const n = local.size;

  // Every triangle drawn flat in its own plane (a at the origin, b along x), and its weights for the equations
  const wr: number[][] = [];
  const wi: number[][] = [];
  const keep: number[] = []; // indices of triangles with an area
  const area3d: number[] = [];
  members.forEach((t, index) => {
    const a = point(mesh.indices[t * 3]!);
    const b = point(mesh.indices[t * 3 + 1]!);
    const c = point(mesh.indices[t * 3 + 2]!);
    const normal = cross(sub(b, a), sub(c, a));
    const twice = length(normal);
    area3d.push(twice / 2);
    if (twice < 1e-12) return;
    const e1 = sub(b, a);
    const l1 = length(e1);
    const ux: Vec = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
    const nu: Vec = [normal[0] / twice, normal[1] / twice, normal[2] / twice];
    const uy = cross(nu, ux);
    const ac = sub(c, a);
    const x: [number, number, number] = [0, l1, dot(ac, ux)];
    const y: [number, number, number] = [0, 0, dot(ac, uy)];
    // W_j = (the next two vertices' difference) / sqrt(2 * area)
    const scale = 1 / Math.sqrt(twice);
    wr.push([
      (x[2] - x[1]) * scale,
      (x[0] - x[2]) * scale,
      (x[1] - x[0]) * scale,
    ]);
    wi.push([
      (y[2] - y[1]) * scale,
      (y[0] - y[2]) * scale,
      (y[1] - y[0]) * scale,
    ]);
    keep.push(index);
  });

  // Two vertices on the border, far apart, are held in place; everything else is solved for
  const border = new Set<number>();
  members.forEach((t, index) => {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t * 3 + k]!;
      const b = mesh.indices[t * 3 + ((k + 1) % 3)]!;
      if (edgeCount.get(edgeKey(a, b)) === 1) {
        border.add(corners[index]![k]!);
        border.add(corners[index]![(k + 1) % 3]!);
      }
    }
  });
  const borderList = [...border];
  const farthest = (from: number) => {
    let best = borderList[0]!;
    let bestDistance = -1;
    for (const v of borderList) {
      const d = length(sub(point(spotPoint[v]!), point(spotPoint[from]!)));
      if (d > bestDistance) {
        bestDistance = d;
        best = v;
      }
    }
    return { vertex: best, distance: bestDistance };
  };
  const pinA = farthest(borderList[0]!).vertex;
  const { vertex: pinB, distance } = farthest(pinA);
  const pinned = new Uint8Array(n);
  pinned[pinA] = 1;
  pinned[pinB] = 1;

  // The starting guess: the piece projected onto its average plane
  const x = new Float64Array(2 * n);
  {
    const sum: Vec = [0, 0, 0];
    members.forEach((t) => {
      const a = point(mesh.indices[t * 3]!);
      const b = point(mesh.indices[t * 3 + 1]!);
      const c = point(mesh.indices[t * 3 + 2]!);
      const nrm = cross(sub(b, a), sub(c, a));
      sum[0] += nrm[0];
      sum[1] += nrm[1];
      sum[2] += nrm[2];
    });
    const l = length(sum) || 1;
    const nn: Vec = [sum[0] / l, sum[1] / l, sum[2] / l];
    const least: Vec =
      Math.abs(nn[0]) <= Math.abs(nn[1]) && Math.abs(nn[0]) <= Math.abs(nn[2])
        ? [1, 0, 0]
        : Math.abs(nn[1]) <= Math.abs(nn[2])
          ? [0, 1, 0]
          : [0, 0, 1];
    const tangent = cross(nn, least);
    const tl = length(tangent) || 1;
    const tt: Vec = [tangent[0] / tl, tangent[1] / tl, tangent[2] / tl];
    const bt = cross(nn, tt);
    for (let v = 0; v < n; v++) {
      const at = point(spotPoint[v]!);
      x[2 * v] = dot(at, tt);
      x[2 * v + 1] = dot(at, bt);
    }
  }
  x[2 * pinA] = 0;
  x[2 * pinA + 1] = 0;
  x[2 * pinB] = distance;
  x[2 * pinB + 1] = 0;

  const count = keep.length;
  const verts = keep.map((index) => corners[index]!);
  /** y = A x over all unknowns (two rows per triangle). */
  const apply = (input: Float64Array, out: Float64Array) => {
    for (let t = 0; t < count; t++) {
      let re = 0;
      let im = 0;
      for (let j = 0; j < 3; j++) {
        const v = verts[t]![j]!;
        const u = input[2 * v]!;
        const w = input[2 * v + 1]!;
        re += wr[t]![j]! * u - wi[t]![j]! * w;
        im += wi[t]![j]! * u + wr[t]![j]! * w;
      }
      out[2 * t] = re;
      out[2 * t + 1] = im;
    }
  };
  /** g = A^T y. */
  const applyTranspose = (input: Float64Array, out: Float64Array) => {
    out.fill(0);
    for (let t = 0; t < count; t++) {
      const re = input[2 * t]!;
      const im = input[2 * t + 1]!;
      for (let j = 0; j < 3; j++) {
        const v = verts[t]![j]!;
        out[2 * v] = out[2 * v]! + wr[t]![j]! * re + wi[t]![j]! * im;
        out[2 * v + 1] = out[2 * v + 1]! - wi[t]![j]! * re + wr[t]![j]! * im;
      }
    }
  };
  const free = (i: number) => pinned[i >> 1] === 0;
  const rows = new Float64Array(2 * count);
  /** out = (A^T A) input, with the held vertices left out. */
  const normal = (input: Float64Array, out: Float64Array) => {
    apply(input, rows);
    applyTranspose(rows, out);
    for (let i = 0; i < out.length; i++) if (!free(i)) out[i] = 0;
  };

  // Conjugate gradient on the normal equations (A^T A) x = b for the free unknowns, with a diagonal preconditioner
  const diag = new Float64Array(2 * n).fill(0);
  for (let t = 0; t < count; t++) {
    for (let j = 0; j < 3; j++) {
      const v = verts[t]![j]!;
      const s = wr[t]![j]! ** 2 + wi[t]![j]! ** 2;
      diag[2 * v] = diag[2 * v]! + s;
      diag[2 * v + 1] = diag[2 * v + 1]! + s;
    }
  }
  const inverse = diag.map((d) => (d > 1e-12 ? 1 / d : 1));
  // Residual b - A^T A x for the free unknowns, starting from the guess
  const ax = new Float64Array(2 * n);
  apply(x, rows);
  applyTranspose(rows, ax);
  const r = new Float64Array(2 * n);
  for (let i = 0; i < r.length; i++) r[i] = free(i) ? -ax[i]! : 0;
  const z = r.map((value, i) => value * inverse[i]!);
  const direction = Float64Array.from(z);
  let rz = r.reduce((sum, value, i) => sum + value * z[i]!, 0);
  const start =
    Math.sqrt(r.reduce((sum, value) => sum + value * value, 0)) || 1;
  const q = new Float64Array(2 * n);
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    normal(direction, q);
    const denominator = direction.reduce(
      (sum, value, i) => sum + value * q[i]!,
      0,
    );
    if (!(Math.abs(denominator) > 1e-300)) break;
    const alpha = rz / denominator;
    for (let i = 0; i < x.length; i++) {
      if (!free(i)) continue;
      x[i] = x[i]! + alpha * direction[i]!;
      r[i] = r[i]! - alpha * q[i]!;
    }
    const size = Math.sqrt(r.reduce((sum, value) => sum + value * value, 0));
    if (size / start < TOLERANCE) break;
    for (let i = 0; i < z.length; i++) z[i] = r[i]! * inverse[i]!;
    const next = r.reduce((sum, value, i) => sum + value * z[i]!, 0);
    const beta = next / rz;
    rz = next;
    for (let i = 0; i < direction.length; i++) {
      direction[i] = z[i]! + beta * direction[i]!;
    }
  }

  // The solution may be a mirror image: make the faces keep their winding
  const signedArea = (t: number) => {
    const [a, b, c] = corners[t]!;
    return (
      ((x[2 * b]! - x[2 * a]!) * (x[2 * c + 1]! - x[2 * a + 1]!) -
        (x[2 * b + 1]! - x[2 * a + 1]!) * (x[2 * c]! - x[2 * a]!)) /
      2
    );
  };
  let net = 0;
  for (let t = 0; t < members.length; t++) net += signedArea(t);
  if (net < 0) for (let v = 0; v < n; v++) x[2 * v] = -x[2 * v]!;
  let foldedHere = 0;
  let positive = 0;
  for (let t = 0; t < members.length; t++) {
    const a = signedArea(t) * (net < 0 ? -1 : 1);
    if (a < -1e-12) foldedHere++;
    else positive += Math.max(0, a);
  }
  // Real size: the map has the same area as the surface it came from
  const total3d = area3d.reduce((sum, value) => sum + value, 0);
  const scale = positive > 1e-12 ? Math.sqrt(total3d / positive) : 1;

  // Turn the piece so its long direction lies across (the principal axis), then start it at the corner
  let mx = 0;
  let my = 0;
  for (let v = 0; v < n; v++) {
    mx += x[2 * v]!;
    my += x[2 * v + 1]!;
  }
  mx /= n;
  my /= n;
  let cxx = 0;
  let cxy = 0;
  let cyy = 0;
  for (let v = 0; v < n; v++) {
    const dx = x[2 * v]! - mx;
    const dy = x[2 * v + 1]! - my;
    cxx += dx * dx;
    cxy += dx * dy;
    cyy += dy * dy;
  }
  const angle = -0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const uv: [number, number][] = [];
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (let v = 0; v < n; v++) {
    const dx = (x[2 * v]! - mx) * scale;
    const dy = (x[2 * v + 1]! - my) * scale;
    const u = dx * cos - dy * sin;
    const w = dx * sin + dy * cos;
    uv.push([u, w]);
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, w);
    maxV = Math.max(maxV, w);
  }
  const map = new Map<number, [number, number]>();
  members.forEach((t, index) => {
    for (let k = 0; k < 3; k++) {
      const pt = mesh.indices[t * 3 + k]!;
      const [u, w] = uv[corners[index]![k]!]!;
      map.set(pt, [u - minU, w - minV]);
    }
  });
  return {
    flat: { u: map, width: maxU - minU, height: maxV - minV },
    folded: foldedHere,
  };
}

/**
 * How stretched each triangle is on the map, from 0 (as it should be) up to 1 (as bad as it gets). It is the worse of:
 *  - the SHAPE change: how far the map turns a small circle into an ellipse (0 for a perfect, angle keeping map),
 *  - the SIZE change: how far the triangle's share of the map is from the average share (twice or half as big is 1),
 *  - a triangle turned over on the map, which is always 1.
 * Also returns how many triangles are turned over. A mesh without UVs has nothing to measure (all zero).
 */
export function uvStretch(mesh: EditMesh): {
  values: Float32Array;
  folded: number;
} {
  const triangles = mesh.indices.length / 3;
  const values = new Float32Array(triangles);
  if (!mesh.uvs) return { values, folded: 0 };
  const shape = new Float64Array(triangles);
  const ratio = new Float64Array(triangles);
  const flipped = new Uint8Array(triangles);
  let area3d = 0;
  let areaUv = 0;
  for (let t = 0; t < triangles; t++) {
    const ia = mesh.indices[t * 3]!;
    const ib = mesh.indices[t * 3 + 1]!;
    const ic = mesh.indices[t * 3 + 2]!;
    const a: Vec = [
      mesh.positions[ia * 3]!,
      mesh.positions[ia * 3 + 1]!,
      mesh.positions[ia * 3 + 2]!,
    ];
    const b: Vec = [
      mesh.positions[ib * 3]!,
      mesh.positions[ib * 3 + 1]!,
      mesh.positions[ib * 3 + 2]!,
    ];
    const c: Vec = [
      mesh.positions[ic * 3]!,
      mesh.positions[ic * 3 + 1]!,
      mesh.positions[ic * 3 + 2]!,
    ];
    const e1 = sub(b, a);
    const nrm = cross(e1, sub(c, a));
    const twice = length(nrm);
    if (twice < 1e-12) {
      ratio[t] = NaN;
      continue;
    }
    const l1 = length(e1);
    const ux: Vec = [e1[0] / l1, e1[1] / l1, e1[2] / l1];
    const nu: Vec = [nrm[0] / twice, nrm[1] / twice, nrm[2] / twice];
    const uy = cross(nu, ux);
    const ac = sub(c, a);
    // The triangle in its own plane: (0, 0), (l1, 0), (cx, cy)
    const cx = dot(ac, ux);
    const cy = dot(ac, uy);
    const uv = mesh.uvs;
    const q1: [number, number] = [
      uv[ib * 2]! - uv[ia * 2]!,
      uv[ib * 2 + 1]! - uv[ia * 2 + 1]!,
    ];
    const q2: [number, number] = [
      uv[ic * 2]! - uv[ia * 2]!,
      uv[ic * 2 + 1]! - uv[ia * 2 + 1]!,
    ];
    // S maps the flat triangle to its map: S [l1 0; cx cy]^T = [q1 q2]
    const s00 = q1[0] / l1;
    const s10 = q1[1] / l1;
    const s01 = (q2[0] - s00 * cx) / cy;
    const s11 = (q2[1] - s10 * cx) / cy;
    const det = s00 * s11 - s01 * s10;
    const energy = s00 * s00 + s01 * s01 + s10 * s10 + s11 * s11;
    const half = energy / 2;
    const spread = Math.sqrt(Math.max(0, half * half - det * det));
    const big = Math.sqrt(Math.max(0, half + spread));
    const small = Math.sqrt(Math.max(0, half - spread));
    shape[t] = big > 1e-12 ? 1 - small / big : 1;
    ratio[t] = Math.abs(det);
    flipped[t] = det < -1e-12 ? 1 : 0;
    area3d += twice / 2;
    areaUv += Math.abs(det) * (twice / 2);
  }
  const average = area3d > 0 ? areaUv / area3d : 1;
  let folded = 0;
  for (let t = 0; t < triangles; t++) {
    if (Number.isNaN(ratio[t]!)) continue;
    if (flipped[t]) {
      values[t] = 1;
      folded++;
      continue;
    }
    const size =
      ratio[t]! > 1e-12 && average > 1e-12
        ? Math.min(1, Math.abs(Math.log(ratio[t]! / average)) / Math.LN2)
        : 1;
    values[t] = Math.min(1, Math.max(shape[t]!, size));
  }
  return { values, folded };
}
