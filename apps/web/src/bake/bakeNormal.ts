import { startNormalBake, type AssetInfo } from "@sceneroom/shared";
import { Box3, Matrix4, Vector3, type Mesh } from "three";
import { assetStorage } from "@/assets/assetStorage";
import { sha256Hex } from "@/assets/hash";
import { useCollabStore } from "@/collab/collabStore";
import { editBlockedMessage } from "@/collab/editLocks";
import { loadMeshData } from "@/assets/meshStorage";
import { getMesh } from "@/components/viewport/meshRegistry";
import { firstMesh } from "@/meshEdit/shrinkwrap";
import { canvasToPng } from "@/paint/paintSession";
import { useBakeStore } from "@/store/bakeStore";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";

const say = (text: string, tone: "info" | "error" = "error") =>
  useImportStore.getState().setMessage({ tone, text });

/** Pixels baked before the page gets a moment to draw the progress bar and listen to the mouse. */
const TEXELS_PER_STEP = 20_000;

/** Lets the browser draw and handle clicks between two pieces of work. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** A canvas holding the pixels, as the bytes of a PNG. */
async function pixelsToPng(
  pixels: Uint8ClampedArray,
  size: number,
): Promise<ArrayBuffer> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser cannot draw pictures.");
  context.putImageData(
    new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, size, size),
    0,
    0,
  );
  return canvasToPng(canvas);
}

/**
 * Bake detail: copies the detail of another (dense) object onto the mesh being baked as a normal map, then gives the
 * mesh that map as one undo step. The dense object is read as it is shown now (its place, turn and size included) and
 * brought into the baked mesh's own space. Says in the bar over the 3D view how it went. Returns whether it worked.
 */
export async function bakeNormalMap(
  nodeId: string,
  highId: string,
  size: number,
  cage: number,
): Promise<boolean> {
  const bake = useBakeStore.getState();
  if (bake.runningFor) return false;
  const node = useSceneStore.getState().scene.nodes[nodeId];
  if (!node || node.kind !== "mesh" || !node.assetId) return false;
  if (node.locked) {
    say("This object is locked, so it cannot be baked.");
    return false;
  }
  const taken = editBlockedMessage(
    useCollabStore.getState(),
    nodeId,
    node.name,
  );
  if (taken) {
    say(taken);
    return false;
  }
  if (highId === nodeId) {
    say("Choose a different object to copy the detail from.");
    return false;
  }
  const lowObject = getMesh(nodeId);
  const highMesh = firstMesh(getMesh(highId) as Mesh | undefined);
  const geometry = highMesh?.geometry;
  const position = geometry?.getAttribute("position");
  if (!lowObject || !highMesh || !geometry || !position) {
    say("Choose the dense object to copy detail from (it must be on screen).");
    return false;
  }
  bake.start(nodeId);
  try {
    const mesh = await loadMeshData(node.assetId);
    if (!mesh.uvs) {
      say(
        `"${node.name}" has no UV map, so there is nowhere to put the baked picture. Open Edit points, then the UV window, and press Unwrap.`,
      );
      return false;
    }
    lowObject.updateWorldMatrix(true, false);
    highMesh.updateWorldMatrix(true, false);
    // The dense object's points in the baked object's own space
    const toLow = new Matrix4()
      .copy(lowObject.matrixWorld)
      .invert()
      .multiply(highMesh.matrixWorld);
    const highPositions = new Float32Array(position.count * 3);
    const v = new Vector3();
    for (let p = 0; p < position.count; p++) {
      v.fromBufferAttribute(position, p).applyMatrix4(toLow);
      v.toArray(highPositions, p * 3);
    }
    const highIndices = geometry.index
      ? Uint32Array.from(geometry.index.array)
      : Uint32Array.from({ length: position.count }, (_, i) => i);
    // The cage is a share of the baked object's size
    const box = new Box3().setFromArray(mesh.positions);
    const diagonal = box.getSize(new Vector3()).length();
    const job = startNormalBake(
      { positions: mesh.positions, indices: mesh.indices, uvs: mesh.uvs },
      { positions: highPositions, indices: highIndices },
      { size, distance: Math.max(1e-6, cage * diagonal) },
    );
    while (!job.step(TEXELS_PER_STEP)) {
      useBakeStore.getState().setProgress(job.progress());
      await breathe();
      if (useBakeStore.getState().cancelled) {
        say("Baking cancelled. Nothing was changed.", "info");
        return false;
      }
    }
    const { hits, misses } = job.stats();
    if (hits === 0) {
      // Two causes: the objects are apart (move one onto the other), or they overlap but the cage is too short
      const reach = Math.max(1e-6, cage * diagonal);
      const apart = !box
        .clone()
        .expandByScalar(reach)
        .intersectsBox(new Box3().setFromArray(highPositions));
      say(
        apart
          ? `No ray met the dense object because it is nowhere near "${node.name}". Move it onto "${node.name}" (the same position, around or just inside it) and bake again.`
          : "No ray met the dense object. It overlaps this one but its surface is further away than the rays reach: a bigger Cage size reaches further (or move the dense object closer to this one's surface).",
      );
      return false;
    }
    const bytes = await pixelsToPng(job.pixels, size);
    const id = await sha256Hex(bytes);
    await assetStorage.put(id, bytes);
    const info: AssetInfo = {
      id,
      name: `${node.name} normal`,
      type: "texture",
      bytes: bytes.byteLength,
      triangles: 0,
      boundsMin: [0, 0, 0],
      boundsMax: [0, 0, 0],
      note: "",
    };
    useSceneStore
      .getState()
      .setNodeMap(nodeId, "normalMap", info, "Bake normal map");
    const highName =
      useSceneStore.getState().scene.nodes[highId]?.name ?? "the dense object";
    say(
      `Baked the detail of "${highName}" onto "${node.name}" (${size} x ${size}): ${hits.toLocaleString("en-US")} pixels found it${misses > 0 ? `, ${misses.toLocaleString("en-US")} did not (they stay flat; a bigger Cage size reaches further)` : ""}.`,
      "info",
    );
    return true;
  } catch (error) {
    console.error("Baking failed:", error);
    say("Could not bake the detail. Please try again.");
    return false;
  } finally {
    useBakeStore.getState().finish();
  }
}
