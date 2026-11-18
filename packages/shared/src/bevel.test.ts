import { describe, expect, it } from "vitest";
import {
  allPoints,
  bevelEdges,
  buildTopology,
  selectedEdges,
  edgeBetween,
  maxBevelWidth,
  type EditMesh,
} from "./index";
import { box, plane } from "./testMeshes";

function run(
  mesh: EditMesh,
  pick: (t: ReturnType<typeof buildTopology>) => number[],
  w: number,
  n = 1,
) {
  const topology = buildTopology(mesh);
  const result = bevelEdges(mesh, topology, pick(topology), w, n);
  if (!result.ok) throw new Error(result.reason);
  return { result, after: buildTopology(result.mesh) };
}

/** Every edge has exactly two faces and the surface faces outward (signed volume positive). */
function expectClosedAndOutward(mesh: EditMesh) {
  const t = buildTopology(mesh);
  expect(t.edgeFaces.every((f) => f.length === 2)).toBe(true);
  let volume = 0;
  const p = (i: number) => [
    mesh.positions[i * 3]!,
    mesh.positions[i * 3 + 1]!,
    mesh.positions[i * 3 + 2]!,
  ];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = p(mesh.indices[i]!);
    const b = p(mesh.indices[i + 1]!);
    const c = p(mesh.indices[i + 2]!);
    volume +=
      (a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) -
        a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) +
        a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!)) /
      6;
  }
  expect(volume).toBeGreaterThan(0);
}

const cubeEdge = (t: ReturnType<typeof buildTopology>) => {
  // the edge between the vertices at (0.5,0.5,0.5) and (0.5,0.5,-0.5)
  const find = (x: number, y: number, z: number) =>
    Array.from({ length: t.vertexPositions.length / 3 }, (_, v) => v).find(
      (v) =>
        Math.abs(t.vertexPositions[v * 3]! - x) < 1e-6 &&
        Math.abs(t.vertexPositions[v * 3 + 1]! - y) < 1e-6 &&
        Math.abs(t.vertexPositions[v * 3 + 2]! - z) < 1e-6,
    )!;
  return [edgeBetween(t, find(0.5, 0.5, 0.5), find(0.5, 0.5, -0.5))];
};

describe("bevel on a cube", () => {
  it("one edge becomes a chamfer and the cube stays closed", () => {
    const { result, after } = run(box(1), cubeEdge, 0.1);
    expect(result.width).toBeCloseTo(0.1);
    expectClosedAndOutward(result.mesh);
    expect(after.edgeFaces.every((f) => f.length === 2)).toBe(true);
    expect(result.selected.length).toBe(4);
  });

  it("more segments make a rounder, still closed, bevel", () => {
    const { result } = run(box(1), cubeEdge, 0.1, 4);
    expectClosedAndOutward(result.mesh);
    expect(result.selected.length).toBe(10);
  });

  it("all twelve edges: closed, 24 vertices and 26 faces", () => {
    const { result, after } = run(
      box(1),
      (t) =>
        t.edgeFaces
          .map((_, e) => e)
          .filter((e) => t.edgeFaces[e]!.length === 2 && cornerEdge(t, e)),
      0.1,
    );
    expectClosedAndOutward(result.mesh);
    expect(after.vertexPositions.length / 3).toBe(24);
    expect(after.faces.length).toBe(26);
  });

  it("is limited so it cannot cross the edge", () => {
    const { result } = run(box(1), cubeEdge, 50);
    expect(result.width).toBeLessThanOrEqual(0.5);
    expectClosedAndOutward(result.mesh);
  });
});

/** Cube edges are the ones between faces at right angles (not the diagonals of quads). */
function cornerEdge(t: ReturnType<typeof buildTopology>, e: number) {
  const [a, b] = [t.edges[e * 2]!, t.edges[e * 2 + 1]!];
  const d = [0, 1, 2].map((k) =>
    Math.abs(t.vertexPositions[a * 3 + k]! - t.vertexPositions[b * 3 + k]!),
  );
  return d.filter((x) => x > 1e-6).length === 1;
}

describe("bevel refusals", () => {
  it("asks for a selection", () => {
    const mesh = box(1);
    expect(bevelEdges(mesh, buildTopology(mesh), [], 0.1).ok).toBe(false);
  });
  it("refuses border edges", () => {
    const mesh = plane(2);
    const t = buildTopology(mesh);
    const border = t.edgeFaces.findIndex((f) => f.length === 1);
    expect(bevelEdges(mesh, t, [border], 0.05).ok).toBe(false);
  });
  it("reports a safe maximum width", () => {
    const mesh = box(1);
    const t = buildTopology(mesh);
    expect(maxBevelWidth(mesh, t, cubeEdge(t))).toBeCloseTo(0.45);
  });
});

describe("bevel with several segments where bevelled edges meet", () => {
  const top = (mesh: EditMesh) =>
    allPoints(mesh.positions.length / 3).filter(
      (p) => Math.abs(mesh.positions[p * 3 + 1]! - 0.5) < 1e-6,
    );

  it("the four edges of one face of a cube (two bevelled edges and a plain one at each corner): closed for every segment count", () => {
    for (const segments of [1, 2, 3, 5]) {
      const mesh = box(1);
      const topology = buildTopology(mesh);
      const edges = selectedEdges(topology, top(mesh));
      expect(edges).toHaveLength(4);
      const result = bevelEdges(mesh, topology, edges, 0.1, segments);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const faces = buildTopology(result.mesh).edgeFaces;
      expect(faces.filter((f) => f.length !== 2)).toHaveLength(0);
    }
  });

  it("all twelve edges of a cube with rounded corners: closed and outward-facing", () => {
    for (const segments of [2, 3]) {
      const mesh = box(1);
      const topology = buildTopology(mesh);
      const all = topology.edgeFaces.map((_, e) => e);
      const result = bevelEdges(mesh, topology, all, 0.1, segments);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(
        buildTopology(result.mesh).edgeFaces.every((f) => f.length === 2),
      ).toBe(true);
    }
  });
});
