import {
  applyMeshPatch,
  decodeMeshData,
  decodeMeshPatch,
  diffMeshes,
  encodeMeshData,
  encodeMeshPatch,
  isMeshPatchBytes,
  type ShapeMesh,
} from "@sceneroom/shared";
import { assetStorage } from "./assetStorage";
import { sha256Hex } from "./hash";

/** A mesh with at least this many points is stored as a change of the one before it when an edit only moved points. */
export const PATCH_MIN_POINTS = 20_000;
/** After this many changes in a row a whole mesh is stored again, so reading an old step never replays a long chain. */
export const MAX_PATCH_DEPTH = 16;
/** How many points of big meshes are kept in memory at once; the least recently used are forgotten and read again if needed. */
export const CACHED_BIG_POINTS = 3_000_000;

/**
 * Meshes already read, by id. A stored mesh never changes (an edit makes a new one under a new id), so
 * it is read once and kept for the visit (big ones only while they fit `CACHED_BIG_POINTS`). A failure is not
 * remembered, so trying again can work.
 */
const loaded = new Map<string, Promise<ShapeMesh>>();

/** The meshes already read, ready to use at once (the same data as `loaded`, without waiting for a promise). */
const ready = new Map<string, ShapeMesh>();

/** How many changes lie between a stored mesh and a whole one (0 for a whole mesh). Small numbers, never forgotten. */
const depths = new Map<string, number>();

const pointsOf = (mesh: ShapeMesh) => mesh.positions.length / 3;

/** Remembers a mesh in memory as the most recently used, and forgets the oldest big ones if too many points are kept. */
function remember(id: string, mesh: ShapeMesh): void {
  loaded.delete(id);
  ready.delete(id);
  loaded.set(id, Promise.resolve(mesh));
  ready.set(id, mesh);
  let kept = 0;
  for (const m of ready.values()) {
    if (pointsOf(m) >= PATCH_MIN_POINTS) kept += pointsOf(m);
  }
  for (const [other, m] of ready) {
    if (kept <= CACHED_BIG_POINTS) break;
    if (other === id || pointsOf(m) < PATCH_MIN_POINTS) continue;
    ready.delete(other);
    loaded.delete(other);
    kept -= pointsOf(m);
  }
}

/**
 * A mesh that is already in memory, or undefined. Lets a mesh that was just stored (an edit, Undo, Redo)
 * be shown in the very same frame, with no moment where it is missing.
 */
export function peekMeshData(assetId: string): ShapeMesh | undefined {
  return ready.get(assetId);
}

/**
 * Stores a mesh and gives back its id (the fingerprint of its stored bytes) and how many bytes the whole mesh takes.
 * The same mesh stored twice is the same id. Throws a plain message for a mesh that is not valid or too big.
 *
 * With `baseId` (the mesh this one was made from) a big mesh whose edit only moved some points is stored as just
 * those points (a "patch" on the base), which is what keeps Undo cheap while sculpting. The id then stands for the
 * patch; `loadMeshData` rebuilds the whole mesh. An edit that moved nothing gives back `baseId` itself.
 */
export async function storeMesh(
  mesh: ShapeMesh,
  baseId?: string,
): Promise<{ id: string; bytes: number }> {
  if (baseId && pointsOf(mesh) >= PATCH_MIN_POINTS) {
    const stored = await storeAsPatch(mesh, baseId);
    if (stored) return stored;
  }
  const data = encodeMeshData(mesh);
  const buffer = data.buffer as ArrayBuffer;
  const id = await sha256Hex(buffer);
  await assetStorage.put(id, buffer);
  depths.set(id, 0);
  // The mesh is already in memory: no need to read it back when it is first shown
  remember(id, mesh);
  return { id, bytes: data.length };
}

/** The patch way of `storeMesh`, or null when the edit does not qualify (so a whole mesh is stored). */
async function storeAsPatch(
  mesh: ShapeMesh,
  baseId: string,
): Promise<{ id: string; bytes: number } | null> {
  const depth = depths.get(baseId) ?? 0;
  if (depth >= MAX_PATCH_DEPTH) return null;
  let base: ShapeMesh;
  try {
    base = await loadMeshData(baseId);
  } catch (error) {
    console.warn("Storing a whole mesh: the base could not be read:", error);
    return null;
  }
  const patch = diffMeshes(base, mesh, baseId, depth);
  if (!patch) return null;
  // The id is the fingerprint of the WHOLE mesh (as for a whole stored mesh), so a saved file, which holds whole
  // meshes, still matches it. Only the bytes kept in storage are the patch.
  const whole = encodeMeshData(mesh);
  const id = await sha256Hex(whole.buffer as ArrayBuffer);
  // Nothing moved, or this exact mesh is stored already (for example after Undo and a new edit): keep what is there
  if (id === baseId || (await assetStorage.has(id))) {
    remember(id, mesh);
    return { id, bytes: whole.length };
  }
  if (patch.changed.length === 0) return { id: baseId, bytes: whole.length };
  const data = encodeMeshPatch(patch);
  await assetStorage.put(id, data.buffer as ArrayBuffer);
  depths.set(id, patch.depth);
  remember(id, mesh);
  return { id, bytes: whole.length };
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
    const mesh = await meshFromBytes(assetId, new Uint8Array(bytes));
    remember(assetId, mesh);
    return mesh;
  })();
  loaded.set(assetId, promise);
  promise.catch(() => loaded.delete(assetId));
  return promise;
}

/** Reads the bytes of a stored mesh: a whole mesh, or a patch on another stored mesh (read first). */
async function meshFromBytes(
  assetId: string,
  bytes: Uint8Array,
): Promise<ShapeMesh> {
  if (isMeshPatchBytes(bytes)) {
    const patch = decodeMeshPatch(bytes);
    if (!patch.ok) throw new Error(patch.reason);
    const base = await loadMeshData(patch.patch.baseId);
    depths.set(assetId, patch.patch.depth);
    return applyMeshPatch(base, patch.patch);
  }
  const result = decodeMeshData(bytes);
  if (!result.ok) throw new Error(result.reason);
  depths.set(assetId, 0);
  return result.mesh;
}

/**
 * The bytes of a stored file to put into a saved project file: a patch is written out as the whole mesh (under the same
 * id), because the file does not carry the meshes it was made from. Anything else is returned as it is.
 */
export async function bytesForFile(
  assetId: string,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  if (!isMeshPatchBytes(bytes)) return bytes;
  return encodeMeshData(await loadMeshData(assetId));
}

/** Forgets every mesh read so far (used by tests, to prove that data really comes back from storage). */
export function clearMeshCache(): void {
  loaded.clear();
  ready.clear();
}
