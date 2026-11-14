import { generatePlant, meshAssetInfo } from "@sceneroom/shared";
import { storeMesh } from "@/assets/meshStorage";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

/**
 * Turns a plant into editable meshes: the wood becomes the object itself and the leaves a new object inside
 * it (in the leaf colour). The plant's settings are gone afterwards (they are baked into the points); the
 * notes of each mesh record the seed and size it was grown from. One undo step; Undo brings the plant
 * back. Says in the bar over the 3D view what happened, or why it could not be done.
 */
export async function bakePlantToMeshes(nodeId: string): Promise<boolean> {
  const { setMessage } = useImportStore.getState();
  const node = useSceneStore.getState().scene.nodes[nodeId];
  if (!node?.plant) return false;
  const { plant } = node;
  try {
    const { bark, leaves } = generatePlant(plant);
    const note = `Grown as a plant: seed ${plant.seed}, ${plant.height} tall, ${plant.levels} generations of branches`;

    const barkStored = await storeMesh(bark);
    const barkInfo = meshAssetInfo(
      barkStored.id,
      node.name,
      bark,
      barkStored.bytes,
      note,
    );

    let leafPart: {
      info: ReturnType<typeof meshAssetInfo>;
      nodeId: string;
    } | null = null;
    if (leaves.positions.length > 0) {
      const leavesStored = await storeMesh(leaves);
      leafPart = {
        info: meshAssetInfo(
          leavesStored.id,
          `${node.name} leaves`,
          leaves,
          leavesStored.bytes,
          note,
        ),
        nodeId: crypto.randomUUID(),
      };
    }

    useSceneStore.getState().bakePlantNode(nodeId, barkInfo, leafPart);
    const triangles = barkInfo.triangles + (leafPart?.info.triangles ?? 0);
    setMessage({
      tone: "info",
      text: `"${node.name}" is now ${leafPart ? "two editable meshes (wood and leaves)" : "an editable mesh"} (${triangles.toLocaleString("en-US")} triangles).`,
    });
    return true;
  } catch (error) {
    console.error("Making the plant into meshes failed:", error);
    setMessage({
      tone: "error",
      text: `Could not make meshes of "${node.name}". Please try again.`,
    });
    return false;
  }
}
