import {
  COLOR_ROLES,
  bakeCharacter,
  meshAssetInfo,
  type BakedPiece,
} from "@sceneroom/shared";
import { storeMesh } from "@/assets/meshStorage";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

/**
 * Turns a character into editable meshes: the pose is baked into the points, the skin becomes the object
 * itself and each other colour (hair, shirt, trousers, shoes, eyes) a mesh inside it. The character settings
 * are gone afterwards; the notes of each mesh record the pose it was made in. One undo step; Undo brings
 * the character back. Says in the bar over the 3D view what happened, or why it could not be done.
 */
export async function bakeCharacterToMeshes(nodeId: string): Promise<boolean> {
  const { setMessage } = useImportStore.getState();
  const node = useSceneStore.getState().scene.nodes[nodeId];
  if (!node?.character) return false;
  try {
    const meshes = bakeCharacter(node.character);
    const posed = Object.keys(node.character.pose).length;
    const note = `Made from a character${posed > 0 ? ` posed with ${posed} moved bone${posed === 1 ? "" : "s"}` : " at rest"}, ${node.character.height} tall`;
    const pieces: BakedPiece[] = [];
    let triangles = 0;
    for (const role of COLOR_ROLES) {
      const mesh = meshes[role];
      if (!mesh) continue;
      const stored = await storeMesh(mesh);
      const info = meshAssetInfo(
        stored.id,
        `${node.name} ${role}`,
        mesh,
        stored.bytes,
        note,
      );
      triangles += info.triangles;
      pieces.push({ role, info, nodeId: crypto.randomUUID() });
    }
    useSceneStore.getState().bakeCharacterNode(nodeId, pieces);
    setMessage({
      tone: "info",
      text: `"${node.name}" is now ${pieces.length} editable meshes, one per colour (${triangles.toLocaleString("en-US")} triangles).`,
    });
    return true;
  } catch (error) {
    console.error("Making the character into meshes failed:", error);
    setMessage({
      tone: "error",
      text: `Could not make meshes of "${node.name}". Please try again.`,
    });
    return false;
  }
}
