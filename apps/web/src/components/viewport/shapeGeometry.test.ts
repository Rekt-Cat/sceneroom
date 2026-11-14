import { describe, expect, it } from "vitest";
import { createModifier, type Modifier } from "@sceneroom/shared";
import { buildShapeGeometry } from "./shapeGeometry";

const count = (
  kind: Parameters<typeof buildShapeGeometry>[0],
  segments: number,
) => buildShapeGeometry(kind, segments, []).getAttribute("position").count;

describe("buildShapeGeometry", () => {
  it("more segments cut the shape into more points", () => {
    expect(count("cube", 4)).toBeGreaterThan(count("cube", 1));
    expect(count("plane", 8)).toBe(9 * 9);
    expect(count("cylinder", 6)).toBeGreaterThan(count("cylinder", 1));
    expect(count("cone", 6)).toBeGreaterThan(count("cone", 1));
  });

  it("a sphere is already finely cut, so segments change nothing", () => {
    expect(count("sphere", 1)).toBe(count("sphere", 16));
  });

  it("with no active modifier the plain shape is returned", () => {
    const off: Modifier = {
      ...createModifier("m", "bend"),
      enabled: false,
    } as Modifier;
    const plain = buildShapeGeometry("cube", 4, []);
    const same = buildShapeGeometry("cube", 4, [off]);
    expect(Array.from(same.getAttribute("position").array)).toEqual(
      Array.from(plain.getAttribute("position").array),
    );
  });

  it("a bend moves the points and keeps fresh bounds for clicking", () => {
    const plain = buildShapeGeometry("cube", 8, []);
    const bent = buildShapeGeometry("cube", 8, [
      { ...createModifier("m", "bend"), angle: 90 } as Modifier,
    ]);
    expect(bent.getAttribute("position").count).toBe(
      plain.getAttribute("position").count,
    );
    expect(Array.from(bent.getAttribute("position").array)).not.toEqual(
      Array.from(plain.getAttribute("position").array),
    );
    // the bent cube is not the same box any more (the ends swing round), and has fresh bounds
    plain.computeBoundingBox();
    expect(bent.boundingBox).not.toBeNull();
    // (the ends curve towards +z, past the front face of the plain box; the back face stays in the middle)
    expect(bent.boundingBox!.max.z).toBeGreaterThan(plain.boundingBox!.max.z);
    expect(bent.boundingSphere).not.toBeNull();
    // normals were recomputed and are unit length
    const n = bent.getAttribute("normal");
    expect(Math.hypot(n.getX(0), n.getY(0), n.getZ(0))).toBeCloseTo(1, 3);
  });

  it("a taper makes the top narrower", () => {
    const tapered = buildShapeGeometry("cube", 4, [
      { ...createModifier("m", "taper"), amount: 1 } as Modifier,
    ]);
    tapered.computeBoundingBox();
    // the top slice (y = 0.5) shrinks to a point, so no point of the shape is wider than the base
    let widestAtTop = 0;
    const p = tapered.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0.49)
        widestAtTop = Math.max(widestAtTop, Math.abs(p.getX(i)));
    }
    expect(widestAtTop).toBeCloseTo(0, 5);
  });

  it("mirror and array add points and triangles, and the geometry stays valid", () => {
    const plain = buildShapeGeometry("cube", 2, []);
    const mirrored = buildShapeGeometry("cube", 2, [
      createModifier("m", "mirror"),
    ]);
    expect(mirrored.getAttribute("position").count).toBe(
      plain.getAttribute("position").count * 2,
    );
    expect(mirrored.index!.count).toBe(plain.index!.count * 2);
    // the old picture coordinates no longer fit, so they are dropped
    expect(mirrored.getAttribute("uv")).toBeUndefined();
    expect(mirrored.getAttribute("normal").count).toBe(
      mirrored.getAttribute("position").count,
    );

    const repeated = buildShapeGeometry("cube", 1, [
      { ...createModifier("a", "array"), count: 4 } as Modifier,
    ]);
    expect(repeated.getAttribute("position").count).toBe(24 * 4);
    repeated.computeBoundingBox();
    // 4 cubes 1.2 lengths apart: from -0.5 to 0.5 + 3 * 1.2
    expect(repeated.boundingBox!.max.x).toBeCloseTo(0.5 + 3 * 1.2);
  });

  it("noise and stretch keep the number of points", () => {
    const plain = buildShapeGeometry("sphere", 1, []);
    const shaken = buildShapeGeometry("sphere", 1, [
      createModifier("n", "noise"),
      createModifier("s", "stretch"),
    ]);
    expect(shaken.getAttribute("position").count).toBe(
      plain.getAttribute("position").count,
    );
    expect(shaken.getAttribute("uv")).toBeDefined();
  });
});
