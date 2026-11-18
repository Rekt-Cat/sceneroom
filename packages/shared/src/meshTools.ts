import { remapCreases } from "./creases";
import {
  expandToWelded,
  selectedFaces,
  weldGroups,
  type EditMesh,
  type EditResult,
} from "./meshEdit";

type Vec = [number, number, number];

/** The most points a Weld run looks at (it compares neighbours through a grid, so this is generous). */
const MAX_WELD_POINTS = 200_000;

const positionOf = (mesh: EditMesh, p: number): Vec => [
  mesh.positions[p * 3]!,
  mesh.positions[p * 3 + 1]!,
  mesh.positions[p * 3 + 2]!,
];

/**
 * Joins points together: every point in `into` (point -> the point it becomes) is replaced by its target, the
 * targets move to `where`, triangles that are left with a repeated corner are dropped, and the points nothing
 * uses any more are removed. Returns the new mesh and the targets as the selection.
 */
function applyMerge(
  mesh: EditMesh,
  into: ReadonlyMap<number, number>,
  where: ReadonlyMap<number, Vec>,
): EditResult {
  const target = (p: number) => into.get(p) ?? p;
  const positions = Array.from(mesh.positions);
  for (const [t, at] of where) {
    positions[t * 3] = at[0];
    positions[t * 3 + 1] = at[1];
    positions[t * 3 + 2] = at[2];
  }
  const kept: number[] = [];
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    const a = target(mesh.indices[t]!);
    const b = target(mesh.indices[t + 1]!);
    const c = target(mesh.indices[t + 2]!);
    if (a !== b && b !== c && a !== c) kept.push(a, b, c);
  }
  if (kept.length === 0) {
    return {
      ok: false,
      reason: "That would leave nothing of the mesh. Select fewer points.",
    };
  }
  const renumber = new Int32Array(mesh.positions.length / 3).fill(-1);
  const out: number[] = [];
  let next = 0;
  const use = (p: number) => {
    if (renumber[p] === -1) {
      renumber[p] = next++;
      out.push(positions[p * 3]!, positions[p * 3 + 1]!, positions[p * 3 + 2]!);
    }
    return renumber[p]!;
  };
  const indices = kept.map(use);
  // Points that were merged follow their target, so creases on them are not lost
  const table = new Int32Array(renumber.length);
  for (let p = 0; p < table.length; p++) table[p] = renumber[target(p)]!;
  const selected = [
    ...new Set([...where.keys()].map((t) => renumber[t]!)),
  ].filter((p) => p >= 0);
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(out),
      indices: Uint32Array.from(indices),
      creases: remapCreases(mesh.creases, table),
    },
    selected,
  };
}

/** Every point on the same spot as a selected one (they move and merge together). */
function withWelded(mesh: EditMesh, selected: readonly number[]): number[] {
  return expandToWelded(weldGroups(mesh.positions), selected);
}

/**
 * Merge at centre: all the selected points become ONE point in the middle of them. The faces between them shrink
 * to nothing and are removed. Use it to close a gap, collapse an edge or tidy a corner.
 */
export function mergeAtCenter(
  mesh: EditMesh,
  selected: readonly number[],
): EditResult {
  const groups = weldGroups(mesh.positions);
  const points = expandToWelded(groups, selected);
  const spots = new Set(points.map((p) => groups.ids[p]!));
  if (spots.size < 2) {
    return {
      ok: false,
      reason: "Select at least two separate points to merge (Ctrl-drag a box).",
    };
  }
  // The middle of the spots (each spot counts once, however many points sit on it)
  const sum: Vec = [0, 0, 0];
  for (const spot of spots) {
    const p = positionOf(mesh, groups.members[spot]![0]!);
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
  }
  const centre: Vec = [
    sum[0] / spots.size,
    sum[1] / spots.size,
    sum[2] / spots.size,
  ];
  const target = Math.min(...points);
  const into = new Map<number, number>(points.map((p) => [p, target]));
  return applyMerge(mesh, into, new Map([[target, centre]]));
}

/**
 * Weld close points: selected points that are within `distance` of each other become one point (in the middle of
 * the group). Mends a seam that was cut open and removes doubled points. Note that the surface then shares the
 * points, so its shading is smoothed across the join.
 */
export function weldClosePoints(
  mesh: EditMesh,
  selected: readonly number[],
  distance: number,
): EditResult {
  const points = withWelded(mesh, selected);
  if (points.length < 2) {
    return {
      ok: false,
      reason: "Select the points to weld (Ctrl-drag a box).",
    };
  }
  if (!(distance > 0) || points.length > MAX_WELD_POINTS) {
    return { ok: false, reason: "Too many points to weld at once." };
  }
  // Groups of points that are close, found with a grid of cells as wide as the distance
  const cell = distance;
  const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const grid = new Map<string, number[]>();
  const cellOf = (p: Vec): Vec => [
    Math.floor(p[0] / cell),
    Math.floor(p[1] / cell),
    Math.floor(p[2] / cell),
  ];
  for (const p of points) {
    const c = cellOf(positionOf(mesh, p));
    const k = key(...c);
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  const parent = new Map<number, number>(points.map((p) => [p, p]));
  const find = (p: number): number => {
    let root = p;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(p, root);
    return root;
  };
  for (const p of points) {
    const at = positionOf(mesh, p);
    const c = cellOf(at);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const q of grid.get(key(c[0] + dx, c[1] + dy, c[2] + dz)) ??
            []) {
            if (q <= p) continue;
            const o = positionOf(mesh, q);
            if (
              Math.hypot(at[0] - o[0], at[1] - o[1], at[2] - o[2]) <= distance
            ) {
              parent.set(find(q), find(p));
            }
          }
        }
      }
    }
  }
  const clusters = new Map<number, number[]>();
  for (const p of points) {
    const root = find(p);
    const list = clusters.get(root);
    if (list) list.push(p);
    else clusters.set(root, [p]);
  }
  const into = new Map<number, number>();
  const where = new Map<number, Vec>();
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    const target = Math.min(...members);
    const sum: Vec = [0, 0, 0];
    for (const m of members) {
      const p = positionOf(mesh, m);
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
    }
    where.set(target, [
      sum[0] / members.length,
      sum[1] / members.length,
      sum[2] / members.length,
    ]);
    for (const m of members) into.set(m, target);
  }
  if (where.size === 0) {
    return { ok: false, reason: "No selected points are that close together." };
  }
  return applyMerge(mesh, into, where);
}

/**
 * Flip normals: turns faces inside out (the side that is drawn becomes the other one). With faces selected only
 * those are flipped; with nothing selected the whole mesh is.
 */
export function flipNormals(
  mesh: EditMesh,
  selected: readonly number[],
): EditResult {
  let triangles: number[];
  if (selected.length === 0) {
    triangles = Array.from({ length: mesh.indices.length / 3 }, (_, t) => t);
  } else {
    triangles = selectedFaces(mesh, withWelded(mesh, selected));
    if (triangles.length === 0) {
      return {
        ok: false,
        reason:
          "Select all the points of a face (or nothing, to flip the whole mesh).",
      };
    }
  }
  const indices = Uint32Array.from(mesh.indices);
  for (const t of triangles) {
    const b = indices[t * 3 + 1]!;
    indices[t * 3 + 1] = indices[t * 3 + 2]!;
    indices[t * 3 + 2] = b;
  }
  return {
    ok: true,
    mesh: { positions: mesh.positions, indices, creases: mesh.creases },
    selected: [...selected],
  };
}

// ---- Holes and bridges ----

/** One edge on the border of the surface, in the direction the triangle that owns it runs. */
type BorderEdge = {
  from: number;
  to: number;
  pointFrom: number;
  pointTo: number;
};
/** A closed ring of border edges, in the owners' direction. */
type BorderLoop = BorderEdge[];

/** The rings of edges that have a face on one side only, or a reason they cannot be used. */
function borderLoops(
  mesh: EditMesh,
  ids: Uint32Array,
): { loops: BorderLoop[] } | { problem: string } {
  const directed = new Set<string>();
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t + k]!;
      const b = mesh.indices[t + ((k + 1) % 3)]!;
      directed.add(`${ids[a]!}>${ids[b]!}`);
    }
  }
  const outgoing = new Map<number, BorderEdge[]>();
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = mesh.indices[t + k]!;
      const b = mesh.indices[t + ((k + 1) % 3)]!;
      if (ids[a] === ids[b] || directed.has(`${ids[b]!}>${ids[a]!}`)) continue;
      const edge: BorderEdge = {
        from: ids[a]!,
        to: ids[b]!,
        pointFrom: a,
        pointTo: b,
      };
      const list = outgoing.get(edge.from);
      if (list) list.push(edge);
      else outgoing.set(edge.from, [edge]);
    }
  }
  const loops: BorderLoop[] = [];
  const used = new Set<BorderEdge>();
  for (const edges of outgoing.values()) {
    for (const start of edges) {
      if (used.has(start)) continue;
      // The shortest way round from the end of this edge back to its start. Where two holes touch at one
      // point there are two ways on; the shortest one is the ring that this edge belongs to.
      const reached = new Map<number, BorderEdge>();
      const queue: number[] = [start.to];
      const seen = new Set<number>([start.to]);
      while (queue.length > 0 && !reached.has(start.from)) {
        const at = queue.shift()!;
        for (const edge of outgoing.get(at) ?? []) {
          if (used.has(edge) || edge === start || seen.has(edge.to)) continue;
          seen.add(edge.to);
          reached.set(edge.to, edge);
          queue.push(edge.to);
        }
      }
      const loop: BorderLoop = [start];
      if (start.to !== start.from) {
        if (!reached.has(start.from)) {
          return { problem: "The border of this hole is not a closed ring." };
        }
        const back: BorderEdge[] = [];
        let at = start.from;
        while (at !== start.to) {
          const edge = reached.get(at)!;
          back.push(edge);
          at = edge.from;
        }
        loop.push(...back.reverse());
      }
      for (const edge of loop) used.add(edge);
      loops.push(loop);
    }
  }
  return { loops };
}

/** The rings that have a selected edge (both ends selected). */
function chosenLoops(
  loops: BorderLoop[],
  ids: Uint32Array,
  selected: readonly number[],
): BorderLoop[] {
  const spots = new Set(selected.map((p) => ids[p]!));
  return loops.filter((loop) =>
    loop.some((edge) => spots.has(edge.from) && spots.has(edge.to)),
  );
}

/**
 * Fill hole: closes the hole whose border has a selected edge with faces (a fan from the middle). With nothing
 * selected, a mesh that has exactly one hole gets that one closed.
 */
export function fillHole(
  mesh: EditMesh,
  selected: readonly number[],
): EditResult {
  const groups = weldGroups(mesh.positions);
  const found = borderLoops(mesh, groups.ids);
  if ("problem" in found) return { ok: false, reason: found.problem };
  if (found.loops.length === 0) {
    return { ok: false, reason: "This mesh has no holes to fill." };
  }
  const chosen =
    selected.length === 0 && found.loops.length === 1
      ? found.loops
      : chosenLoops(found.loops, groups.ids, withWelded(mesh, selected));
  if (chosen.length === 0) {
    return {
      ok: false,
      reason:
        "Select an edge on the border of the hole (press 2 for edge mode, click an edge of the hole).",
    };
  }
  const positions = Array.from(mesh.positions);
  const indices = Array.from(mesh.indices);
  const centres: number[] = [];
  for (const loop of chosen) {
    // Each border edge is used backwards by the new faces, so the surface closes with the same side out
    if (loop.length === 3) {
      indices.push(loop[1]!.pointTo, loop[0]!.pointTo, loop[2]!.pointTo);
      continue;
    }
    const sum: Vec = [0, 0, 0];
    for (const edge of loop) {
      const p = positionOf(mesh, edge.pointFrom);
      sum[0] += p[0];
      sum[1] += p[1];
      sum[2] += p[2];
    }
    const centre = positions.length / 3;
    positions.push(
      sum[0] / loop.length,
      sum[1] / loop.length,
      sum[2] / loop.length,
    );
    centres.push(centre);
    for (const edge of loop) indices.push(edge.pointTo, edge.pointFrom, centre);
  }
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
      creases: mesh.creases,
    },
    selected: centres,
  };
}

/**
 * Bridge: joins two open rims with a strip of squares. Select an edge on each of the two rims (two open tube
 * ends, two holes); both rims need the same number of edges. The strip is lined up so its squares are as short
 * as possible.
 */
export function bridgeLoops(
  mesh: EditMesh,
  selected: readonly number[],
): EditResult {
  const groups = weldGroups(mesh.positions);
  const found = borderLoops(mesh, groups.ids);
  if ("problem" in found) return { ok: false, reason: found.problem };
  const chosen = chosenLoops(
    found.loops,
    groups.ids,
    withWelded(mesh, selected),
  );
  if (chosen.length !== 2) {
    return {
      ok: false,
      reason:
        "Select an edge on each of two open rims (shift-click the second), then press Bridge.",
    };
  }
  const [first, second] = chosen as [BorderLoop, BorderLoop];
  if (first.length !== second.length) {
    return {
      ok: false,
      reason: `The two rims have ${first.length} and ${second.length} edges. A bridge needs the same number on both.`,
    };
  }
  const n = first.length;
  // Rim A goes the way its faces run; rim B goes the opposite way, so the strip faces the same way as both
  const a = first.map((edge) => edge.pointFrom);
  const b = second.map((edge) => edge.pointFrom).reverse();
  // Start of B that makes the strip shortest
  let best = 0;
  let bestLength = Infinity;
  for (let s = 0; s < n; s++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const p = positionOf(mesh, a[i]!);
      const q = positionOf(mesh, b[(i + s) % n]!);
      total += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    }
    if (total < bestLength) {
      bestLength = total;
      best = s;
    }
  }
  const indices = Array.from(mesh.indices);
  for (let i = 0; i < n; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % n]!;
    const b0 = b[(i + best) % n]!;
    const b1 = b[(i + 1 + best) % n]!;
    indices.push(a1, a0, b0, a1, b0, b1);
  }
  return {
    ok: true,
    mesh: {
      positions: mesh.positions,
      indices: Uint32Array.from(indices),
      creases: mesh.creases,
    },
    selected: [],
  };
}

/**
 * Delete faces: removes the faces whose points are all selected (and the points nothing uses any more). The faces
 * around them stay whole, so the hole has a clean edge. (Deleting POINTS removes every face that touches them.)
 */
export function deleteFaces(
  mesh: EditMesh,
  selected: readonly number[],
): EditResult {
  if (selected.length === 0)
    return { ok: false, reason: "Select a face first." };
  const doomed = new Set(selectedFaces(mesh, withWelded(mesh, selected)));
  if (doomed.size === 0) {
    return {
      ok: false,
      reason: "Select all the points of a face (click it in face mode).",
    };
  }
  const kept: number[] = [];
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    if (!doomed.has(t)) {
      kept.push(
        mesh.indices[t * 3]!,
        mesh.indices[t * 3 + 1]!,
        mesh.indices[t * 3 + 2]!,
      );
    }
  }
  if (kept.length === 0) {
    return {
      ok: false,
      reason: "That would delete the whole mesh. Select fewer faces.",
    };
  }
  const renumber = new Int32Array(mesh.positions.length / 3).fill(-1);
  const positions: number[] = [];
  let next = 0;
  const indices = kept.map((p) => {
    if (renumber[p] === -1) {
      renumber[p] = next++;
      positions.push(
        mesh.positions[p * 3]!,
        mesh.positions[p * 3 + 1]!,
        mesh.positions[p * 3 + 2]!,
      );
    }
    return renumber[p]!;
  });
  return {
    ok: true,
    mesh: {
      positions: Float32Array.from(positions),
      indices: Uint32Array.from(indices),
      creases: remapCreases(mesh.creases, renumber),
    },
    selected: [],
  };
}
