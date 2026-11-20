import { describe, expect, it } from "vitest";
import {
  bevelEdges,
  bridgeLoops,
  buildTopology,
  deleteFaces,
  deletePoints,
  divideFaces,
  edgeBetween,
  extrudeEdges,
  extrudeFaces,
  fillHole,
  flipNormals,
  loopCut,
  mergeAtCenter,
  solidifyMesh,
  weldClosePoints,
  weldGroups,
  allPoints,
  type EditMesh,
} from "./index";
import { box, join, plane, tube } from "./testMeshes";

/**
 * A map that is a plain linear function of the position: a point's UV is (x + 0.3 y, z + 0.1 y). After any tool that
 * works along straight lines, every point (old or new) must still be at exactly that UV: the map was carried
 * correctly if no new point is off it.
 */
const mapOf = (positions: Float32Array): Float32Array => {
  const uvs = new Float32Array((positions.length / 3) * 2);
  for (let i = 0; i < positions.length / 3; i++) {
    uvs[i * 2] = positions[i * 3]! + 0.3 * positions[i * 3 + 1]!;
    uvs[i * 2 + 1] = positions[i * 3 + 2]! + 0.1 * positions[i * 3 + 1]!;
  }
  return uvs;
};
const withMap = (mesh: EditMesh): EditMesh => ({
  ...mesh,
  uvs: mapOf(mesh.positions),
});

function expectMapKept(mesh: EditMesh) {
  expect(mesh.uvs).toBeDefined();
  expect(mesh.uvs!.length).toBe((mesh.positions.length / 3) * 2);
  const expected = mapOf(mesh.positions);
  for (let i = 0; i < expected.length; i++) {
    expect(mesh.uvs![i]).toBeCloseTo(expected[i]!, 5);
  }
}

describe("the UV map goes through Divide", () => {
  it("a square, a cube and a triangle keep an exact map", () => {
    for (const mesh of [plane(2), box(1)]) {
      for (const cuts of [1, 3]) {
        const result = divideFaces(withMap(mesh), [], cuts);
        expect(result.ok).toBe(true);
        if (result.ok) expectMapKept(result.mesh);
      }
    }
    const triangle: EditMesh = withMap({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]),
      indices: Uint32Array.from([0, 2, 1]),
    });
    const result = divideFaces(triangle, [], 2);
    expect(result.ok).toBe(true);
    if (result.ok) expectMapKept(result.mesh);
  });

  it("a mesh without a map gets none", () => {
    const result = divideFaces(box(1), [], 1);
    expect(result.ok && result.mesh.uvs).toBeUndefined();
  });

  it("only part divided: the divided faces keep an exact map and the rest is untouched", () => {
    const mesh = withMap(plane(2));
    const cell = allPoints(9).filter(
      (p) =>
        mesh.positions[p * 3]! <= 0.5 + 1e-6 &&
        mesh.positions[p * 3 + 2]! <= 0.5 + 1e-6,
    );
    const result = divideFaces(mesh, cell, 1);
    expect(result.ok).toBe(true);
    if (result.ok) expectMapKept(result.mesh);
  });
});

describe("the UV map goes through Loop cut", () => {
  it("new points lie on the map between the two points they lie between", () => {
    const mesh = withMap(plane(3));
    const topology = buildTopology(mesh);
    const edge = edgeBetween(topology, 0, 1);
    for (const cuts of [1, 2]) {
      const result = loopCut(mesh, topology, edge === -1 ? 0 : edge, {
        cuts,
        slide: 0,
      });
      expect(result.ok).toBe(true);
      if (result.ok) expectMapKept(result.mesh);
    }
  });

  it("a cube's cut keeps the map on every side", () => {
    const mesh = withMap(box(2));
    const topology = buildTopology(mesh);
    const result = loopCut(mesh, topology, 0, { cuts: 1, slide: 0.3 });
    expect(result.ok).toBe(true);
    if (result.ok) expectMapKept(result.mesh);
  });
});

/** Every UV pair of the result is one the original map had (a new point copied it from a point it came from). */
function expectOnlyOldUvs(before: EditMesh, after: EditMesh) {
  expect(after.uvs).toBeDefined();
  expect(after.uvs!.length).toBe((after.positions.length / 3) * 2);
  const old = new Set<string>();
  for (let i = 0; i < before.uvs!.length; i += 2) {
    old.add(`${before.uvs![i]!.toFixed(5)},${before.uvs![i + 1]!.toFixed(5)}`);
  }
  for (let i = 0; i < after.uvs!.length; i += 2) {
    expect(
      old.has(`${after.uvs![i]!.toFixed(5)},${after.uvs![i + 1]!.toFixed(5)}`),
    ).toBe(true);
  }
}

describe("the UV map goes through the tools that remove, join and fill", () => {
  it("deleting points and faces keeps the map of the points that stay, exactly", () => {
    const mesh = withMap(box(2));
    const front = allPoints(mesh.positions.length / 3).filter(
      (p) => mesh.positions[p * 3 + 2]! > 0.4,
    );
    const faces = deleteFaces(mesh, front);
    expect(faces.ok).toBe(true);
    if (faces.ok) expectMapKept(faces.mesh);
    const points = deletePoints(mesh, [0, 1, 2, 3]);
    expect(points.ok).toBe(true);
    if (points.ok) expectMapKept(points.mesh);
  });

  it("flip, bridge and fill hole keep the map; the middle of a filled hole is the middle of its rim", () => {
    const mesh = withMap(box(1));
    const flipped = flipNormals(mesh, []);
    expect(flipped.ok).toBe(true);
    if (flipped.ok) expectMapKept(flipped.mesh);

    const open = withMap(tube(6, 1));
    const filled = fillHole(open, allPoints(open.positions.length / 3));
    expect(filled.ok).toBe(true);
    if (filled.ok) expectMapKept(filled.mesh);

    const a = tube(6, 1);
    const b = tube(6, 1);
    const moved = Float32Array.from(b.positions, (v, i) =>
      i % 3 === 1 ? v + 3 : v,
    );
    const two = withMap(
      join([
        { positions: Array.from(a.positions), indices: Array.from(a.indices) },
        { positions: Array.from(moved), indices: Array.from(b.indices) },
      ]),
    );
    const facing = allPoints(two.positions.length / 3).filter((p) => {
      const y = two.positions[p * 3 + 1]!;
      return Math.abs(y - 2) < 1e-6 || Math.abs(y - 3) < 1e-6;
    });
    const bridged = bridgeLoops(two, facing);
    expect(bridged.ok).toBe(true);
    if (bridged.ok) expectMapKept(bridged.mesh);
  });

  it("weld keeps the map of the point it joins to", () => {
    const mesh = withMap(box(1));
    const result = weldClosePoints(mesh, allPoints(24), 1e-4);
    expect(result.ok).toBe(true);
    if (result.ok) expectMapKept(result.mesh);
    const merged = mergeAtCenter(withMap(plane(2)), [0, 1]);
    expect(merged.ok).toBe(true);
    if (merged.ok)
      expect(merged.mesh.uvs!.length).toBe(
        (merged.mesh.positions.length / 3) * 2,
      );
  });
});

describe("the UV map goes through the tools that copy points", () => {
  it("extrude and inset: the new cap and walls take the map of the points they were copied from", () => {
    const mesh = withMap(box(1));
    const groups = weldGroups(mesh.positions);
    const top = allPoints(24).filter(
      (p) => Math.abs(mesh.positions[p * 3 + 1]! - 0.5) < 1e-6,
    );
    const result = extrudeFaces(mesh, top, 0.5, groups);
    expect(result.ok).toBe(true);
    if (result.ok) expectOnlyOldUvs(mesh, result.mesh);
    const inset = extrudeFaces(mesh, top, 0, groups, { scale: 0.6 });
    expect(inset.ok).toBe(true);
    if (inset.ok) expectOnlyOldUvs(mesh, inset.mesh);
  });

  it("extruding an edge does the same", () => {
    const mesh = withMap(plane(1));
    const topology = buildTopology(mesh);
    const border = topology.edgeFaces.findIndex((f) => f.length === 1);
    const result = extrudeEdges(mesh, topology, [border], 0.4, 2);
    expect(result.ok).toBe(true);
    if (result.ok) expectOnlyOldUvs(mesh, result.mesh);
  });

  it("Thicken copies the map to the inner shell and the walls", () => {
    const mesh = withMap(plane(2));
    const result = solidifyMesh(mesh, 0.1, 100000);
    expectOnlyOldUvs(mesh, result);
    // the inner shell has the same map as the outer one
    const count = mesh.positions.length / 3;
    for (let i = 0; i < count * 2; i++)
      expect(result.uvs![count * 2 + i]).toBeCloseTo(mesh.uvs![i]!, 6);
  });
});

describe("the UV map goes through Bevel", () => {
  it("a bevelled cube keeps a finite map with a value for every point, inside the range the cube had", () => {
    const base = withMap(box(1));
    const topology = buildTopology(base);
    const edge = topology.edgeFaces.findIndex((f) => f.length === 2);
    const result = bevelEdges(base, topology, [edge], 0.1, 2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const uvs = result.mesh.uvs!;
    expect(uvs.length).toBe((result.mesh.positions.length / 3) * 2);
    const lo = [
      Math.min(...base.uvs!.filter((_, i) => i % 2 === 0)),
      Math.min(...base.uvs!.filter((_, i) => i % 2 === 1)),
    ];
    const hi = [
      Math.max(...base.uvs!.filter((_, i) => i % 2 === 0)),
      Math.max(...base.uvs!.filter((_, i) => i % 2 === 1)),
    ];
    for (let i = 0; i < uvs.length; i += 2) {
      expect(Number.isFinite(uvs[i])).toBe(true);
      expect(uvs[i]!).toBeGreaterThanOrEqual(lo[0]! - 1e-6);
      expect(uvs[i]!).toBeLessThanOrEqual(hi[0]! + 1e-6);
      expect(uvs[i + 1]!).toBeGreaterThanOrEqual(lo[1]! - 1e-6);
      expect(uvs[i + 1]!).toBeLessThanOrEqual(hi[1]! + 1e-6);
    }
  });
});
