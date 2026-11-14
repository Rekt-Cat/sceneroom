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
): Promise<boolean> {
  const { scene } = useSceneStore.getState();
  const node = scene.nodes[nodeId];
  const old = node?.assetId ? scene.assets[node.assetId] : undefined;
  if (!node || node.kind !== "mesh" || !node.assetId || !old) return false;
  try {
    const stored = await storeMesh(mesh);
    // Nothing changed (the same mesh was stored again): no undo step
    if (stored.id === node.assetId) return true;
    const info = meshAssetInfo(
      stored.id,
      old.name,
      mesh,
      stored.bytes,
      old.note,
    );
    useSceneStore.getState().replaceNodeMesh(nodeId, info, label);
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
    return commitMesh(nodeId, { positions, indices: before.indices }, label);
  } catch (error) {
    console.error("Reading the mesh failed:", error);
    useImportStore.getState().setMessage({
      tone: "error",
      text: "Could not store the change to the mesh. Please try again.",
    });
    return false;
  }
}
