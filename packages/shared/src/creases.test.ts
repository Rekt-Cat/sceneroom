import { describe, expect, it } from "vitest";
import {
  FULL_SHARPNESS_LEVELS,
  MAX_DEFORMED_POINTS,
  buildTopology,
  checkCreases,
  createModifier,
  deformMesh,
  edgeBetween,
  edgeCreaseValues,
  edgeSharpness,
  remapCreases,
  sameCreases,
  setCreases,
  subdivideMesh,
  type Crease,
  type ShapeMesh,
  type Topology,
} from "./index";
import { box } from "./testMeshes";

const at = (m: ShapeMesh, p: number) => [
  m.positions[p * 3]!,
  m.positions[p * 3 + 1]!,
  m.positions[p * 3 + 2]!,
];
const count = (m: ShapeMesh) => m.positions.length / 3;

/** Creases on every edge of the mesh, with a value. */
function creaseAll(mesh: ShapeMesh, value: number): ShapeMesh {
  const t = buildTopology(mesh);
  const creases: Crease[] = [];
  for (let e = 0; e < t.edgeFaces.length; e++) {
    creases.push({
      a: t.vertexPoints[t.edges[e * 2]!]![0]!,
      b: t.vertexPoints[t.edges[e * 2 + 1]!]![0]!,
      value,
    });
  }
  return { ...mesh, creases };
}

/** The edge of the cube from one corner to another, by spots. */
function edgeAtSpots(t: Topology, a: number[], b: number[]) {
  const find = (s: number[]) =>
    Array.from({ length: t.vertexPoints.length }, (_, v) => v).find(
      (v) =>
        Math.abs(t.vertexPositions[v * 3]! - s[0]!) < 1e-6 &&
        Math.abs(t.vertexPositions[v * 3 + 1]! - s[1]!) < 1e-6 &&
        Math.abs(t.vertexPositions[v * 3 + 2]! - s[2]!) < 1e-6,
    )!;
  return edgeBetween(t, find(a), find(b));
}

describe("smoothing with creases", () => {
  it("a cube with every edge fully sharp stays a cube, however many levels (all points stay on its surface)", () => {
    const sharp = creaseAll(box(1), 1);
    for (const levels of [1, 2, 3]) {
      const out = subdivideMesh(sharp, levels, MAX_DEFORMED_POINTS);
      expect(count(out)).toBeGreaterThan(count(box(1)));
      for (let p = 0; p < count(out); p++) {
        const coords = at(out, p).map(Math.abs);
        expect(Math.max(...coords)).toBeCloseTo(0.5, 5); // on a face of the cube
      }
      // and the corners are still exactly at the corners
      const corners = Array.from({ length: count(out) }, (_, p) =>
        at(out, p),
      ).filter((q) => q.every((c) => Math.abs(Math.abs(c) - 0.5) < 1e-6));
      expect(corners).toHaveLength(8);
    }
  });

  it("without creases the same cube is rounded (so the creases are what keeps it crisp)", () => {
    const soft = subdivideMesh(box(1), 2, MAX_DEFORMED_POINTS);
    const reach = (m: ShapeMesh) =>
      Math.max(
        ...Array.from({ length: count(m) }, (_, p) => Math.hypot(...at(m, p))),
      );
    const sharp = subdivideMesh(creaseAll(box(1), 1), 2, MAX_DEFORMED_POINTS);
    expect(reach(sharp)).toBeCloseTo(Math.hypot(0.5, 0.5, 0.5), 5);
    expect(reach(soft)).toBeLessThan(reach(sharp) - 0.2);
  });

  it("a half-strong crease is in between: sharp for the first level, then softer", () => {
    const radius = (m: ShapeMesh) =>
      Math.max(
        ...Array.from({ length: count(m) }, (_, p) => Math.hypot(...at(m, p))),
      );
    const none = radius(subdivideMesh(box(1), 3, MAX_DEFORMED_POINTS));
    const half = radius(
      subdivideMesh(creaseAll(box(1), 0.5), 3, MAX_DEFORMED_POINTS),
    );
    const full = radius(
      subdivideMesh(creaseAll(box(1), 1), 3, MAX_DEFORMED_POINTS),
    );
    expect(half).toBeGreaterThan(none);
    expect(half).toBeLessThan(full);
  });

  it("a crease on one edge keeps that edge straight while the rest rounds", () => {
    const mesh = box(1);
    const t = buildTopology(mesh);
    const edge = edgeAtSpots(t, [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]);
    const [a, b] = [
      t.vertexPoints[t.edges[edge * 2]!]![0]!,
      t.vertexPoints[t.edges[edge * 2 + 1]!]![0]!,
    ];
    const creased: ShapeMesh = { ...mesh, creases: [{ a, b, value: 1 }] };
    const out = subdivideMesh(creased, 1, MAX_DEFORMED_POINTS);
    // the middle of that edge stays exactly in the middle of the edge: (0.5, 0.5, 0)
    const middle = Array.from({ length: count(out) }, (_, p) =>
      at(out, p),
    ).find(
      (q) =>
        Math.abs(q[0]! - 0.5) < 1e-6 &&
        Math.abs(q[1]! - 0.5) < 1e-6 &&
        Math.abs(q[2]!) < 1e-6,
    );
    expect(middle).toBeDefined();
    // an edge with no crease has its middle pulled in
    const other = Array.from({ length: count(out) }, (_, p) => at(out, p)).find(
      (q) =>
        Math.abs(q[0]! + 0.5) < 1e-6 &&
        Math.abs(q[1]! + 0.5) < 1e-6 &&
        Math.abs(q[2]!) < 1e-6,
    );
    expect(other).toBeUndefined();
  });

  it("two creased edges meeting at a corner make a crease line: the corner slides along it (cubic rule)", () => {
    const mesh = box(1);
    const t = buildTopology(mesh);
    const e1 = edgeAtSpots(t, [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]);
    const e2 = edgeAtSpots(t, [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]);
    const pair = (e: number): Crease => ({
      a: t.vertexPoints[t.edges[e * 2]!]![0]!,
      b: t.vertexPoints[t.edges[e * 2 + 1]!]![0]!,
      value: 1,
    });
    const out = subdivideMesh(
      { ...mesh, creases: [pair(e1), pair(e2)] },
      1,
      MAX_DEFORMED_POINTS,
    );
    // old corner (0.5, 0.5, 0.5) -> (a + 6P + b) / 8 with a = (-.5,.5,.5), b = (.5,.5,-.5): (0.375, 0.5, 0.375)
    const corner = Array.from({ length: count(out) }, (_, p) =>
      at(out, p),
    ).find(
      (q) =>
        Math.abs(q[0]! - 0.375) < 1e-6 &&
        Math.abs(q[1]! - 0.5) < 1e-6 &&
        Math.abs(q[2]! - 0.375) < 1e-6,
    );
    expect(corner).toBeDefined();
  });

  it("every triangle of a creased result still faces outwards, and the shape is closed", () => {
    const out = subdivideMesh(creaseAll(box(1), 0.7), 2, MAX_DEFORMED_POINTS);
    const topology = buildTopology(out);
    expect(topology.edgeFaces.every((faces) => faces.length === 2)).toBe(true);
    for (let t = 0; t < out.indices.length / 3; t++) {
      const [a, b, c] = [
        out.indices[t * 3]!,
        out.indices[t * 3 + 1]!,
        out.indices[t * 3 + 2]!,
      ];
      const [pa, pb, pc] = [at(out, a), at(out, b), at(out, c)];
      const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
      const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const m = [
        (pa[0]! + pb[0]! + pc[0]!) / 3,
        (pa[1]! + pb[1]! + pc[1]!) / 3,
        (pa[2]! + pb[2]! + pc[2]!) / 3,
      ];
      expect(n[0]! * m[0]! + n[1]! * m[1]! + n[2]! * m[2]!).toBeGreaterThan(0);
    }
  });

  it("creases on points that are not on an edge are ignored", () => {
    const mesh: ShapeMesh = { ...box(1), creases: [{ a: 0, b: 11, value: 1 }] };
    const t = buildTopology(mesh);
    expect(edgeSharpness(t, mesh.creases).every((s) => s === 0)).toBe(true);
    expect(count(subdivideMesh(mesh, 1, MAX_DEFORMED_POINTS))).toBe(26);
  });
});

describe("working out and changing creases", () => {
  const mesh = box(1);
  const t = buildTopology(mesh);

  it("edgeSharpness and edgeCreaseValues read creases by edge, whichever point of an end they name", () => {
    const e = edgeAtSpots(t, [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]);
    // name other points of the same spots: points of vertices have several members on a box
    const [va, vb] = [t.edges[e * 2]!, t.edges[e * 2 + 1]!];
    const a = t.vertexPoints[va]!.at(-1)!;
    const b = t.vertexPoints[vb]!.at(-1)!;
    const sharp = edgeSharpness(t, [{ a, b, value: 0.5 }]);
    expect(sharp[e]).toBeCloseTo(0.5 * FULL_SHARPNESS_LEVELS, 9);
    expect(edgeCreaseValues(t, [{ a, b, value: 0.5 }])[e]).toBeCloseTo(0.5, 9);
    expect(sharp.filter((s) => s > 0)).toHaveLength(1);
  });

  it("setCreases adds, replaces and clears, keeping the others", () => {
    const e1 = edgeAtSpots(t, [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]);
    const e2 = edgeAtSpots(t, [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]);
    const one = setCreases(mesh, t, [e1], 1);
    expect(one).toHaveLength(1);
    const two = setCreases({ ...mesh, creases: one }, t, [e2], 0.5);
    expect(two).toHaveLength(2);
    // setting e1 again replaces it (one crease on it, not two)
    const replaced = setCreases({ ...mesh, creases: two }, t, [e1], 0.25);
    expect(replaced).toHaveLength(2);
    expect(edgeCreaseValues(t, replaced)[e1]).toBeCloseTo(0.25, 9);
    expect(edgeCreaseValues(t, replaced)[e2]).toBeCloseTo(0.5, 9);
    // clearing removes
    const cleared = setCreases({ ...mesh, creases: replaced }, t, [e1], 0);
    expect(cleared).toHaveLength(1);
    expect(setCreases({ ...mesh, creases: cleared }, t, [e2], 0)).toEqual([]);
  });

  it("remapCreases follows renumbered points and drops creases on points that are gone", () => {
    const creases: Crease[] = [
      { a: 0, b: 1, value: 1 },
      { a: 2, b: 3, value: 0.5 },
    ];
    const map = [5, 6, -1, 7];
    expect(remapCreases(creases, map)).toEqual([{ a: 5, b: 6, value: 1 }]);
    expect(remapCreases(undefined, map)).toBeUndefined();
    expect(remapCreases([{ a: 2, b: 3, value: 1 }], map)).toBeUndefined();
  });

  it("checkCreases and sameCreases", () => {
    expect(checkCreases([{ a: 0, b: 1, value: 1 }], 4)).toBeNull();
    expect(checkCreases([{ a: 0, b: 4, value: 1 }], 4)).toContain(
      "does not exist",
    );
    expect(checkCreases([{ a: 0, b: 0, value: 1 }], 4)).toContain("itself");
    expect(checkCreases([{ a: 0, b: 1, value: NaN }], 4)).toContain(
      "between 0 and 1",
    );
    expect(
      sameCreases([{ a: 0, b: 1, value: 1 }], [{ a: 1, b: 0, value: 1 }]),
    ).toBe(true);
    expect(
      sameCreases([{ a: 0, b: 1, value: 1 }], [{ a: 0, b: 1, value: 0.5 }]),
    ).toBe(false);
    expect(sameCreases(undefined, [])).toBe(true);
  });
});

describe("creases and the other modifiers", () => {
  it("move-the-points modifiers keep the creases; mirror and array copy them with their own points", () => {
    const mesh = creaseAll(box(1), 1);
    const n = mesh.creases!.length;
    const noisy = deformMesh(mesh, [createModifier("n", "noise")]);
    expect(noisy.creases).toHaveLength(n);
    const mirrored = deformMesh(mesh, [createModifier("m", "mirror")]);
    expect(mirrored.creases).toHaveLength(n * 2);
    expect(mirrored.creases!.some((c) => c.a >= count(mesh))).toBe(true);
    const repeated = deformMesh(mesh, [
      { ...createModifier("a", "array"), count: 3 } as never,
    ]);
    expect(repeated.creases).toHaveLength(n * 3);
    // smoothing after mirroring uses the copied creases too: with every edge sharp the result still reaches
    // the corners of the cubes (a rounded result would not)
    const both = deformMesh(mesh, [
      createModifier("m", "mirror"),
      createModifier("s", "subdivide"),
    ]);
    const xs = Array.from({ length: count(both) }, (_, p) => at(both, p));
    const range = (k: number) => [
      Math.min(...xs.map((q) => q[k]!)),
      Math.max(...xs.map((q) => q[k]!)),
    ];
    // the two cubes sit side by side (x from -0.5 to 1.5): the sharp shape keeps its full box, a rounded one would shrink
    expect(range(0)[0]).toBeCloseTo(-0.5, 5);
    expect(range(0)[1]).toBeCloseTo(1.5, 5);
    expect(range(1)[1]).toBeCloseTo(0.5, 5);
    expect(count(both)).toBeGreaterThan(count(mesh));
  });

  it("deformMesh with no modifiers keeps the creases", () => {
    const mesh = creaseAll(box(1), 1);
    expect(deformMesh(mesh, []).creases).toBe(mesh.creases);
  });
});
