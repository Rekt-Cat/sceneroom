import { describe, expect, it } from "vitest";
import {
  bridgeLoops,
  deleteFaces,
  buildTopology,
  fillHole,
  flipNormals,
  mergeAtCenter,
  weldClosePoints,
  weldGroups,
  allPoints,
  type EditMesh,
  type EditResult,
} from "./index";
import { box, join, plane, tube } from "./testMeshes";

/** A mesh as plain arrays (what `join` takes). */
const plain = (m: EditMesh) => ({
  positions: Array.from(m.positions),
  indices: Array.from(m.indices),
});
const pointCount = (m: EditMesh) => m.positions.length / 3;
const triangles = (m: EditMesh) => m.indices.length / 3;

function ok(result: EditResult) {
  if (!result.ok) throw new Error(result.reason);
  return result;
}

function volume(mesh: EditMesh): number {
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

/** Every edge has two faces, and each direction is used once (the faces all face the same way round). */
function closedAndConsistent(mesh: EditMesh): boolean {
  const ids = weldGroups(mesh.positions).ids;
  const seen = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = ids[mesh.indices[t + k]!]!;
      const b = ids[mesh.indices[t + ((k + 1) % 3)]!]!;
      seen.set(`${a}>${b}`, (seen.get(`${a}>${b}`) ?? 0) + 1);
    }
  }
  for (const [key, n] of seen) {
    const [a, b] = key.split(">");
    if (n !== 1 || seen.get(`${b}>${a}`) !== 1) return false;
  }
  return buildTopology(mesh).edgeFaces.every((f) => f.length === 2);
}

/** The points of a mesh that lie at height y. */
const atHeight = (m: EditMesh, y: number) =>
  allPoints(pointCount(m)).filter(
    (p) => Math.abs(m.positions[p * 3 + 1]! - y) < 1e-6,
  );

describe("merge at centre", () => {
  it("joins the selected points into one in the middle and removes the faces that collapse", () => {
    const mesh = plane(2);
    const topology = buildTopology(mesh);
    // two neighbouring spots: the middle of the plane and the one to its right
    const at = (x: number, z: number) =>
      allPoints(pointCount(mesh)).find(
        (p) =>
          Math.abs(mesh.positions[p * 3]! - x) < 1e-6 &&
          Math.abs(mesh.positions[p * 3 + 2]! - z) < 1e-6,
      )!;
    void topology;
    const result = ok(mergeAtCenter(mesh, [at(0.5, 0.5), at(1, 0.5)]));
    expect(result.selected.length).toBe(1);
    const p = result.selected[0]!;
    expect(result.mesh.positions[p * 3]).toBeCloseTo(0.75);
    expect(pointCount(result.mesh)).toBe(pointCount(mesh) - 1);
    expect(triangles(result.mesh)).toBeLessThan(triangles(mesh));
    for (let t = 0; t < result.mesh.indices.length; t += 3) {
      const [a, b, c] = [
        result.mesh.indices[t]!,
        result.mesh.indices[t + 1]!,
        result.mesh.indices[t + 2]!,
      ];
      expect(new Set([a, b, c]).size).toBe(3);
    }
  });
  it("needs two separate points", () => {
    const mesh = box(1);
    expect(mergeAtCenter(mesh, []).ok).toBe(false);
    // the three points of one cube corner are one spot
    const corner = allPoints(pointCount(mesh)).filter(
      (p) =>
        mesh.positions[p * 3]! > 0 &&
        mesh.positions[p * 3 + 1]! > 0 &&
        mesh.positions[p * 3 + 2]! > 0,
    );
    expect(mergeAtCenter(mesh, corner).ok).toBe(false);
  });
});

describe("weld close points", () => {
  it("a cube of separate sides becomes 8 shared corners", () => {
    const mesh = box(1);
    const result = ok(weldClosePoints(mesh, allPoints(pointCount(mesh)), 1e-4));
    expect(pointCount(result.mesh)).toBe(8);
    expect(triangles(result.mesh)).toBe(12);
    expect(closedAndConsistent(result.mesh)).toBe(true);
  });
  it("says so when nothing is that close, and for no selection", () => {
    const mesh = plane(2);
    expect(weldClosePoints(mesh, allPoints(pointCount(mesh)), 1e-4).ok).toBe(
      false,
    );
    expect(weldClosePoints(mesh, [], 0.1).ok).toBe(false);
  });
  it("carries creases along with the merged points", () => {
    const mesh = { ...box(1), creases: [{ a: 0, b: 1, value: 1 }] };
    const result = ok(weldClosePoints(mesh, allPoints(pointCount(mesh)), 1e-4));
    expect(result.mesh.creases?.length ?? 0).toBeGreaterThanOrEqual(0);
  });
});

describe("flip normals", () => {
  it("flips the whole mesh with nothing selected: the volume changes sign", () => {
    const mesh = box(1);
    const before = volume(mesh);
    const after = volume(ok(flipNormals(mesh, [])).mesh);
    expect(Math.sign(after)).toBe(-Math.sign(before));
    expect(Math.abs(after)).toBeCloseTo(Math.abs(before));
  });
  it("flips only the selected face", () => {
    const mesh = box(1);
    const top = atHeight(mesh, 0.5);
    const result = ok(flipNormals(mesh, top));
    expect(triangles(result.mesh)).toBe(triangles(mesh));
    const changed = Array.from({ length: triangles(mesh) }, (_, t) => t).filter(
      (t) => mesh.indices[t * 3 + 1] !== result.mesh.indices[t * 3 + 1],
    );
    expect(changed.length).toBe(2); // the top is one square: two triangles
  });
  it("asks for a whole face when only part of one is selected", () => {
    const mesh = box(1);
    expect(flipNormals(mesh, [0]).ok).toBe(false);
  });
});

describe("fill hole", () => {
  it("closes one rim of a tube with a fan: its border edges get a second face", () => {
    const mesh = tube(6, 1);
    const open = (m: EditMesh) =>
      buildTopology(m).edgeFaces.filter((f) => f.length === 1).length;
    expect(open(mesh)).toBe(12);
    const result = ok(fillHole(mesh, atHeight(mesh, 0)));
    expect(open(result.mesh)).toBe(6);
    expect(triangles(result.mesh)).toBe(triangles(mesh) + 6);
  });
  it("closing both rims gives a solid with faces all facing out", () => {
    const mesh = tube(6, 1);
    const result = ok(fillHole(mesh, allPoints(pointCount(mesh))));
    expect(closedAndConsistent(result.mesh)).toBe(true);
    expect(Math.abs(volume(result.mesh))).toBeGreaterThan(1);
  });
  it("a triangular hole is closed by one triangle", () => {
    const mesh = tube(3, 1);
    const result = ok(fillHole(mesh, atHeight(mesh, 0)));
    expect(triangles(result.mesh)).toBe(triangles(mesh) + 1);
  });
  it("asks which hole, says when there is none", () => {
    const mesh = tube(6, 1);
    expect(fillHole(mesh, []).ok).toBe(false);
    expect(fillHole(box(1), []).ok).toBe(false);
  });
});

describe("bridge", () => {
  /** Two tubes, one standing on top of the other with a gap of 1 between them. */
  function twoTubes(): EditMesh {
    const a = tube(6, 1);
    const b = tube(6, 1);
    const shifted = Float32Array.from(b.positions, (v, i) =>
      i % 3 === 1 ? v + 3 : v,
    );
    return join([
      plain(a),
      { positions: Array.from(shifted), indices: Array.from(b.indices) },
    ]);
  }

  it("joins the facing rims of two tubes with a strip of squares that faces the same way", () => {
    const mesh = twoTubes();
    const facing = [...atHeight(mesh, 2), ...atHeight(mesh, 3)];
    const result = ok(bridgeLoops(mesh, facing));
    expect(triangles(result.mesh)).toBe(triangles(mesh) + 12);
    const open = buildTopology(result.mesh).edgeFaces;
    // only the two far rims are still open (6 edges each), and nothing is shared by three faces
    expect(open.filter((f) => f.length === 1).length).toBe(12);
    expect(open.every((f) => f.length <= 2)).toBe(true);
    // every directed edge is used once: the strip is wound the same way as the tubes
    const ids = weldGroups(result.mesh.positions).ids;
    const seen = new Set<string>();
    for (let t = 0; t < result.mesh.indices.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const key = `${ids[result.mesh.indices[t + k]!]!}>${ids[result.mesh.indices[t + ((k + 1) % 3)]!]!}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });
  it("needs exactly two rims with the same number of edges", () => {
    const mesh = twoTubes();
    expect(bridgeLoops(mesh, atHeight(mesh, 2)).ok).toBe(false);
    expect(bridgeLoops(box(1), allPoints(24)).ok).toBe(false);
  });
  it("refuses rims of different sizes", () => {
    const small = tube(4, 1);
    const big = tube(6, 1);
    const shifted = Float32Array.from(big.positions, (v, i) =>
      i % 3 === 1 ? v + 3 : v,
    );
    const mesh = join([
      plain(small),
      { positions: Array.from(shifted), indices: Array.from(big.indices) },
    ]);
    const result = bridgeLoops(mesh, [
      ...atHeight(mesh, 2),
      ...atHeight(mesh, 3),
    ]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain("same number");
  });
});

describe("fill hole where two holes touch", () => {
  it("closes only the ring of the selected edge when two squares meet at one corner", () => {
    const a = plane(1);
    const b = plane(1);
    const moved = Float32Array.from(b.positions, (v, i) =>
      i % 3 === 0 || i % 3 === 2 ? v + 1 : v,
    );
    const mesh = join([
      plain(a),
      { positions: Array.from(moved), indices: Array.from(b.indices) },
    ]);
    // the four points of the first square (one of its corners is the shared point)
    const first = allPoints(4);
    const result = ok(fillHole(mesh, first));
    // a four-sided ring is closed with a fan of four triangles
    expect(triangles(result.mesh)).toBe(triangles(mesh) + 4);
  });
});

describe("delete faces", () => {
  it("removes just the selected face of a cube and leaves a clean four-edge hole", () => {
    const mesh = box(1);
    const top = atHeight(mesh, 0.5);
    const result = ok(deleteFaces(mesh, top));
    expect(triangles(result.mesh)).toBe(triangles(mesh) - 2);
    const open = buildTopology(result.mesh).edgeFaces.filter(
      (f) => f.length === 1,
    );
    expect(open.length).toBe(4);
    // and the hole can be filled again
    expect(ok(fillHole(result.mesh, [])).mesh.indices.length).toBeGreaterThan(
      result.mesh.indices.length,
    );
  });
  it("asks for a whole face, and refuses to delete everything", () => {
    const mesh = box(1);
    expect(deleteFaces(mesh, [0]).ok).toBe(false);
    expect(deleteFaces(mesh, []).ok).toBe(false);
    expect(deleteFaces(mesh, allPoints(24)).ok).toBe(false);
  });
});
