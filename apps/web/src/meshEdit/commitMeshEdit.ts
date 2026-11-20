import { meshAssetInfo, type ShapeMesh } from "@sceneroom/shared";
import { loadMeshData, storeMesh } from "@/assets/meshStorage";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

/**
 * Stores an edited mesh (new points and, for operations like extrude and delete, new triangles) as a NEW
 * version and makes the object use it, as one undo step. The mesh keeps its name and notes. Says in the
 * bar over the 3D view if it could not be done. Returns whether it worked.
 */
export async function commitMesh(
  nodeId: string,
  mesh: ShapeMesh,
  label: string,
  /** True: no new undo step, the mesh takes the place of the one the last step made. */
  amend = false,
): Promise<boolean> {
  const { scene } = useSceneStore.getState();
  const node = scene.nodes[nodeId];
  const old = node?.assetId ? scene.assets[node.assetId] : undefined;
  if (!node || node.kind !== "mesh" || !node.assetId || !old) return false;
  try {
    await sayIfUvsRemoved(node.name, node.assetId, mesh, label);
    // A big mesh whose points only moved is stored as a patch on the mesh it came from
    const stored = await storeMesh(mesh, node.assetId);
    // Nothing changed (the same mesh was stored again): no undo step
    if (stored.id === node.assetId) return true;
    const info = meshAssetInfo(
      stored.id,
      old.name,
      mesh,
      stored.bytes,
      old.note,
    );
    useSceneStore.getState().replaceNodeMesh(nodeId, info, label, amend);
    return true;
  } catch (error) {
    console.error("Storing the edited mesh failed:", error);
    useImportStore.getState().setMessage({
      tone: "error",
      text:
        error instanceof Error && error.message.startsWith("Cannot store")
          ? `Could not store the change: ${error.message.replace("Cannot store this mesh: ", "")}`
          : "Could not store the change to the mesh. Please try again.",
    });
    return false;
  }
}

/**
 * Tools that do not know about UVs leave them out of the mesh they make. Wrong UVs are worse than none, so the
 * map is dropped, and the person is told (once: the next version has no UVs to lose).
 */
async function sayIfUvsRemoved(
  name: string,
  oldAssetId: string,
  mesh: ShapeMesh,
  label: string,
): Promise<void> {
  if (mesh.uvs) return;
  let had = false;
  try {
    had = (await loadMeshData(oldAssetId)).uvs !== undefined;
  } catch {
    return; // the old mesh cannot be read; storing the new one goes on and reports its own problems
  }
  if (!had) return;
  useImportStore.getState().setMessage({
    tone: "info",
    text: `${label} removed the UV map of "${name}" (this tool does not keep UVs yet). Unwrap again when you need one.`,
  });
}

/** Stores edited points of a mesh whose triangles did not change. */
export async function commitMeshPositions(
  nodeId: string,
  positions: Float32Array,
  label: string,
): Promise<boolean> {
  const node = useSceneStore.getState().scene.nodes[nodeId];
  if (!node?.assetId) return false;
  try {
    const before = await loadMeshData(node.assetId);
    // The points moved, the triangles and the creases did not
    return commitMesh(
      nodeId,
      {
        positions,
        indices: before.indices,
        creases: before.creases,
        ...(before.seams ? { seams: before.seams } : {}),
        // The points moved, the map did not
        ...(before.uvs ? { uvs: before.uvs } : {}),
      },
      label,
    );
  } catch (error) {
    console.error("Reading the mesh failed:", error);
    useImportStore.getState().setMessage({
      tone: "error",
      text: "Could not store the change to the mesh. Please try again.",
    });
    return false;
  }
}
