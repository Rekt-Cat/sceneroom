import {
  appendNoteLine,
  meshAssetInfo,
  summariseModifiers,
  supportsModifiers,
  type PrimitiveKind,
  type SceneNode,
} from "@sceneroom/shared";
import { loadMeshData, storeMesh } from "@/assets/meshStorage";
import {
  buildMeshGeometry,
  buildShapeGeometry,
  geometryToMesh,
} from "@/components/viewport/shapeGeometry";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

/** The geometry the object looks like right now (its shape, or its mesh, with the modifiers applied). */
async function currentGeometry(node: SceneNode) {
  if (node.kind === "mesh") {
    if (!node.assetId) throw new Error("This mesh has no data.");
    return buildMeshGeometry(await loadMeshData(node.assetId), node.modifiers);
  }
  return buildShapeGeometry(
    node.kind as PrimitiveKind,
    node.segments,
    node.modifiers,
  );
}

/**
 * The notes written into a new mesh: where it came from and which modifiers were baked into it, below
 * the notes of the mesh it was made from (if it already was one).
 */
function bakeNote(node: SceneNode, previousNotes: string): string {
  const source =
    node.kind === "mesh"
      ? ""
      : `Made from a ${node.kind}${node.segments > 1 ? ` (${node.segments} segments)` : ""}`;
  return appendNoteLine(
    appendNoteLine(node.kind === "mesh" ? previousNotes : "", source),
    summariseModifiers(node.modifiers),
  );
}

/**
 * Turns an object into an editable mesh: what it looks like now, with its modifiers baked in, is
 * stored as mesh data and the object points to it. It keeps its place, name, colour and surface; its
 * modifiers and segments are cleared. One undo step; Undo brings back the shape and its modifiers.
 * Says in the bar over the 3D view what happened, or why it could not be done.
 */
export async function bakeNodeToMesh(nodeId: string): Promise<boolean> {
  const { setMessage } = useImportStore.getState();
  const store = useSceneStore.getState();
  const node = store.scene.nodes[nodeId];
  if (!node || !supportsModifiers(node)) return false;

  const hadModifiers = node.modifiers.some((modifier) => modifier.enabled);
  try {
    const geometry = await currentGeometry(node);
    const mesh = geometryToMesh(geometry);
    geometry.dispose();
    const stored = await storeMesh(mesh);
    const info = meshAssetInfo(
      stored.id,
      node.name,
      mesh,
      stored.bytes,
      bakeNote(node, store.scene.assets[node.assetId ?? ""]?.note ?? ""),
    );
    // The object may have changed while the mesh was being stored (it is async): use what is there now
    const latest = useSceneStore.getState().scene.nodes[nodeId];
    if (!latest) return false;
    useSceneStore
      .getState()
      .bakeNodeToMesh(
        nodeId,
        info,
        hadModifiers ? "Apply modifiers" : "Convert to mesh",
      );
    setMessage({
      tone: "info",
      text: `"${node.name}" is now an editable mesh (${info.triangles.toLocaleString("en-US")} triangles).`,
    });
    return true;
  } catch (error) {
    console.error("Making the mesh failed:", error);
    setMessage({
      tone: "error",
      text:
        error instanceof Error && error.message.startsWith("Cannot store")
          ? `Could not make a mesh of "${node.name}": ${error.message.replace("Cannot store this mesh: ", "")}`
          : `Could not make a mesh of "${node.name}". Please try again.`,
    });
    return false;
  }
}
