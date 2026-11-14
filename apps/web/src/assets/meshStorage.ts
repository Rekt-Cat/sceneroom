import {
  decodeMeshData,
  encodeMeshData,
  type ShapeMesh,
} from "@sceneroom/shared";
import { assetStorage } from "./assetStorage";
import { sha256Hex } from "./hash";

/**
 * Meshes already read, by id. A stored mesh never changes (an edit makes a new one under a new id), so
 * it is read once and kept for the visit. A failure is not remembered, so trying again can work.
 */
const loaded = new Map<string, Promise<ShapeMesh>>();

/** The meshes already read, ready to use at once (the same data as `loaded`, without waiting for a promise). */
const ready = new Map<string, ShapeMesh>();

/**
 * A mesh that is already in memory, or undefined. Lets a mesh that was just stored (an edit, Undo, Redo)
 * be shown in the very same frame, with no moment where it is missing.
 */
export function peekMeshData(assetId: string): ShapeMesh | undefined {
  return ready.get(assetId);
}

/**
 * Stores a mesh and gives back its id (the fingerprint of its stored bytes) and how many bytes it takes.
 * The same mesh stored twice is the same id. Throws a plain message for a mesh that is not valid or too big.
 */
export async function storeMesh(
  mesh: ShapeMesh,
): Promise<{ id: string; bytes: number }> {
  const data = encodeMeshData(mesh);
  const buffer = data.buffer as ArrayBuffer;
  const id = await sha256Hex(buffer);
  await assetStorage.put(id, buffer);
  // The mesh is already in memory: no need to read it back when it is first shown
  loaded.set(id, Promise.resolve(mesh));
  ready.set(id, mesh);
  return { id, bytes: data.length };
}

/** The mesh stored under an id. Rejects with a clear message if its data is missing or damaged. */
export function loadMeshData(assetId: string): Promise<ShapeMesh> {
  const cached = loaded.get(assetId);
  if (cached) return cached;
  const promise = (async () => {
    const bytes = await assetStorage.get(assetId);
    if (!bytes) {
      throw new Error(
        "The data of this mesh is missing, so it cannot be shown.",
      );
    }
    const result = decodeMeshData(new Uint8Array(bytes));
    if (!result.ok) throw new Error(result.reason);
    ready.set(assetId, result.mesh);
    return result.mesh;
  })();
  loaded.set(assetId, promise);
  promise.catch(() => loaded.delete(assetId));
  return promise;
}

/** Forgets every mesh read so far (used by tests, to prove that data really comes back from storage). */
export function clearMeshCache(): void {
  loaded.clear();
  ready.clear();
}
