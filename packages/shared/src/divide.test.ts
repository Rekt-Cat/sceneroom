import { describe, expect, it } from "vitest";
import {
  MAX_DIVIDE_CUTS,
  allPoints,
  buildTopology,
  divideFaces,
  sanitizeDivideCuts,
  weldClosePoints,
  weldGroups,
  type EditMesh,
  type EditResult,
} from "./index";
import { box, plane } from "./testMeshes";

const triangles = (m: EditMesh) => m.indices.length / 3;
const points = (m: EditMesh) => m.positions.length / 3;

function ok(result: EditResult) {
  if (!result.ok) throw new Error(result.reason);
  return result;
}

/** Every directed edge (by spot) is used once and has its opposite: closed, and all faces wound the same way round. */
function closedAndConsistent(mesh: EditMesh): boolean {
  const ids = weldGroups(mesh.positions).ids;
  const seen = new Map<string, number>();
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const key = `${ids[mesh.indices[t + k]!]!}>${ids[mesh.indices[t + ((k + 1) % 3)]!]!}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  for (const [key, n] of seen) {
    const [a, b] = key.split(">");
    if (n !== 1 || seen.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** The sign of the up-down part of every triangle's normal (all the same on a flat plane facing one way). */
function upSigns(mesh: EditMesh): Set<number> {
  const signs = new Set<number>();
  const p = mesh.positions;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t]! * 3;
    const b = mesh.indices[t + 1]! * 3;
    const c = mesh.indices[t + 2]! * 3;
    const ux = p[b]! - p[a]!;
    const uz = p[b + 2]! - p[a + 2]!;
    const vx = p[c]! - p[a]!;
    const vz = p[c + 2]! - p[a + 2]!;
    signs.add(Math.sign(uz * vx - ux * vz));
  }
  return signs;
}

describe("divide faces", () => {
  it("one cut splits a square into 4 (8 triangles), all facing the same way, with a point in the middle", () => {
    const mesh = plane(1);
    const result = ok(divideFaces(mesh, [], 1));
    expect(triangles(result.mesh)).toBe(8);
    expect(points(result.mesh)).toBe(9);
    expect(upSigns(result.mesh)).toEqual(upSigns(mesh));
    const middle = Array.from(
      { length: points(result.mesh) },
      (_, p) => p,
    ).find(
      (p) =>
        Math.abs(result.mesh.positions[p * 3]! - 0.5) < 1e-6 &&
        Math.abs(result.mesh.positions[p * 3 + 2]! - 0.5) < 1e-6,
    );
    expect(middle).toBeDefined();
    // the grid is whole: 12 edges, 4 squares
    const topology = buildTopology(result.mesh);
    expect(topology.edgeFaces.length).toBe(12);
    expect(topology.faces.length).toBe(4);
  });

  it("two cuts make 9 squares", () => {
    const result = ok(divideFaces(plane(1), [], 2));
    expect(triangles(result.mesh)).toBe(18);
    expect(buildTopology(result.mesh).faces.length).toBe(9);
  });

  it("a cube stays closed and consistently wound; each side becomes 4", () => {
    const result = ok(divideFaces(box(1), [], 1));
    expect(triangles(result.mesh)).toBe(48);
    expect(closedAndConsistent(result.mesh)).toBe(true);
    expect(
      buildTopology(result.mesh).edgeFaces.every((f) => f.length === 2),
    ).toBe(true);
  });

  it("a triangle is cut into 4 triangles", () => {
    const mesh: EditMesh = {
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 0, 1]),
      indices: Uint32Array.from([0, 2, 1]),
    };
    const result = ok(divideFaces(mesh, [], 1));
    expect(triangles(result.mesh)).toBe(4);
    expect(upSigns(result.mesh)).toEqual(upSigns(mesh));
    expect(triangles(ok(divideFaces(mesh, [], 2)).mesh)).toBe(9);
  });

  it("only the selected faces are divided", () => {
    const mesh = plane(2);
    // the four points of the cell at the origin
    const cell = allPoints(points(mesh)).filter(
      (p) =>
        mesh.positions[p * 3]! <= 0.5 + 1e-6 &&
        mesh.positions[p * 3 + 2]! <= 0.5 + 1e-6,
    );
    const result = ok(divideFaces(mesh, cell, 1));
    // the cell gives 8 triangles for its 2 (+6) and each of its two neighbours becomes a fan through the new edge point (+3 each)
    expect(triangles(result.mesh)).toBe(triangles(mesh) + 6 + 3 + 3);
  });

  it("neighbouring selected faces share the points on their common edge (no doubled points)", () => {
    const result = ok(divideFaces(plane(2), [], 1));
    // a 5 by 5 grid of spots, none doubled
    expect(new Set(weldGroups(result.mesh.positions).ids).size).toBe(25);
    expect(points(result.mesh)).toBe(25);
  });

  it("carries a crease to the pieces of the divided edge", () => {
    const mesh: EditMesh = { ...plane(1), creases: [{ a: 0, b: 1, value: 1 }] };
    const result = ok(divideFaces(mesh, [], 1));
    // the original crease and two pieces
    expect(result.mesh.creases?.length).toBe(3);
  });

  it("selects the divided faces' points; says what it needs; limits the result", () => {
    const result = ok(divideFaces(plane(1), [], 1));
    expect(result.selected.length).toBe(9);
    expect(divideFaces(plane(2), [0], 1).ok).toBe(false);
    expect(divideFaces(plane(100), [], MAX_DIVIDE_CUTS).ok).toBe(false);
  });

  it("keeps the cuts a whole number from 1 to the most", () => {
    expect(sanitizeDivideCuts(0)).toBe(1);
    expect(sanitizeDivideCuts(2.6)).toBe(3);
    expect(sanitizeDivideCuts(99)).toBe(MAX_DIVIDE_CUTS);
    expect(sanitizeDivideCuts(NaN)).toBe(1);
  });
});

describe("dividing only one face keeps the surface closed", () => {
  const frontOf = (mesh: EditMesh) =>
    allPoints(mesh.positions.length / 3).filter(
      (p) => mesh.positions[p * 3 + 2]! > 0.49,
    );

  it("a cube with separate points per side: no open edge, nothing crowded, all faces wound the same way", () => {
    const mesh = box(1);
    for (const cuts of [1, 4]) {
      const result = divideFaces(mesh, frontOf(mesh), cuts);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      const faces = buildTopology(result.mesh).edgeFaces;
      expect(faces.filter((f) => f.length === 1)).toHaveLength(0);
      expect(faces.filter((f) => f.length > 2)).toHaveLength(0);
      expect(closedAndConsistent(result.mesh)).toBe(true);
    }
  });

  it("a cube whose sides share their points stays closed and keeps sharing them", () => {
    const welded = weldClosePoints(box(1), allPoints(24), 1e-4);
    expect(welded.ok).toBe(true);
    if (!welded.ok) return;
    const mesh = welded.mesh;
    const result = divideFaces(mesh, frontOf(mesh), 3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      buildTopology(result.mesh).edgeFaces.every((f) => f.length === 2),
    ).toBe(true);
    expect(closedAndConsistent(result.mesh)).toBe(true);
    // no point is doubled: the new points on the shared edges are shared by the two faces
    expect(new Set(weldGroups(result.mesh.positions).ids).size).toBe(
      result.mesh.positions.length / 3 - 0,
    );
  });

  it("a face with two divided neighbours on opposite sides is also closed", () => {
    const mesh = box(1);
    // the top strip: the top and the two faces on its sides stay whole, the front and back are divided
    const frontBack = allPoints(24).filter(
      (p) => Math.abs(mesh.positions[p * 3 + 2]!) > 0.49,
    );
    const result = divideFaces(mesh, frontBack, 2);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(
        buildTopology(result.mesh).edgeFaces.every((f) => f.length === 2),
      ).toBe(true);
  });
});
