import type { Crease } from "./creases";
import { seamsOf, type Seam } from "./seams";
import type { EditMesh, EditResult } from "./meshEdit";
import { buildTopology, edgeBetween } from "./topology";

/** The most cuts one Divide can make across a face (each cut adds a line of new edges). */
export const MAX_DIVIDE_CUTS = 10;
export const DEFAULT_DIVIDE_CUTS = 1;
/** Divide refuses when the result would have more triangles than this. */
export const MAX_DIVIDED_TRIANGLES = 400_000;

type Vec = [number, number, number];

/** A whole number of cuts, from 1 to the most. */
export function sanitizeDivideCuts(cuts: number): number {
  if (!Number.isFinite(cuts)) return DEFAULT_DIVIDE_CUTS;
  return Math.min(MAX_DIVIDE_CUTS, Math.max(1, Math.round(cuts)));
}

/**
 * Divide faces: every selected face (a square, or a triangle) is cut into smaller ones, evenly, without changing
 * the shape. `cuts` is how many lines are cut across it: 1 cuts a square into 4, 2 into 9, and so on. With nothing
 * selected the whole mesh is divided. Faces that share an edge (and the same points on it) stay joined, so the
 * surface keeps its smooth shading; faces with separate points keep their hard edge.
 *
 * Next to faces that are NOT divided the edge gets extra points on a straight line: the surface does not crack, but
 * the neighbour has a point on its side that it does not use (divide whole regions to avoid that).
 *
 * Creases on a divided edge are carried to the pieces. Returns the new mesh and the divided faces' points as the
 * selection.
 */
export function divideFaces(
  mesh: EditMesh,
  selected: readonly number[],
  cuts: number,
): EditResult {
  const n = sanitizeDivideCuts(cuts) + 1;
  const topology = buildTopology(mesh);
  const chosenVertices = new Set<number>();
  for (const p of selected) {
    const v = topology.vertexOf[p];
    if (v !== undefined) chosenVertices.add(v);
  }
  const chosen: number[] = [];
  for (let f = 0; f < topology.faces.length; f++) {
    const vertices = topology.faces[f]!.vertices;
    if (selected.length === 0 || vertices.every((v) => chosenVertices.has(v))) {
      chosen.push(f);
    }
  }
  if (chosen.length === 0) {
    return {
      ok: false,
      reason:
        "Select a whole face first (press 3 for face mode, then click one), or select nothing to divide everything.",
    };
  }
  const chosenSet = new Set(chosen);
  // The faces next to a divided face that are not divided themselves: the divided edge has new points on it, so they
  // are cut up to use them (or the new points would sit on one face only and the surface would be open there)
  const joined = new Set<number>();
  const dividedEdges = new Set<number>();
  for (const f of chosen) {
    const vs = topology.faces[f]!.vertices;
    for (let i = 0; i < vs.length; i++) {
      const e = edgeBetween(topology, vs[i]!, vs[(i + 1) % vs.length]!);
      if (e === -1) continue;
      for (const other of topology.edgeFaces[e]!) {
        if (chosenSet.has(other)) continue;
        joined.add(other);
        dividedEdges.add(e);
      }
    }
  }
  let estimate = 0;
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const f = topology.triangleFace[t]!;
    if (f === -1 || !(chosenSet.has(f) || joined.has(f))) estimate += 1;
  }
  for (const f of chosen) {
    estimate += (topology.faces[f]!.vertices.length === 4 ? 2 : 1) * n * n;
  }
  estimate += joined.size * (4 + 2 * n);
  if (estimate > MAX_DIVIDED_TRIANGLES) {
    return {
      ok: false,
      reason: `That would make about ${estimate.toLocaleString("en-US")} triangles (the limit is ${MAX_DIVIDED_TRIANGLES.toLocaleString("en-US")}). Use fewer cuts or divide fewer faces.`,
    };
  }

  const positions: number[] = Array.from(mesh.positions);
  const indices: number[] = [];
  const at = (p: number): Vec => [
    positions[p * 3]!,
    positions[p * 3 + 1]!,
    positions[p * 3 + 2]!,
  ];
  // The map goes along: a new point gets a place on it worked out from the points it lies between
  const uvs: number[] | null = mesh.uvs ? Array.from(mesh.uvs) : null;
  const uvAt = (p: number): [number, number] =>
    uvs ? [uvs[p * 2]!, uvs[p * 2 + 1]!] : [0, 0];
  const addPoint = (p: Vec, uv: [number, number] = [0, 0]): number => {
    positions.push(p[0], p[1], p[2]);
    uvs?.push(uv[0], uv[1]);
    return positions.length / 3 - 1;
  };

  // The triangles of faces that are not divided stay as they are
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const f = topology.triangleFace[t]!;
    if (f !== -1 && (chosenSet.has(f) || joined.has(f))) continue;
    indices.push(
      mesh.indices[t * 3]!,
      mesh.indices[t * 3 + 1]!,
      mesh.indices[t * 3 + 2]!,
    );
  }

  // The new points along an edge, from the smaller point number to the larger: made once, shared by the faces on it
  const along = new Map<string, number[]>();
  const edgeChain = (a: number, b: number): number[] => {
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const key = `${low},${high}`;
    let chain = along.get(key);
    if (!chain) {
      const pa = at(low);
      const pb = at(high);
      const ua = uvAt(low);
      const ub = uvAt(high);
      chain = [];
      for (let k = 1; k < n; k++) {
        const t = k / n;
        chain.push(
          addPoint(
            [
              pa[0] + (pb[0] - pa[0]) * t,
              pa[1] + (pb[1] - pa[1]) * t,
              pa[2] + (pb[2] - pa[2]) * t,
            ],
            [ua[0] + (ub[0] - ua[0]) * t, ua[1] + (ub[1] - ua[1]) * t],
          ),
        );
      }
      along.set(key, chain);
    }
    return a < b ? chain : [...chain].reverse();
  };

  /** The face's own points in the order of its corners, wound the way its triangles are. */
  const cycleOf = (f: number): number[] => {
    const face = topology.faces[f]!;
    const corner = (v: number): number => {
      for (const t of face.triangles) {
        for (let k = 0; k < 3; k++) {
          const p = mesh.indices[t * 3 + k]!;
          if (topology.vertexOf[p] === v) return p;
        }
      }
      return topology.vertexPoints[v]![0]!;
    };
    let cycle = face.vertices.map(corner);
    const first = face.triangles[0]!;
    const a = at(mesh.indices[first * 3]!);
    const b = at(mesh.indices[first * 3 + 1]!);
    const c = at(mesh.indices[first * 3 + 2]!);
    const wanted: Vec = cross(sub(b, a), sub(c, a));
    const normal: Vec = [0, 0, 0];
    for (let i = 0; i < cycle.length; i++) {
      const p = at(cycle[i]!);
      const q = at(cycle[(i + 1) % cycle.length]!);
      normal[0] += (p[1] - q[1]) * (p[2] + q[2]);
      normal[1] += (p[2] - q[2]) * (p[0] + q[0]);
      normal[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    if (dot(normal, wanted) < 0) cycle = [...cycle].reverse();
    return cycle;
  };

  const touched = new Set<number>();
  for (const f of chosen) {
    const cycle = cycleOf(f);
    for (const p of cycle) touched.add(p);

    if (cycle.length === 4) {
      const [c0, c1, c2, c3] = cycle as [number, number, number, number];
      const grid: number[][] = Array.from({ length: n + 1 }, () =>
        new Array<number>(n + 1).fill(-1),
      );
      grid[0]![0] = c0;
      grid[n]![0] = c1;
      grid[n]![n] = c2;
      grid[0]![n] = c3;
      const bottom = edgeChain(c0, c1);
      const right = edgeChain(c1, c2);
      const top = edgeChain(c3, c2);
      const left = edgeChain(c0, c3);
      for (let k = 1; k < n; k++) {
        grid[k]![0] = bottom[k - 1]!;
        grid[n]![k] = right[k - 1]!;
        grid[k]![n] = top[k - 1]!;
        grid[0]![k] = left[k - 1]!;
      }
      const P = [at(c0), at(c1), at(c2), at(c3)];
      const Q = [uvAt(c0), uvAt(c1), uvAt(c2), uvAt(c3)];
      for (let i = 1; i < n; i++) {
        for (let j = 1; j < n; j++) {
          const u = i / n;
          const v = j / n;
          grid[i]![j] = addPoint(
            [0, 1, 2].map(
              (k) =>
                (1 - u) * (1 - v) * P[0]![k]! +
                u * (1 - v) * P[1]![k]! +
                u * v * P[2]![k]! +
                (1 - u) * v * P[3]![k]!,
            ) as Vec,
            [0, 1].map(
              (k) =>
                (1 - u) * (1 - v) * Q[0]![k]! +
                u * (1 - v) * Q[1]![k]! +
                u * v * Q[2]![k]! +
                (1 - u) * v * Q[3]![k]!,
            ) as [number, number],
          );
        }
      }
      for (const column of grid) for (const p of column) touched.add(p);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const g00 = grid[i]![j]!;
          const g10 = grid[i + 1]![j]!;
          const g11 = grid[i + 1]![j + 1]!;
          const g01 = grid[i]![j + 1]!;
          indices.push(g00, g10, g11, g00, g11, g01);
        }
      }
    } else {
      const [t0, t1, t2] = cycle as [number, number, number];
      const grid = new Map<string, number>();
      const key = (i: number, j: number) => `${i},${j}`;
      grid.set(key(0, 0), t0);
      grid.set(key(n, 0), t1);
      grid.set(key(0, n), t2);
      const e01 = edgeChain(t0, t1);
      const e02 = edgeChain(t0, t2);
      const e12 = edgeChain(t1, t2);
      for (let k = 1; k < n; k++) {
        grid.set(key(k, 0), e01[k - 1]!);
        grid.set(key(0, k), e02[k - 1]!);
        grid.set(key(n - k, k), e12[k - 1]!);
      }
      const P = [at(t0), at(t1), at(t2)];
      const Q = [uvAt(t0), uvAt(t1), uvAt(t2)];
      for (let i = 1; i < n; i++) {
        for (let j = 1; i + j < n; j++) {
          const w0 = (n - i - j) / n;
          const w1 = i / n;
          const w2 = j / n;
          grid.set(
            key(i, j),
            addPoint(
              [0, 1, 2].map(
                (k) => w0 * P[0]![k]! + w1 * P[1]![k]! + w2 * P[2]![k]!,
              ) as Vec,
              [0, 1].map(
                (k) => w0 * Q[0]![k]! + w1 * Q[1]![k]! + w2 * Q[2]![k]!,
              ) as [number, number],
            ),
          );
        }
      }
      for (const p of grid.values()) touched.add(p);
      for (let i = 0; i < n; i++) {
        for (let j = 0; i + j < n; j++) {
          indices.push(
            grid.get(key(i, j))!,
            grid.get(key(i + 1, j))!,
            grid.get(key(i, j + 1))!,
          );
          if (i + j < n - 1) {
            indices.push(
              grid.get(key(i + 1, j))!,
              grid.get(key(i + 1, j + 1))!,
              grid.get(key(i, j + 1))!,
            );
          }
        }
      }
    }
  }

  // The faces next to the divided ones: each becomes a fan round a middle point, through the new points on its divided
  // edges, so the surface stays closed with no point lying on one face only
  for (const g of joined) {
    const cycle = cycleOf(g);
    const poly: number[] = [];
    for (let i = 0; i < cycle.length; i++) {
      const pa = cycle[i]!;
      const pb = cycle[(i + 1) % cycle.length]!;
      poly.push(pa);
      const e = edgeBetween(
        topology,
        topology.vertexOf[pa]!,
        topology.vertexOf[pb]!,
      );
      if (e === -1 || !dividedEdges.has(e)) continue;
      const shared = along.get(`${Math.min(pa, pb)},${Math.max(pa, pb)}`);
      if (shared) {
        // Points the divided face already made (the two faces share their points here)
        poly.push(...(pa < pb ? shared : [...shared].reverse()));
        continue;
      }
      // The two faces have their own points here (a hard edge): make this face's own copies of the new points
      const A = at(pa);
      const B = at(pb);
      const ua = uvAt(pa);
      const ub = uvAt(pb);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        poly.push(
          addPoint(
            [
              A[0] + (B[0] - A[0]) * t,
              A[1] + (B[1] - A[1]) * t,
              A[2] + (B[2] - A[2]) * t,
            ],
            [ua[0] + (ub[0] - ua[0]) * t, ua[1] + (ub[1] - ua[1]) * t],
          ),
        );
      }
    }
    const middle: Vec = [0, 0, 0];
    let mu = 0;
    let mv = 0;
    for (const point of poly) {
      const p = at(point);
      middle[0] += p[0] / poly.length;
      middle[1] += p[1] / poly.length;
      middle[2] += p[2] / poly.length;
      mu += uvAt(point)[0] / poly.length;
      mv += uvAt(point)[1] / poly.length;
    }
    const centre = addPoint(middle, [mu, mv]);
    for (let i = 0; i < poly.length; i++) {
      indices.push(centre, poly[i]!, poly[(i + 1) % poly.length]!);
    }
  }

  // A crease on a divided edge goes on to every piece of it (the edge is found by the spots it joins)
  let creases: Crease[] | undefined = mesh.creases
    ? [...mesh.creases]
    : undefined;
  if (mesh.creases && mesh.creases.length > 0) {
    const pieces = new Map<string, number[]>();
    for (const [key, chain] of along) {
      const [low, high] = key.split(",").map(Number) as [number, number];
      const va = topology.vertexOf[low]!;
      const vb = topology.vertexOf[high]!;
      pieces.set(va < vb ? `${va},${vb}` : `${vb},${va}`, [
        low,
        ...chain,
        high,
      ]);
    }
    const extra: Crease[] = [];
    for (const crease of mesh.creases) {
      const va = topology.vertexOf[crease.a];
      const vb = topology.vertexOf[crease.b];
      if (va === undefined || vb === undefined) continue;
      const chain = pieces.get(va < vb ? `${va},${vb}` : `${vb},${va}`);
      if (!chain) continue;
      for (let k = 0; k + 1 < chain.length; k++) {
        extra.push({ a: chain[k]!, b: chain[k + 1]!, value: crease.value });
      }
    }
    creases = [...creases!, ...extra];
  }

  // A seam on a divided edge goes on to every piece of it, the same way
  let seams: Seam[] | undefined = mesh.seams ? [...mesh.seams] : undefined;
  if (mesh.seams && mesh.seams.length > 0) {
    const pieces = new Map<string, number[]>();
    for (const [key, chain] of along) {
      const [low, high] = key.split(",").map(Number) as [number, number];
      const va = topology.vertexOf[low]!;
      const vb = topology.vertexOf[high]!;
      pieces.set(va < vb ? `${va},${vb}` : `${vb},${va}`, [
        low,
        ...chain,
        high,
      ]);
    }
    const extra: Seam[] = [];
    for (const seam of mesh.seams) {
      const va = topology.vertexOf[seam.a];
      const vb = topology.vertexOf[seam.b];
      if (va === undefined || vb === undefined) continue;
      const chain = pieces.get(va < vb ? `${va},${vb}` : `${vb},${va}`);
      if (!chain) continue;
      for (let k = 0; k + 1 < chain.length; k++) {
        extra.push({ a: chain[k]!, b: chain[k + 1]! });
      }
    }
    seams = [...seams!, ...extra];
  }

  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
      creases,
      ...seamsOf(seams),
      ...(uvs ? { uvs: Float32Array.from(uvs) } : {}),
    },
    selected: [...touched].sort((a, b) => a - b),
  };
}

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
