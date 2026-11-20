import { beforeEach, describe, expect, it } from "vitest";
import {
  encodeMeshData,
  isMeshPatchBytes,
  type ShapeMesh,
} from "@sceneroom/shared";
import {
  MemoryAssetStorage,
  assetStorage,
  setAssetStorage,
} from "./assetStorage";
import { sha256Hex } from "./hash";
import {
  MAX_PATCH_DEPTH,
  PATCH_MIN_POINTS,
  bytesForFile,
  clearMeshCache,
  loadMeshData,
  peekMeshData,
  storeMesh,
} from "./meshStorage";

/** A mesh of `points` points on a line, with one triangle (enough for storing). */
function bigMesh(points = PATCH_MIN_POINTS + 10): ShapeMesh {
  const positions = new Float32Array(points * 3);
  for (let i = 0; i < points; i++) positions.set([i, i % 7, i % 13], i * 3);
  return { positions, indices: Uint32Array.from([0, 1, 2]) };
}

function moved(mesh: ShapeMesh, point: number, by: number): ShapeMesh {
  const positions = new Float32Array(mesh.positions);
  positions[point * 3] += by;
  return { ...mesh, positions };
}

const stored = async (id: string) =>
  new Uint8Array((await assetStorage.get(id))!);

beforeEach(() => {
  setAssetStorage(new MemoryAssetStorage());
  clearMeshCache();
});

describe("storing a big mesh as a change of the one before", () => {
  it("keeps only the moved points, under the id of the whole mesh, and reads back the same mesh", async () => {
    const first = bigMesh();
    const a = await storeMesh(first);
    const second = moved(first, 5, 1);
    const b = await storeMesh(second, a.id);
    expect(b.id).not.toBe(a.id);
    const blob = await stored(b.id);
    expect(isMeshPatchBytes(blob)).toBe(true);
    expect(blob.length).toBeLessThan(200); // a whole mesh would be about 240 000 bytes
    // Same id as storing the whole mesh: files that hold whole meshes still match it
    expect(b.id).toBe(
      await sha256Hex(encodeMeshData(second).buffer as ArrayBuffer),
    );
    expect(b.bytes).toBe(encodeMeshData(second).length);
    clearMeshCache();
    const back = await loadMeshData(b.id);
    expect(Array.from(back.positions)).toEqual(Array.from(second.positions));
  });
  it("gives back the same id when nothing moved", async () => {
    const first = bigMesh();
    const a = await storeMesh(first);
    const again = await storeMesh(
      { ...first, positions: new Float32Array(first.positions) },
      a.id,
    );
    expect(again.id).toBe(a.id);
  });
  it("keeps a whole mesh for small meshes and for changed triangles", async () => {
    const small = {
      positions: new Float32Array(9),
      indices: Uint32Array.from([0, 1, 2]),
    };
    const s1 = await storeMesh(small);
    const s2 = await storeMesh(moved(small, 1, 1), s1.id);
    expect(isMeshPatchBytes(await stored(s2.id))).toBe(false);
    const big = bigMesh();
    const a = await storeMesh(big);
    const other = await storeMesh(
      { ...big, indices: Uint32Array.from([0, 2, 1]) },
      a.id,
    );
    expect(isMeshPatchBytes(await stored(other.id))).toBe(false);
  });
  it("stores a whole mesh again after a long chain, and every step still reads back", async () => {
    let mesh = bigMesh();
    let { id } = await storeMesh(mesh);
    const steps: { id: string; mesh: ShapeMesh }[] = [{ id, mesh }];
    let wholeAgain = 0;
    for (let i = 1; i <= MAX_PATCH_DEPTH + 4; i++) {
      mesh = moved(mesh, i, 0.5);
      id = (await storeMesh(mesh, id)).id;
      steps.push({ id, mesh });
      if (!isMeshPatchBytes(await stored(id))) wholeAgain++;
    }
    expect(wholeAgain).toBeGreaterThanOrEqual(1);
    clearMeshCache();
    for (const step of steps) {
      const back = await loadMeshData(step.id);
      expect(Array.from(back.positions.subarray(0, 120))).toEqual(
        Array.from(step.mesh.positions.subarray(0, 120)),
      );
    }
  });
  it("survives going back to an earlier shape (a patch whose result is already stored)", async () => {
    const first = bigMesh();
    const a = await storeMesh(first);
    const b = await storeMesh(moved(first, 3, 1), a.id);
    // Moving the point back gives exactly the first mesh again: its stored whole mesh must not be overwritten
    const c = await storeMesh(first, b.id);
    expect(c.id).toBe(a.id);
    expect(isMeshPatchBytes(await stored(a.id))).toBe(false);
    clearMeshCache();
    expect((await loadMeshData(b.id)).positions[9]).toBe(
      first.positions[9]! + 1,
    );
  });
});

describe("saving into a file", () => {
  it("writes a patch out as the whole mesh, matching its id", async () => {
    const first = bigMesh();
    const a = await storeMesh(first);
    const second = moved(first, 7, 2);
    const b = await storeMesh(second, a.id);
    const out = await bytesForFile(b.id, await stored(b.id));
    expect(isMeshPatchBytes(out)).toBe(false);
    expect(await sha256Hex(out.buffer as ArrayBuffer)).toBe(b.id);
  });
  it("leaves other bytes alone", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await bytesForFile("x", bytes)).toBe(bytes);
  });
});

describe("the memory cache for big meshes", () => {
  it("forgets the least recently used big meshes beyond the budget and reads them again from storage", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const mesh = bigMesh(800_000);
      mesh.positions[0] = i; // a different mesh each time
      ids.push((await storeMesh(mesh)).id);
    }
    expect(peekMeshData(ids[0]!)).toBeUndefined();
    expect(peekMeshData(ids[3]!)).toBeDefined();
    expect((await loadMeshData(ids[0]!)).positions[0]).toBe(0);
  }, 60_000);
});
