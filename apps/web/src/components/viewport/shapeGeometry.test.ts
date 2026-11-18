import { describe, expect, it } from "vitest";
import { createModifier, type Modifier } from "@sceneroom/shared";
import {
  buildMeshGeometry,
  buildShapeGeometry,
  geometryToMesh,
} from "./shapeGeometry";

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
    // the copy has the same map, so the picture coordinates still fit
    expect(mirrored.getAttribute("uv").count).toBe(
      mirrored.getAttribute("position").count,
    );
    // Smooth cuts every face into new points the map does not know yet, so it drops the coordinates
    const smoothed = buildShapeGeometry("cube", 1, [
      createModifier("s", "subdivide"),
    ]);
    expect(smoothed.getAttribute("uv")).toBeUndefined();
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

  it("Smooth rounds a cube into a closed blob with normals and no cracks (26 points, 48 triangles)", () => {
    const smooth = buildShapeGeometry("cube", 1, [
      createModifier("s", "subdivide"),
    ]);
    expect(smooth.getAttribute("position").count).toBe(26);
    expect(smooth.index!.count / 3).toBe(48);
    expect(smooth.getAttribute("normal").count).toBe(26);
    // the corners are pulled in: no point is as far out as a corner of the cube (0.87)
    const position = smooth.getAttribute("position");
    let farthest = 0;
    for (let p = 0; p < position.count; p++) {
      farthest = Math.max(
        farthest,
        Math.hypot(position.getX(p), position.getY(p), position.getZ(p)),
      );
    }
    expect(farthest).toBeLessThan(Math.hypot(0.5, 0.5, 0.5));
  });

  it("Smooth works on a cylinder and a sphere too, and more levels make more triangles", () => {
    for (const kind of ["cylinder", "sphere", "cone", "plane"] as const) {
      const one = buildShapeGeometry(kind, 1, [
        createModifier("s", "subdivide"),
      ]);
      const two = buildShapeGeometry(kind, 1, [
        { ...createModifier("s", "subdivide"), levels: 2 } as Modifier,
      ]);
      expect(one.index!.count).toBeGreaterThan(0);
      expect(two.index!.count).toBeGreaterThan(one.index!.count);
      expect(Number.isFinite(two.getAttribute("position").getX(0))).toBe(true);
    }
  });

  it("Smooth after Bend keeps both: the bent shape is smoothed", () => {
    const bent = buildShapeGeometry("cube", 4, [
      createModifier("b", "bend"),
      createModifier("s", "subdivide"),
    ]);
    const plain = buildShapeGeometry("cube", 4, [createModifier("b", "bend")]);
    expect(bent.index!.count).toBeGreaterThan(plain.index!.count);
  });
});

describe("UVs of an editable mesh", () => {
  it("a mesh with UVs gets them on its geometry, and a converted shape keeps its own", () => {
    const mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
    };
    const geometry = buildMeshGeometry(mesh, []);
    expect(Array.from(geometry.getAttribute("uv").array)).toEqual([
      0, 0, 1, 0, 0, 1,
    ]);
    // converting a built-in shape to a mesh brings its UVs along
    const cube = geometryToMesh(buildShapeGeometry("cube", 1, []));
    expect(cube.uvs?.length).toBe((cube.positions.length / 3) * 2);
    // and a mesh without UVs has none on its geometry
    expect(
      buildMeshGeometry(
        { positions: mesh.positions, indices: mesh.indices },
        [],
      ).getAttribute("uv"),
    ).toBeUndefined();
  });

  it("modifiers that move points keep the map of a built-in shape", () => {
    const bent = buildShapeGeometry("plane", 4, [
      { ...createModifier("b", "bend"), angle: 90 } as Modifier,
    ]);
    expect(bent.getAttribute("uv").count).toBe(
      bent.getAttribute("position").count,
    );
  });
});

describe("shading across a cut in the UV map", () => {
  /** Two triangles meeting along an edge, each with its own points (as after an unwrap), bent by `degrees`. */
  function bent(degrees: number) {
    const r = (degrees * Math.PI) / 180;
    // The shared edge runs from (0, 0, 0) to (0, 1, 0); one wing goes left in the plane, one turns away by `degrees`
    const left = [0, 0, 0, 0, 1, 0, -1, 0, 0];
    const right = [0, 0, 0, Math.cos(r), 0, Math.sin(r), 0, 1, 0];
    return {
      positions: new Float32Array([...left, ...right]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
      uvs: new Float32Array(12),
    };
  }
  const normalAt = (g: ReturnType<typeof buildMeshGeometry>, i: number) => [
    g.getAttribute("normal").getX(i),
    g.getAttribute("normal").getY(i),
    g.getAttribute("normal").getZ(i),
  ];

  it("a gentle bend is shaded as one surface: the two copies of a point share a normal", () => {
    const g = buildMeshGeometry(bent(20), []);
    // points 0 and 3 sit on the same spot (0, 0, 0)
    const a = normalAt(g, 0);
    const b = normalAt(g, 3);
    expect(a[0]).toBeCloseTo(b[0]!, 5);
    expect(a[1]).toBeCloseTo(b[1]!, 5);
    expect(a[2]).toBeCloseTo(b[2]!, 5);
  });

  it("a real corner keeps its two normals", () => {
    const g = buildMeshGeometry(bent(90), []);
    const a = normalAt(g, 0);
    const b = normalAt(g, 3);
    const same =
      Math.abs(a[0]! - b[0]!) +
        Math.abs(a[1]! - b[1]!) +
        Math.abs(a[2]! - b[2]!) <
      1e-4;
    expect(same).toBe(false);
  });

  it("a mesh without UVs is shaded exactly as before (nothing is averaged)", () => {
    const { uvs, ...plain } = bent(20);
    void uvs;
    const g = buildMeshGeometry(plain, []);
    const a = normalAt(g, 0);
    const b = normalAt(g, 3);
    expect(Math.abs(a[2]! - b[2]!)).toBeGreaterThan(1e-3);
  });
});
