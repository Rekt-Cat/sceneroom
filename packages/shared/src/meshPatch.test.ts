import { describe, expect, it } from "vitest";
import {
  applyMeshPatch,
  decodeMeshPatch,
  diffMeshes,
  encodeMeshPatch,
  isMeshPatchBytes,
} from "./meshPatch";
import type { ShapeMesh } from "./modifiers";

function grid(n: number): ShapeMesh {
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) positions.set([i, i * 2, i * 3], i * 3);
  return { positions, indices: Uint32Array.from([0, 1, 2]) };
}

describe("diffMeshes and applyMeshPatch", () => {
  it("keeps only the points that moved, and applying it gives the new mesh back", () => {
    const base = grid(10);
    const next: ShapeMesh = {
      ...base,
      positions: new Float32Array(base.positions),
    };
    next.positions[3 * 4] = 99; // point 4 moved in x
    next.positions[3 * 7 + 2] = -5; // point 7 moved in z
    const patch = diffMeshes(base, next, "base", 0)!;
    expect(Array.from(patch.changed)).toEqual([4, 7]);
    expect(patch.depth).toBe(1);
    const rebuilt = applyMeshPatch(base, patch);
    expect(Array.from(rebuilt.positions)).toEqual(Array.from(next.positions));
    expect(rebuilt.indices).toBe(base.indices); // shared, not copied
    expect(base.positions[3 * 4]).toBe(4); // the base is untouched
  });
  it("is null when the triangles, map, creases or seams differ, or the point count", () => {
    const base = grid(10);
    const same = { ...base, positions: new Float32Array(base.positions) };
    expect(
      diffMeshes(
        base,
        { ...same, indices: Uint32Array.from([0, 1, 3]) },
        "b",
        0,
      ),
    ).toBeNull();
    expect(
      diffMeshes(base, { ...same, uvs: new Float32Array(20) }, "b", 0),
    ).toBeNull();
    expect(
      diffMeshes(
        base,
        { ...same, creases: [{ a: 0, b: 1, sharpness: 1 }] as never },
        "b",
        0,
      ),
    ).toBeNull();
    expect(
      diffMeshes(base, { ...same, seams: [{ a: 0, b: 1 }] }, "b", 0),
    ).toBeNull();
    expect(diffMeshes(base, grid(11), "b", 0)).toBeNull();
  });
  it("is null when too many points moved (a whole mesh is smaller)", () => {
    const base = grid(10);
    const next = { ...base, positions: base.positions.map((v) => v + 1) };
    expect(diffMeshes(base, next, "b", 0)).toBeNull();
  });
  it("is an empty patch when nothing moved", () => {
    const base = grid(10);
    const patch = diffMeshes(
      base,
      { ...base, positions: new Float32Array(base.positions) },
      "b",
      2,
    )!;
    expect(patch.changed.length).toBe(0);
    expect(patch.depth).toBe(3);
  });
});

describe("encodeMeshPatch and decodeMeshPatch", () => {
  const patch = {
    baseId: "a".repeat(64),
    depth: 3,
    pointCount: 100,
    changed: Uint32Array.from([2, 9, 50]),
    positions: Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]),
  };
  it("round trips", () => {
    const bytes = encodeMeshPatch(patch);
    expect(isMeshPatchBytes(bytes)).toBe(true);
    const out = decodeMeshPatch(bytes);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.patch).toEqual(patch);
  });
  it("does not mistake a whole mesh for a patch", () => {
    expect(
      isMeshPatchBytes(Uint8Array.from("SRMH....", (c) => c.charCodeAt(0))),
    ).toBe(false);
  });
  it("rejects damaged bytes", () => {
    const bytes = encodeMeshPatch(patch);
    expect(decodeMeshPatch(bytes.subarray(0, bytes.length - 1)).ok).toBe(false);
    expect(decodeMeshPatch(new Uint8Array(4)).ok).toBe(false);
    // A point number outside the mesh
    const bad = new Uint8Array(bytes);
    new DataView(bad.buffer).setUint32(24 + 64, 1000, true);
    expect(decodeMeshPatch(bad).ok).toBe(false);
    // A number that is not finite
    const nan = new Uint8Array(bytes);
    new DataView(nan.buffer).setFloat32(nan.length - 4, NaN, true);
    expect(decodeMeshPatch(nan).ok).toBe(false);
  });
  it("rejects point numbers that do not rise", () => {
    const out = encodeMeshPatch({
      ...patch,
      changed: Uint32Array.from([9, 2, 50]),
    });
    expect(decodeMeshPatch(out).ok).toBe(false);
  });
});
