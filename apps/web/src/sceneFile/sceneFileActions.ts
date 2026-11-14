import {
  MAX_SCENE_FILE_BYTES,
  SCENE_FILE_EXTENSION,
  decodeSceneFile,
  encodeSceneFile,
  pruneUnusedMeshAssets,
  sceneFileName,
  type EncodedSceneFile,
} from "@sceneroom/shared";
import { assetStorage } from "@/assets/assetStorage";
import { sha256Hex } from "@/assets/hash";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { download } from "./download";

/** Packs the current scene and the model files it uses (read from the browser's storage). */
export async function buildSceneFile(): Promise<EncodedSceneFile> {
  // Mesh versions that only Undo could bring back are not saved, so they are not even read
  const scene = pruneUnusedMeshAssets(useSceneStore.getState().scene);
  const assets: Record<string, Uint8Array> = {};
  for (const id of Object.keys(scene.assets)) {
    const data = await assetStorage.get(id);
    if (data) assets[id] = new Uint8Array(data);
  }
  return encodeSceneFile(scene, assets);
}

/** Saves the scene as a file download, and says what happened in the bar over the 3D view. */
export async function saveSceneToFile(): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  try {
    const { bytes, missing } = await buildSceneFile();
    const name = sceneFileName();
    download(name, bytes);
    const note =
      missing.length > 0
        ? ` ${missing.length} imported model file${missing.length === 1 ? " was" : "s were"} not found in this browser and could not be included.`
        : "";
    setMessage({
      tone: missing.length > 0 ? "error" : "info",
      text: `Saved ${name} (${(bytes.length / (1024 * 1024)).toFixed(1)} MB).${note}`,
    });
  } catch (error) {
    console.error("Saving the scene failed:", error);
    setMessage({
      tone: "error",
      text: "Could not save the scene as a file. Please try again.",
    });
  } finally {
    setBusy(false);
  }
}

/** How a scene is described when asking whether to replace the one that is open. */
function describe(objects: number): string {
  return `${objects} object${objects === 1 ? "" : "s"}`;
}

/**
 * Opens a SceneRoom file: checks it completely, asks before replacing the scene that is open (undo
 * cannot bring it back; saving it first as a file can), puts the model files in the browser's storage
 * and loads the scene. Says in the bar over the 3D view what happened, or exactly what is wrong.
 */
export async function openSceneFromFile(
  file: File,
  confirmReplace: (question: string) => boolean = (question) =>
    window.confirm(question),
): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  setMessage(null);
  try {
    // The size is checked before the file is read into memory
    if (file.size > MAX_SCENE_FILE_BYTES) {
      setMessage({
        tone: "error",
        text: `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is ${MAX_SCENE_FILE_BYTES / (1024 * 1024)} MB.`,
      });
      return;
    }
    const decoded = decodeSceneFile(new Uint8Array(await file.arrayBuffer()));
    if (!decoded.ok) {
      setMessage({ tone: "error", text: `${file.name}: ${decoded.reason}` });
      return;
    }

    // A model file is stored under a fingerprint of its contents; a file that does not match its
    // fingerprint was changed (or is not what it claims), so it is refused
    for (const [id, data] of Object.entries(decoded.assets)) {
      if ((await sha256Hex(data.buffer as ArrayBuffer)) !== id) {
        const name = decoded.scene.assets[id]?.name ?? id;
        setMessage({
          tone: "error",
          text: `${file.name}: the model "${name}" does not match its fingerprint, so the file was changed or damaged.`,
        });
        return;
      }
    }

    const current = Object.keys(useSceneStore.getState().scene.nodes).length;
    const incoming = Object.keys(decoded.scene.nodes).length;
    if (
      current > 0 &&
      !confirmReplace(
        `Replace the open scene (${describe(current)}) with "${file.name}" (${describe(incoming)})? This cannot be undone. Save the open scene as a file first if you want to keep it.`,
      )
    ) {
      return;
    }

    for (const [id, data] of Object.entries(decoded.assets)) {
      await assetStorage.put(id, data.buffer as ArrayBuffer);
    }
    useSceneStore.getState().loadScene(decoded.scene);
    const missing = Object.keys(decoded.scene.assets).filter(
      (id) => !decoded.assets[id],
    );
    setMessage({
      tone: missing.length > 0 ? "error" : "info",
      text:
        `Opened ${file.name} (${describe(incoming)}).` +
        (missing.length > 0
          ? ` ${missing.length} model file${missing.length === 1 ? " is" : "s are"} not in the file, so those models show as red boxes.`
          : ""),
    });
  } catch (error) {
    console.error("Opening the scene file failed:", error);
    setMessage({
      tone: "error",
      text: `Could not open ${file.name}. Please try again.`,
    });
  } finally {
    setBusy(false);
  }
}

/** True for a file name that ends in the SceneRoom extension. */
export function isSceneFileName(name: string): boolean {
  return name.toLowerCase().endsWith(SCENE_FILE_EXTENSION);
}
