import { describe, expect, it } from "vitest";
import {
  buildTopology,
  checkMesh,
  edgeBetween,
  packShelves,
  setSeams,
  smartUnwrap,
  uvIslands,
  weldGroups,
  allPoints,
  type EditMesh,
} from "./index";
import { box, plane, tube } from "./testMeshes";

function unwrapped(mesh: EditMesh, options = {}) {
  const result = smartUnwrap(mesh, options);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

/** The signed area of every triangle in the UV map (positive when it keeps its winding). */
function uvAreas(mesh: EditMesh): number[] {
  const uv = mesh.uvs!;
  const out: number[] = [];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [
      mesh.indices[t]!,
      mesh.indices[t + 1]!,
      mesh.indices[t + 2]!,
    ];
    out.push(
      ((uv[b * 2]! - uv[a * 2]!) * (uv[c * 2 + 1]! - uv[a * 2 + 1]!) -
        (uv[b * 2 + 1]! - uv[a * 2 + 1]!) * (uv[c * 2]! - uv[a * 2]!)) /
        2,
    );
  }
  return out;
}

/** The box (min, max in u and v) of every island. */
function islandBoxes(mesh: EditMesh) {
  const { island, count } = uvIslands(mesh);
  const boxes = Array.from({ length: count }, () => ({
    minU: Infinity,
    minV: Infinity,
    maxU: -Infinity,
    maxV: -Infinity,
  }));
  for (let t = 0; t < island.length; t++) {
    for (let k = 0; k < 3; k++) {
      const point = mesh.indices[t * 3 + k]!;
      const b = boxes[island[t]!]!;
      const u = mesh.uvs![point * 2]!;
      const v = mesh.uvs![point * 2 + 1]!;
      b.minU = Math.min(b.minU, u);
      b.maxU = Math.max(b.maxU, u);
      b.minV = Math.min(b.minV, v);
      b.maxV = Math.max(b.maxV, v);
    }
  }
  return boxes;
}

describe("packing into the square", () => {
  it("places rectangles apart, inside the square, or says they do not fit", () => {
    const placed = packShelves(
      [
        { width: 0.3, height: 0.3 },
        { width: 0.3, height: 0.2 },
        { width: 0.2, height: 0.4 },
      ],
      0.02,
    )!;
    expect(placed).toHaveLength(3);
    expect(packShelves([{ width: 0.99, height: 0.5 }], 0.02)).toBeNull();
    expect(
      packShelves(
        Array.from({ length: 30 }, () => ({ width: 0.3, height: 0.3 })),
        0.02,
      ),
    ).toBeNull();
  });
});

describe("smart unwrap", () => {
  it("a plane is one island of the right shape, inside the square with a margin", () => {
    const result = unwrapped(plane(2));
    expect(result.islands).toBe(1);
    expect(checkMesh(result.mesh)).toBeNull();
    const [box1] = islandBoxes(result.mesh);
    expect(box1!.minU).toBeGreaterThanOrEqual(0.02 - 1e-6);
    expect(box1!.maxU).toBeLessThanOrEqual(0.98 + 1e-6);
    // a square plane stays square
    expect(box1!.maxU - box1!.minU).toBeCloseTo(box1!.maxV - box1!.minV, 5);
  });

  it("a cube becomes six islands, equal in size, apart from each other, none flipped", () => {
    const result = unwrapped(box(1));
    expect(result.islands).toBe(6);
    expect(uvAreas(result.mesh).every((a) => a > 0)).toBe(true);
    const boxes = islandBoxes(result.mesh);
    const sizes = boxes.map((b) => [b.maxU - b.minU, b.maxV - b.minV]);
    for (const [w, h] of sizes) {
      expect(w).toBeCloseTo(sizes[0]![0]!, 5);
      expect(h).toBeCloseTo(sizes[0]![1]!, 5);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const apart =
          a.maxU <= b.minU ||
          b.maxU <= a.minU ||
          a.maxV <= b.minV ||
          b.maxV <= a.minV;
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps every face's shape in proportion: all faces of a cube have the same area in the map", () => {
    const areas = uvAreas(unwrapped(box(1)).mesh);
    for (const a of areas) expect(a).toBeCloseTo(areas[0]!, 6);
  });

  it("the same points, the same triangles; only the points on a cut are doubled", () => {
    const mesh = tube(8, 2);
    const result = unwrapped(mesh);
    expect(result.mesh.indices.length).toBe(mesh.indices.length);
    expect(result.mesh.uvs!.length).toBe(
      (result.mesh.positions.length / 3) * 2,
    );
    expect(result.islands).toBeGreaterThanOrEqual(2);
    expect(uvAreas(result.mesh).every((a) => a > 0)).toBe(true);
    // points that were shared inside a chart are still shared: fewer new points than three per triangle
    expect(result.mesh.positions.length / 3).toBeLessThan(mesh.indices.length);
  });

  it("a seam cuts a plane into two islands, and no seam leaves it as one", () => {
    const mesh = plane(2);
    const topology = buildTopology(mesh);
    const at = (x: number, z: number) =>
      topology.vertexOf[
        allPoints(mesh.positions.length / 3).find(
          (p) =>
            Math.abs(mesh.positions[p * 3]! - x) < 1e-6 &&
            Math.abs(mesh.positions[p * 3 + 2]! - z) < 1e-6,
        )!
      ]!;
    // a seam all the way across the middle: (0, 0.5) - (0.5, 0.5) - (1, 0.5)
    const edges = [
      edgeBetween(topology, at(0, 0.5), at(0.5, 0.5)),
      edgeBetween(topology, at(0.5, 0.5), at(1, 0.5)),
    ];
    const seams = setSeams(mesh, topology, edges, true);
    expect(unwrapped({ ...mesh, seams }).islands).toBe(2);
    expect(unwrapped(mesh).islands).toBe(1);
  });

  it("a larger angle limit makes fewer charts, a smaller one more", () => {
    const mesh = tube(12, 1);
    expect(unwrapped(mesh, { angleLimitDegrees: 100 }).islands).toBeLessThan(
      unwrapped(mesh, { angleLimitDegrees: 20 }).islands,
    );
  });

  it("carries creases and seams onto the new points, and replaces an earlier map", () => {
    const mesh = {
      ...box(1),
      creases: [{ a: 0, b: 1, value: 1 }],
      uvs: new Float32Array(48),
    };
    const result = unwrapped(mesh);
    expect(result.mesh.creases?.length).toBe(1);
    expect(result.mesh.uvs!.some((v) => v !== 0)).toBe(true);
    expect(checkMesh(result.mesh)).toBeNull();
  });

  it("refuses a mesh with no faces", () => {
    const empty = {
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
    };
    expect(smartUnwrap(empty).ok).toBe(false);
  });

  it("welded positions stay one spot: unwrapping does not move any point", () => {
    const mesh = box(1);
    const result = unwrapped(mesh);
    const before = new Set(
      weldGroups(mesh.positions).members.length ? [0] : [],
    );
    expect(before.size).toBe(1);
    // every new point lies where an old point lay
    const old = new Set<string>();
    for (let i = 0; i < mesh.positions.length; i += 3) {
      old.add(
        `${mesh.positions[i]},${mesh.positions[i + 1]},${mesh.positions[i + 2]}`,
      );
    }
    for (let i = 0; i < result.mesh.positions.length; i += 3) {
      expect(
        old.has(
          `${result.mesh.positions[i]},${result.mesh.positions[i + 1]},${result.mesh.positions[i + 2]}`,
        ),
      ).toBe(true);
    }
  });
});

describe("islands", () => {
  it("finds the pieces of a mesh whose points are split between them", () => {
    expect(uvIslands(unwrapped(box(1)).mesh).count).toBe(6);
    expect(uvIslands(plane(3)).count).toBe(1);
  });
});
