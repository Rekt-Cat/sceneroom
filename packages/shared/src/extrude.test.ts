import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXTRUDE_OPTIONS,
  MAX_EXTRUDE_DIVISIONS,
  MAX_EXTRUDE_SCALE,
  MIN_EXTRUDE_SCALE,
  expandToWelded,
  extrudeFaces,
  flatFacePoints,
  sanitizeExtrudeOptions,
  weldGroups,
  type EditMesh,
} from "./index";

/** A unit cube whose six sides do not share points (24 points, 12 triangles), the +z side is triangles 8 and 9. */
function cube(): EditMesh {
  const h = 0.5;
  const sides: [number, number, number][][] = [
    [
      [-h, -h, h],
      [h, -h, h],
      [h, h, h],
      [-h, h, h],
    ], // +z (first, so its triangles are 0 and 1)
    [
      [h, -h, -h],
      [-h, -h, -h],
      [-h, h, -h],
      [h, h, -h],
    ],
    [
      [h, -h, h],
      [h, -h, -h],
      [h, h, -h],
      [h, h, h],
    ],
    [
      [-h, -h, -h],
      [-h, -h, h],
      [-h, h, h],
      [-h, h, -h],
    ],
    [
      [-h, h, h],
      [h, h, h],
      [h, h, -h],
      [-h, h, -h],
    ],
    [
      [-h, -h, -h],
      [h, -h, -h],
      [h, -h, h],
      [-h, -h, h],
    ],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  sides.forEach((corners, s) => {
    for (const c of corners) positions.push(...c);
    const o = s * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
  };
}

function frontFace(mesh: EditMesh) {
  const groups = weldGroups(mesh.positions);
  return {
    groups,
    selected: expandToWelded(groups, flatFacePoints(mesh, 0, groups)),
  };
}

function run(options: Parameters<typeof extrudeFaces>[4], distance = 1) {
  const mesh = cube();
  const { groups, selected } = frontFace(mesh);
  const result = extrudeFaces(mesh, selected, distance, groups, options);
  if (!result.ok) throw new Error(result.reason);
  return { before: mesh, result };
}

const z = (m: EditMesh, p: number) => m.positions[p * 3 + 2]!;
const x = (m: EditMesh, p: number) => m.positions[p * 3]!;
const y = (m: EditMesh, p: number) => m.positions[p * 3 + 1]!;

describe("extrude options", () => {
  it("with no options it is the plain straight extrusion: 4 walls of 2 triangles, a cap 1 out", () => {
    const { before, result } = run(undefined);
    // the face's 2 triangles stay (as the cap), plus 4 walls x 2 triangles
    expect(result.mesh.indices.length / 3).toBe(before.indices.length / 3 + 8);
    expect(result.selected).toHaveLength(4);
    for (const p of result.selected)
      expect(z(result.mesh, p)).toBeCloseTo(1.5, 5);
  });

  it("divisions cut the wall into bands: 4 walls x divisions x 2 triangles", () => {
    for (const divisions of [1, 2, 3, 5]) {
      const { before, result } = run({ divisions });
      expect(result.mesh.indices.length / 3).toBe(
        before.indices.length / 3 + 4 * divisions * 2,
      );
      // the cap is always at the full distance, however many bands
      for (const p of result.selected)
        expect(z(result.mesh, p)).toBeCloseTo(1.5, 5);
    }
  });

  it("the bands are evenly spaced along the way", () => {
    const { result } = run({ divisions: 4 }, 2);
    const heights = new Set<number>();
    for (let p = 0; p < result.mesh.positions.length / 3; p++) {
      heights.add(Math.round(z(result.mesh, p) * 1000) / 1000);
    }
    // the cube's own z values (-0.5, 0.5) and the steps 0.5, 1, 1.5, 2 beyond the front face at 0.5
    for (const h of [1, 1.5, 2, 2.5]) expect(heights.has(h)).toBe(true);
  });

  it("scale makes the new face smaller (a tapering stalk) or bigger (a flare), round the middle of the face", () => {
    const half = run({ scale: 0.5 });
    for (const p of half.result.selected) {
      expect(Math.abs(x(half.result.mesh, p))).toBeCloseTo(0.25, 5);
      expect(Math.abs(y(half.result.mesh, p))).toBeCloseTo(0.25, 5);
    }
    const double = run({ scale: 2 });
    for (const p of double.result.selected) {
      expect(Math.abs(x(double.result.mesh, p))).toBeCloseTo(1, 5);
    }
  });

  it("scale grows gradually along the divisions, so the walls taper evenly", () => {
    const { result } = run({ scale: 0.5, divisions: 2 }, 1);
    // halfway up (z = 1.0) the face is 75 percent of the way to the full size change: 0.5 * (1 - 0.25) = 0.375
    let found = false;
    for (let p = 0; p < result.mesh.positions.length / 3; p++) {
      if (Math.abs(z(result.mesh, p) - 1) < 1e-5) {
        expect(Math.abs(x(result.mesh, p))).toBeCloseTo(0.375, 5);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("twist turns the new face round its direction, keeping its size and height", () => {
    const { result } = run({ twistDegrees: 90 });
    for (const p of result.selected) {
      // a square face's corners (+-0.5, +-0.5) turned 90 degrees land on the same four corners
      expect(Math.abs(x(result.mesh, p))).toBeCloseTo(0.5, 5);
      expect(Math.abs(y(result.mesh, p))).toBeCloseTo(0.5, 5);
      expect(z(result.mesh, p)).toBeCloseTo(1.5, 5);
    }
    const forty = run({ twistDegrees: 45 });
    for (const p of forty.result.selected) {
      // turned 45 degrees: a corner at distance 0.707 now lies on an axis
      const radius = Math.hypot(
        x(forty.result.mesh, p),
        y(forty.result.mesh, p),
      );
      expect(radius).toBeCloseTo(Math.SQRT1_2, 5);
      expect(
        Math.min(
          Math.abs(x(forty.result.mesh, p)),
          Math.abs(y(forty.result.mesh, p)),
        ),
      ).toBeCloseTo(0, 5);
    }
  });

  it("walls with options still face outwards (no inside-out wall)", () => {
    const { result } = run({ divisions: 3, scale: 0.6, twistDegrees: 40 });
    // the wall triangles are the last ones; their normal should point away from the extrusion's axis (x, y)
    const m = result.mesh;
    const start = m.indices.length - 4 * 3 * 2 * 3;
    for (let t = start; t < m.indices.length; t += 3) {
      const a = m.indices[t]!,
        b = m.indices[t + 1]!,
        c = m.indices[t + 2]!;
      const u = [
        x(m, b) - x(m, a),
        y(m, b) - y(m, a),
        z(m, b) - z(m, a),
      ] as const;
      const v = [
        x(m, c) - x(m, a),
        y(m, c) - y(m, a),
        z(m, c) - z(m, a),
      ] as const;
      const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      const cx = (x(m, a) + x(m, b) + x(m, c)) / 3;
      const cy = (y(m, a) + y(m, b) + y(m, c)) / 3;
      expect(n[0]! * cx + n[1]! * cy).toBeGreaterThan(-1e-9);
    }
  });

  it("an extruded and tapered cap can be extruded again (the cap is selected and is a face)", () => {
    const first = run({ scale: 0.5 });
    const groups = weldGroups(first.result.mesh.positions);
    const again = extrudeFaces(
      first.result.mesh,
      expandToWelded(groups, first.result.selected),
      1,
      groups,
      { scale: 0.5 },
    );
    expect(again.ok).toBe(true);
    if (again.ok) {
      for (const p of again.selected) {
        expect(Math.abs(x(again.mesh, p))).toBeCloseTo(0.125, 5);
        expect(z(again.mesh, p)).toBeCloseTo(2.5, 4);
      }
    }
  });
});

describe("sanitizing the options", () => {
  it("keeps good values and gives whole numbers of divisions", () => {
    expect(
      sanitizeExtrudeOptions({ divisions: 3.6, scale: 0.8, twistDegrees: 30 }),
    ).toEqual({
      divisions: 4,
      scale: 0.8,
      twistDegrees: 30,
    });
  });

  it("puts values in range and replaces numbers that are not numbers", () => {
    expect(
      sanitizeExtrudeOptions({ divisions: 999, scale: 99, twistDegrees: 9999 }),
    ).toEqual({
      divisions: MAX_EXTRUDE_DIVISIONS,
      scale: MAX_EXTRUDE_SCALE,
      twistDegrees: 360,
    });
    expect(
      sanitizeExtrudeOptions({ divisions: 0, scale: 0, twistDegrees: -9999 }),
    ).toEqual({
      divisions: 1,
      scale: MIN_EXTRUDE_SCALE,
      twistDegrees: -360,
    });
    expect(
      sanitizeExtrudeOptions({
        divisions: NaN,
        scale: Infinity,
        twistDegrees: NaN,
      }),
    ).toEqual(DEFAULT_EXTRUDE_OPTIONS);
    expect(sanitizeExtrudeOptions({})).toEqual(DEFAULT_EXTRUDE_OPTIONS);
  });
});

describe("pushing in and insetting", () => {
  const normalOf = (m: EditMesh, t: number) => {
    const [a, b, c] = [
      m.indices[t * 3]!,
      m.indices[t * 3 + 1]!,
      m.indices[t * 3 + 2]!,
    ];
    const u = [x(m, b) - x(m, a), y(m, b) - y(m, a), z(m, b) - z(m, a)];
    const v = [x(m, c) - x(m, a), y(m, c) - y(m, a), z(m, c) - z(m, a)];
    return [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ];
  };

  it("a negative distance pushes the face IN: the cap lies below the old face, and the walls face the middle", () => {
    const { result } = run(undefined, -0.3);
    for (const p of result.selected)
      expect(z(result.mesh, p)).toBeCloseTo(0.2, 5);
    // the wall triangles are the last 8: each faces towards the axis (x, y) of the recess, not away from it
    const m = result.mesh;
    for (let t = m.indices.length / 3 - 8; t < m.indices.length / 3; t++) {
      const n = normalOf(m, t);
      const [a, b, c] = [
        m.indices[t * 3]!,
        m.indices[t * 3 + 1]!,
        m.indices[t * 3 + 2]!,
      ];
      const cx = (x(m, a) + x(m, b) + x(m, c)) / 3;
      const cy = (y(m, a) + y(m, b) + y(m, c)) / 3;
      expect(n[0]! * cx + n[1]! * cy).toBeLessThan(1e-9);
    }
  });

  it("an inset (distance 0, a smaller scale) keeps the new face level with the old one and leaves a flat ring", () => {
    const { before, result } = run({ scale: 0.5 }, 0);
    expect(result.mesh.indices.length / 3).toBe(before.indices.length / 3 + 8);
    for (const p of result.selected) {
      expect(z(result.mesh, p)).toBeCloseTo(0.5, 5);
      expect(Math.abs(x(result.mesh, p))).toBeCloseTo(0.25, 5);
    }
    // every new triangle faces the same way as the front face (+z), the ring included
    const m = result.mesh;
    for (let t = m.indices.length / 3 - 8; t < m.indices.length / 3; t++) {
      expect(normalOf(m, t)[2]!).toBeGreaterThan(0);
    }
  });

  it("an inset can then be pushed in or out", () => {
    const out = run({ scale: 0.5 }, 0.4).result;
    for (const p of out.selected) expect(z(out.mesh, p)).toBeCloseTo(0.9, 5);
    const inward = run({ scale: 0.5 }, -0.2).result;
    for (const p of inward.selected)
      expect(z(inward.mesh, p)).toBeCloseTo(0.3, 5);
  });

  it("refuses when nothing would change", () => {
    const mesh = cube();
    const { groups, selected } = frontFace(mesh);
    const result = extrudeFaces(mesh, selected, 0, groups, {
      scale: 1,
      twistDegrees: 0,
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("Nothing would change");
    // a twist alone is a change
    expect(
      extrudeFaces(mesh, selected, 0, groups, { twistDegrees: 30 }).ok,
    ).toBe(true);
  });
});

describe("extrude and delete keep creases", () => {
  it("an extrusion keeps the creases of the old edges, on the same points", () => {
    const mesh = { ...cube(), creases: [{ a: 0, b: 1, value: 0.8 }] };
    const groups = weldGroups(mesh.positions);
    const selected = expandToWelded(groups, flatFacePoints(mesh, 0, groups));
    const result = extrudeFaces(mesh, selected, 1, groups);
    expect(result.ok && result.mesh.creases).toEqual([
      { a: 0, b: 1, value: 0.8 },
    ]);
  });
});
