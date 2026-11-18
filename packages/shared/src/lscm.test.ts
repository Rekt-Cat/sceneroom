import { describe, expect, it } from "vitest";
import {
  MAX_LSCM_TRIANGLES,
  allPoints,
  buildTopology,
  checkMesh,
  edgeBetween,
  setSeams,
  smartUnwrap,
  unwrapAlongSeams,
  uvIslands,
  uvStretch,
  type EditMesh,
} from "./index";
import { box, plane, tube } from "./testMeshes";

function ok(mesh: EditMesh, options = {}) {
  const result = unwrapAlongSeams(mesh, options);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const maxOf = (values: Float32Array) =>
  values.reduce((m, v) => Math.max(m, v), 0);

/** The mesh with seams on the edges between the given spots (x, y, z) in order. */
function seamAlong(
  mesh: EditMesh,
  spots: [number, number, number][],
): EditMesh {
  const topology = buildTopology(mesh);
  const at = ([x, y, z]: [number, number, number]) =>
    topology.vertexOf[
      allPoints(mesh.positions.length / 3).find(
        (p) =>
          Math.abs(mesh.positions[p * 3]! - x) < 1e-6 &&
          Math.abs(mesh.positions[p * 3 + 1]! - y) < 1e-6 &&
          Math.abs(mesh.positions[p * 3 + 2]! - z) < 1e-6,
      )!
    ]!;
  const edges: number[] = [];
  for (let i = 0; i + 1 < spots.length; i++) {
    const edge = edgeBetween(topology, at(spots[i]!), at(spots[i + 1]!));
    if (edge === -1) throw new Error("no such edge");
    edges.push(edge);
  }
  return { ...mesh, seams: setSeams(mesh, topology, edges, true) };
}

/** The box of an island's map. */
function mapBox(mesh: EditMesh) {
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < mesh.uvs!.length; i += 2) {
    minU = Math.min(minU, mesh.uvs![i]!);
    maxU = Math.max(maxU, mesh.uvs![i]!);
    minV = Math.min(minV, mesh.uvs![i + 1]!);
    maxV = Math.max(maxV, mesh.uvs![i + 1]!);
  }
  return { width: maxU - minU, height: maxV - minV };
}

describe("unwrap along seams (conformal)", () => {
  it("a flat piece comes out exactly as it is: no stretch at all, nothing folded", () => {
    const result = ok(plane(4));
    expect(result.islands).toBe(1);
    expect(result.folded).toBe(0);
    expect(checkMesh(result.mesh)).toBeNull();
    expect(maxOf(uvStretch(result.mesh).values)).toBeLessThan(1e-4);
    const { width, height } = mapBox(result.mesh);
    expect(width / height).toBeCloseTo(1, 3);
  });

  it("a pipe cut along its length unrolls into a rectangle without any distortion", () => {
    const mesh = seamAlong(tube(8, 2), [
      [1, 0, 0],
      [1, 1, 0],
      [1, 2, 0],
    ]);
    const result = ok(mesh);
    expect(result.islands).toBe(1);
    expect(result.folded).toBe(0);
    expect(maxOf(uvStretch(result.mesh).values)).toBeLessThan(0.01);
    // the rectangle is as long as the eight sides of the pipe and as tall as the pipe: 6.12 by 2
    const { width, height } = mapBox(result.mesh);
    expect(Math.max(width, height) / Math.min(width, height)).toBeCloseTo(
      (8 * 2 * Math.sin(Math.PI / 8)) / 2,
      2,
    );
  });

  it("every face keeps its winding on the map", () => {
    const mesh = seamAlong(tube(8, 2), [
      [1, 0, 0],
      [1, 1, 0],
      [1, 2, 0],
    ]);
    expect(uvStretch(ok(mesh).mesh).folded).toBe(0);
  });

  it("a cube with a seam on every edge becomes six undistorted pieces", () => {
    const base = box(1);
    const topology = buildTopology(base);
    const all = topology.edgeFaces.map((_, e) => e);
    const mesh = { ...base, seams: setSeams(base, topology, all, true) };
    const result = ok(mesh);
    expect(result.islands).toBe(6);
    expect(uvIslands(result.mesh).count).toBe(6);
    expect(maxOf(uvStretch(result.mesh).values)).toBeLessThan(1e-3);
  });

  it("pieces keep their real size relative to each other (the same texture sharpness everywhere)", () => {
    const base = box(1);
    const topology = buildTopology(base);
    const all = topology.edgeFaces.map((_, e) => e);
    const result = ok({ ...base, seams: setSeams(base, topology, all, true) });
    // no size distortion: all six faces are the same size on the map
    expect(maxOf(uvStretch(result.mesh).values)).toBeLessThan(1e-3);
  });

  it("refuses a closed piece, saying how to cut it open", () => {
    const closed = unwrapAlongSeams(box(1));
    expect(closed.ok).toBe(false);
    expect(!closed.ok && closed.reason).toContain("closed");
    expect(unwrapAlongSeams(tube(8, 2, true)).ok).toBe(false);
  });

  it("refuses a mesh with no faces or too many", () => {
    expect(
      unwrapAlongSeams({
        positions: new Float32Array(0),
        indices: new Uint32Array(0),
      }).ok,
    ).toBe(false);
    // more triangles than the limit (the same triangle over and over is enough to be counted)
    const big = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]),
      indices: Uint32Array.from(
        { length: (MAX_LSCM_TRIANGLES + 1) * 3 },
        (_, i) => i % 3,
      ),
    };
    const result = unwrapAlongSeams(big);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("Unwrap instead");
  });

  it("an open ring with no cut still gets a map and reports how many faces fold", () => {
    const result = unwrapAlongSeams(tube(8, 2));
    expect(result.ok).toBe(true);
    expect(result.ok && result.folded).toBeGreaterThanOrEqual(0);
  });
});

describe("how stretched a map is", () => {
  it("a good map has none; a stretched map shows it; a turned over map is the worst", () => {
    const flat = smartUnwrap(plane(2));
    if (!flat.ok) throw new Error(flat.reason);
    expect(maxOf(uvStretch(flat.mesh).values)).toBeLessThan(1e-4);

    const stretched = {
      ...flat.mesh,
      uvs: Float32Array.from(flat.mesh.uvs!, (v, i) =>
        i % 2 === 0 ? v * 2 : v,
      ),
    };
    // one direction twice as long: the shape is off by half
    expect(uvStretch(stretched).values[0]).toBeCloseTo(0.5, 3);

    const turned = {
      ...flat.mesh,
      uvs: Float32Array.from(flat.mesh.uvs!, (v, i) => (i % 2 === 0 ? -v : v)),
    };
    const result = uvStretch(turned);
    expect(result.folded).toBe(turned.indices.length / 3);
    expect(result.values.every((v) => v === 1)).toBe(true);
  });

  it("uneven sizes on the map count too: a face given twice the share is off by one", () => {
    const flat = smartUnwrap(box(1));
    if (!flat.ok) throw new Error(flat.reason);
    // double the size of the first face's piece
    const uvs = Float32Array.from(flat.mesh.uvs!);
    const { island } = uvIslands(flat.mesh);
    const first = island[0]!;
    for (let t = 0; t < island.length; t++) {
      if (island[t] !== first) continue;
      for (let k = 0; k < 3; k++) {
        const p = flat.mesh.indices[t * 3 + k]!;
        uvs[p * 2] = uvs[p * 2]! * 2;
        uvs[p * 2 + 1] = uvs[p * 2 + 1]! * 2;
      }
    }
    const result = uvStretch({ ...flat.mesh, uvs });
    expect(result.values[0]).toBeGreaterThan(0.3);
  });

  it("a mesh without UVs has nothing to measure", () => {
    const result = uvStretch(plane(2));
    expect(maxOf(result.values)).toBe(0);
    expect(result.folded).toBe(0);
  });
});
