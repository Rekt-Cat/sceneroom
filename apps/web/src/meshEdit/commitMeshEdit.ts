import { meshAssetInfo } from "@sceneroom/shared";
import { loadMeshData, storeMesh } from "@/assets/meshStorage";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

/**
 * Stores the edited points of a mesh as a NEW version and makes the object use it (one undo step). The
 * triangles stay as they were, only the points moved. The mesh keeps its name and notes. Says in the bar
 * over the 3D view if it could not be done.
 */
export async function commitMeshPositions(
  nodeId: string,
  positions: Float32Array,
  label: string,
): Promise<boolean> {
  const { scene } = useSceneStore.getState();
  const node = scene.nodes[nodeId];
  const old = node?.assetId ? scene.assets[node.assetId] : undefined;
  if (!node || node.kind !== "mesh" || !node.assetId || !old) return false;
  try {
    const before = await loadMeshData(node.assetId);
    const mesh = { positions, indices: before.indices };
    const stored = await storeMesh(mesh);
    // Nothing changed (the same points were stored again): no undo step
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
      text: "Could not store the change to the mesh. Please try again.",
    });
    return false;
  }
}
