import { describe, expect, it } from "vitest";
import {
  MAX_DEFORMED_POINTS,
  buildTopology,
  createModifier,
  deformMesh,
  describeModifier,
  sanitizeModifierChange,
  solidifyMesh,
  type ShapeMesh,
} from "./index";
import { box, plane } from "./testMeshes";

const triangles = (m: ShapeMesh) => m.indices.length / 3;

function volume(mesh: ShapeMesh): number {
  const p = mesh.positions;
  let v = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i]! * 3;
    const b = mesh.indices[i + 1]! * 3;
    const c = mesh.indices[i + 2]! * 3;
    v +=
      (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
        p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
        p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
      6;
  }
  return v;
}

const closed = (m: ShapeMesh) =>
  buildTopology(m).edgeFaces.every((f) => f.length === 2);

describe("solidify", () => {
  it("turns a plane into a closed slab that faces outwards, 1 x 1 x 0.1 thick", () => {
    const out = solidifyMesh(plane(2), 0.1, MAX_DEFORMED_POINTS);
    expect(closed(out)).toBe(true);
    expect(volume(out)).toBeCloseTo(0.1, 5);
  });

  it("a negative thickness grows the other way and is still a proper solid", () => {
    const up = solidifyMesh(plane(2), 0.1, MAX_DEFORMED_POINTS);
    const down = solidifyMesh(plane(2), -0.1, MAX_DEFORMED_POINTS);
    expect(closed(down)).toBe(true);
    expect(volume(down)).toBeCloseTo(0.1, 5);
    // the copies are on opposite sides of the plane (y = 0)
    const ys = (m: ShapeMesh) =>
      Array.from(
        { length: m.positions.length / 3 },
        (_, i) => m.positions[i * 3 + 1]!,
      );
    expect(Math.min(...ys(up))).toBeCloseTo(-Math.max(...ys(down)), 5);
  });

  it("a closed cube becomes hollow: twice the faces, no open edges, a shell", () => {
    const out = solidifyMesh(box(1), 0.1, MAX_DEFORMED_POINTS);
    expect(triangles(out)).toBe(24);
    expect(closed(out)).toBe(true);
    // the cube's volume minus the cavity (0.8 side)
    expect(volume(out)).toBeCloseTo(1 - 0.8 ** 3, 4);
  });

  it("changes nothing for zero thickness, an empty mesh or a mesh that would be too big", () => {
    const mesh = plane(2);
    expect(solidifyMesh(mesh, 0, MAX_DEFORMED_POINTS)).toBe(mesh);
    expect(solidifyMesh(mesh, 0.1, 4)).toBe(mesh);
    const empty = {
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
    };
    expect(solidifyMesh(empty, 0.1, MAX_DEFORMED_POINTS)).toBe(empty);
  });

  it("does not change its input", () => {
    const mesh = plane(2);
    const before = Array.from(mesh.positions);
    solidifyMesh(mesh, 0.2, MAX_DEFORMED_POINTS);
    expect(Array.from(mesh.positions)).toEqual(before);
  });
});

describe("the Thicken modifier", () => {
  it("is created, limited, described and applied like the others", () => {
    const modifier = createModifier("m", "solidify");
    expect(modifier.type).toBe("solidify");
    expect(sanitizeModifierChange(modifier, { thickness: 5 })).toEqual({
      thickness: 0.5,
    });
    expect(describeModifier(modifier)).toContain("thickness");
    const out = deformMesh(plane(2), [modifier]);
    expect(triangles(out)).toBeGreaterThan(triangles(plane(2)) * 2);
    expect(
      deformMesh(plane(2), [{ ...modifier, enabled: false }]).positions.length,
    ).toBe(plane(2).positions.length);
  });
});
