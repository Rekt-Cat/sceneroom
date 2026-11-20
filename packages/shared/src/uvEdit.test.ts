import { describe, expect, it } from "vitest";
import type { EditMesh } from "./meshEdit";
import { packUvIslands, transformUvIslands, uvIslandAt } from "./uvEdit";
import { uvIslands } from "./unwrap";

/** Two separate unit squares on the surface (4 points, 2 triangles each) with their own corners of the map. */
function twoSquares(): EditMesh {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 6, 1, 0, 5, 1, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  // Square A in the lower left quarter, square B in the upper right quarter
  const uvs = new Float32Array([
    0, 0, 0.25, 0, 0.25, 0.25, 0, 0.25, 0.5, 0.5, 1, 0.5, 1, 1, 0.5, 1,
  ]);
  return { positions, indices, uvs } as EditMesh;
}

describe("uvIslandAt", () => {
  it("finds the island under a spot, and -1 on empty space", () => {
    const mesh = twoSquares();
    const a = uvIslandAt(mesh, 0.1, 0.1);
    const b = uvIslandAt(mesh, 0.7, 0.7);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(a).not.toBe(b);
    expect(uvIslandAt(mesh, 0.4, 0.4)).toBe(-1);
  });
  it("returns -1 for a mesh without a map", () => {
    const mesh = { ...twoSquares(), uvs: undefined } as EditMesh;
    expect(uvIslandAt(mesh, 0.1, 0.1)).toBe(-1);
  });
});

describe("transformUvIslands", () => {
  it("moves only the chosen island", () => {
    const mesh = twoSquares();
    const a = uvIslandAt(mesh, 0.1, 0.1);
    const out = transformUvIslands(mesh, new Set([a]), { move: [0.1, 0.2] });
    expect(out.uvs![0]).toBeCloseTo(0.1);
    expect(out.uvs![1]).toBeCloseTo(0.2);
    expect(out.uvs![8]).toBeCloseTo(0.5); // the other island did not move
    expect(out.positions).toBe(mesh.positions);
    expect(mesh.uvs![0]).toBe(0); // the original is untouched
  });
  it("scales round the middle of the island", () => {
    const mesh = twoSquares();
    const a = uvIslandAt(mesh, 0.1, 0.1);
    const out = transformUvIslands(mesh, new Set([a]), { scale: 2 });
    // The square 0..0.25 around its centre 0.125 becomes -0.125..0.375
    expect(out.uvs![0]).toBeCloseTo(-0.125);
    expect(out.uvs![4]).toBeCloseTo(0.375);
  });
  it("rotates a quarter turn and keeps the shape", () => {
    const mesh = twoSquares();
    const a = uvIslandAt(mesh, 0.1, 0.1);
    const out = transformUvIslands(mesh, new Set([a]), {
      rotate: Math.PI / 2,
    });
    // Point (0,0) is (-0.125,-0.125) from the centre; a quarter turn counter-clockwise gives (0.125,-0.125)
    expect(out.uvs![0]).toBeCloseTo(0.25);
    expect(out.uvs![1]).toBeCloseTo(0);
  });
  it("mirrors left to right", () => {
    const mesh = twoSquares();
    const a = uvIslandAt(mesh, 0.1, 0.1);
    const out = transformUvIslands(mesh, new Set([a]), { flipU: true });
    expect(out.uvs![0]).toBeCloseTo(0.25);
    expect(out.uvs![2]).toBeCloseTo(0);
  });
  it("ignores a scale of 0 or less, and does nothing without a choice or a map", () => {
    const mesh = twoSquares();
    expect(transformUvIslands(mesh, new Set([0]), { scale: 0 }).uvs).toEqual(
      mesh.uvs,
    );
    expect(transformUvIslands(mesh, new Set(), { move: [1, 1] })).toBe(mesh);
    const bare = { ...mesh, uvs: undefined } as EditMesh;
    expect(transformUvIslands(bare, new Set([0]), { move: [1, 1] })).toBe(bare);
  });
});

describe("packUvIslands", () => {
  it("fits every island inside the square without overlap, keeping the shapes", () => {
    const mesh = twoSquares();
    const out = packUvIslands(mesh, 0.02)!;
    expect(out).not.toBeNull();
    for (const value of out.uvs!) {
      expect(value).toBeGreaterThanOrEqual(0.02 - 1e-6);
      expect(value).toBeLessThanOrEqual(0.98 + 1e-6);
    }
    expect(uvIslands(out).count).toBe(2);
    // Both squares were the same size once (0.25 and 0.5): the ratio between them stays
    const widthA = out.uvs![2]! - out.uvs![0]!;
    const widthB = out.uvs![10]! - out.uvs![8]!;
    expect(widthB / widthA).toBeCloseTo(2);
  });
  it("returns null without a map", () => {
    expect(
      packUvIslands({ ...twoSquares(), uvs: undefined } as EditMesh),
    ).toBeNull();
  });
});
