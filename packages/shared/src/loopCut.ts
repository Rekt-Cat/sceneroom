import type { EditMesh } from "./meshEdit";
import { edgeRing, edgeVertices, type Topology } from "./topology";

/**
 * Loop cut: add new rings of edges across a strip of squares. You point at an edge; the ring of parallel edges
 * through it (see `edgeRing`) is split, and a new loop runs through the cut, perpendicular to those edges,
 * all the way round or along the strip. Several cuts make several loops, evenly spaced; `slide` moves them
 * towards one end.
 */
export const MAX_LOOP_CUTS = 10;
/** The largest slide: a loop cannot reach the edge itself (it would sit on top of it). */
const SLIDE_LIMIT = 0.9;

export type LoopCutOptions = {
  /** How many new loops (1 to 10). */
  cuts: number;
  /** -1 to 1: moves the loops towards one end of the edges they cross (0 = evenly between). */
  slide: number;
};

export const DEFAULT_LOOP_CUT_OPTIONS: LoopCutOptions = { cuts: 1, slide: 0 };

/** The options made safe: a whole number of cuts in range, the slide between -1 and 1, bad numbers replaced by the defaults. */
export function sanitizeLoopCutOptions(
  options: Partial<LoopCutOptions>,
): LoopCutOptions {
  const number = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return {
    cuts: Math.min(
      MAX_LOOP_CUTS,
      Math.max(
        1,
        Math.round(number(options.cuts, DEFAULT_LOOP_CUT_OPTIONS.cuts)),
      ),
    ),
    slide: Math.min(
      1,
      Math.max(-1, number(options.slide, DEFAULT_LOOP_CUT_OPTIONS.slide)),
    ),
  };
}

/** Where along each crossed edge (0 = its first end, 1 = its last) the loops go. */
export function cutPositions(options: LoopCutOptions): number[] {
  const { cuts, slide } = sanitizeLoopCutOptions(options);
  const shift = (slide * SLIDE_LIMIT) / (cuts + 1);
  return Array.from({ length: cuts }, (_, k) => (k + 1) / (cuts + 1) + shift);
}

/** One square of the strip, with its two crossed edges ("rungs") lined up: a1 to b1 on one side, a2 to b2 on the other. */
type Cell = {
  face: number;
  /** The four corners of the square as POINTS, in the order a1, b1, b2, a2 (so a1-a2 and b1-b2 are the sides). */
  a1: number;
  b1: number;
  b2: number;
  a2: number;
};

type Plan = { ok: true; cells: Cell[] } | { ok: false; reason: string };

/** The point of the mesh that stands for `vertex` in `face` (the face's triangles say which point it uses). */
function pointIn(
  mesh: EditMesh,
  topology: Topology,
  face: number,
  vertex: number,
): number {
  for (const t of topology.faces[face]!.triangles) {
    for (let k = 0; k < 3; k++) {
      const p = mesh.indices[t * 3 + k]!;
      if (topology.vertexOf[p] === vertex) return p;
    }
  }
  return topology.vertexPoints[vertex]![0]!;
}

/** Works out the squares a cut through this edge crosses, or why it cannot be done. */
function plan(mesh: EditMesh, topology: Topology, edge: number): Plan {
  const ring = edgeRing(topology, edge);
  const rungs = ring.edges;
  if (rungs.length < 2) {
    return {
      ok: false,
      reason:
        "There is no strip of squares across this edge to cut (it is next to a triangle, or the shape's border). Try an edge in the middle of a side made of squares.",
    };
  }
  const cells: Cell[] = [];
  const count = ring.closed ? rungs.length : rungs.length - 1;

  // The first rung's direction is chosen freely; each square then fixes the direction of the next rung
  let [a, b] = edgeVertices(topology, rungs[0]!);
  const firstA = a;
  for (let i = 0; i < count; i++) {
    const here = rungs[i]!;
    const there = rungs[(i + 1) % rungs.length]!;
    const face = topology.edgeFaces[here]!.find((f) =>
      topology.edgeFaces[there]!.includes(f),
    );
    if (face === undefined) {
      return {
        ok: false,
        reason: "The strip is not made of connected squares.",
      };
    }
    const cycle = topology.faces[face]!.vertices;
    if (cycle.length !== 4) {
      return {
        ok: false,
        reason: "The strip runs into a triangle, so a cut would leave a gap.",
      };
    }
    const ia = cycle.indexOf(a);
    const ib = cycle.indexOf(b);
    if (ia === -1 || ib === -1) {
      return {
        ok: false,
        reason: "The strip is not made of connected squares.",
      };
    }
    // Walk the square the way a goes to b: a, b, then the far end of the next rung, then the other
    const step = (ia + 1) % 4 === ib ? 1 : (ia + 3) % 4 === ib ? -1 : 0;
    if (step === 0) {
      return {
        ok: false,
        reason: "The strip is not made of connected squares.",
      };
    }
    const b2 = cycle[(ib + step + 4) % 4]!;
    const a2 = cycle[(ib + 2 * step + 4) % 4]!;
    cells.push({
      face,
      a1: pointIn(mesh, topology, face, a),
      b1: pointIn(mesh, topology, face, b),
      b2: pointIn(mesh, topology, face, b2),
      a2: pointIn(mesh, topology, face, a2),
    });
    a = a2;
    b = b2;
  }
  if (ring.closed && a !== firstA) {
    return {
      ok: false,
      reason:
        "This strip is twisted (like a Mobius band), so it cannot be cut cleanly.",
    };
  }

  // An open strip must end at the border of the shape, not at a triangle (the triangle would be left with a gap)
  if (!ring.closed) {
    for (const rung of [rungs[0]!, rungs[rungs.length - 1]!]) {
      const faces = topology.edgeFaces[rung]!;
      const next = faces.filter((f) => !cells.some((c) => c.face === f));
      if (next.some((f) => topology.faces[f]!.vertices.length !== 4)) {
        return {
          ok: false,
          reason:
            "The strip ends at a triangle, so a cut would leave a gap there. Cut a strip that runs from border to border or all the way round.",
        };
      }
    }
  }
  return { ok: true, cells };
}

const lerp = (
  mesh: EditMesh,
  from: number,
  to: number,
  t: number,
): [number, number, number] => [
  mesh.positions[from * 3]! +
    (mesh.positions[to * 3]! - mesh.positions[from * 3]!) * t,
  mesh.positions[from * 3 + 1]! +
    (mesh.positions[to * 3 + 1]! - mesh.positions[from * 3 + 1]!) * t,
  mesh.positions[from * 3 + 2]! +
    (mesh.positions[to * 3 + 2]! - mesh.positions[from * 3 + 2]!) * t,
];

export type LoopCutResult =
  | {
      ok: true;
      mesh: EditMesh;
      /** The new points (every point on the new loops), ready to be moved or scaled. */
      selected: number[];
    }
  | { ok: false; reason: string };

/**
 * Cuts the strip of squares across `edge`: every square in the strip is split into `cuts + 1` squares, with new
 * points on the edges that were crossed. Points are shared between neighbouring squares where the mesh already
 * shared them (a smooth surface stays smooth) and made separately where it did not (a cube's sharp edge stays
 * sharp). Returns the new mesh and the new points as the selection.
 */
export function loopCut(
  mesh: EditMesh,
  topology: Topology,
  edge: number,
  options: Partial<LoopCutOptions> = {},
): LoopCutResult {
  const planned = plan(mesh, topology, edge);
  if (!planned.ok) return planned;
  const ts = cutPositions(sanitizeLoopCutOptions(options));

  const positions: number[] = Array.from(mesh.positions);
  const made = new Map<string, number>();
  /** The new point a fraction `t` of the way from point `a` to point `b` (the same one for every square that asks). */
  const between = (a: number, b: number, k: number): number => {
    const key = `${a}-${b}-${k}`;
    let id = made.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      made.set(key, id);
      positions.push(...lerp(mesh, a, b, ts[k]!));
    }
    return id;
  };

  const inStrip = new Set(planned.cells.map((c) => c.face));
  const indices: number[] = [];
  for (let t = 0; t * 3 < mesh.indices.length; t++) {
    const face = topology.triangleFace[t]!;
    if (face !== -1 && inStrip.has(face)) continue;
    indices.push(
      mesh.indices[t * 3]!,
      mesh.indices[t * 3 + 1]!,
      mesh.indices[t * 3 + 2]!,
    );
  }

  for (const cell of planned.cells) {
    // Points across each of the two crossed edges: the old end, the new ones, the old end
    const side1 = [
      cell.a1,
      ...ts.map((_, k) => between(cell.a1, cell.b1, k)),
      cell.b1,
    ];
    const side2 = [
      cell.a2,
      ...ts.map((_, k) => between(cell.a2, cell.b2, k)),
      cell.b2,
    ];
    // Keep the winding of the square being replaced: compare with its first triangle
    const winding = windingFlip(mesh, topology, cell);
    for (let k = 0; k <= ts.length; k++) {
      const p = side1[k]!;
      const q = side1[k + 1]!;
      const r = side2[k + 1]!;
      const s = side2[k]!;
      if (winding) indices.push(p, r, q, p, s, r);
      else indices.push(p, q, r, p, r, s);
    }
  }

  const selected: number[] = [];
  for (const id of made.values()) selected.push(id);
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
    },
    selected,
  };
}

/** True if the square's own triangles run the other way round to (a1, b1, b2, a2), so new triangles must be turned over to match. */
function windingFlip(mesh: EditMesh, topology: Topology, cell: Cell): boolean {
  const t = topology.faces[cell.face]!.triangles[0]!;
  const p = (i: number) => [
    mesh.positions[i * 3]!,
    mesh.positions[i * 3 + 1]!,
    mesh.positions[i * 3 + 2]!,
  ];
  const normal = (a: number[], b: number[], c: number[]) => {
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    return [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
  };
  const own = normal(
    p(mesh.indices[t * 3]!),
    p(mesh.indices[t * 3 + 1]!),
    p(mesh.indices[t * 3 + 2]!),
  );
  const ours = normal(p(cell.a1), p(cell.b1), p(cell.b2));
  return own[0]! * ours[0]! + own[1]! * ours[1]! + own[2]! * ours[2]! < 0;
}

/**
 * The lines a cut would draw, for showing it before it is made: for every square in the strip and every new
 * loop, a line from the new point on one crossed edge to the one on the other, as pairs of spots (x, y, z,
 * x, y, z, ...) in the mesh's own space. Null if the cut cannot be made (the reason is in `loopCut`).
 */
export function loopCutPreview(
  mesh: EditMesh,
  topology: Topology,
  edge: number,
  options: Partial<LoopCutOptions> = {},
): Float32Array | null {
  const planned = plan(mesh, topology, edge);
  if (!planned.ok) return null;
  const ts = cutPositions(sanitizeLoopCutOptions(options));
  const lines: number[] = [];
  for (const cell of planned.cells) {
    for (const t of ts) {
      lines.push(
        ...lerp(mesh, cell.a1, cell.b1, t),
        ...lerp(mesh, cell.a2, cell.b2, t),
      );
    }
  }
  return Float32Array.from(lines);
}
