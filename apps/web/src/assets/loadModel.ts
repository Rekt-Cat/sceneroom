import { Box3, LoadingManager, Mesh, type Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  MAX_MODEL_BYTES,
  MAX_MODEL_TRIANGLES,
  assetNameFromFileName,
  checkGlbBytes,
  type AssetInfo,
} from "@sceneroom/shared";
import { describeStorageError } from "../persistence/idb";
import { assetStorage } from "./assetStorage";
import { sha256Hex } from "./hash";

/** A problem with a file the user tried to import. The message is written for the user and shown as it is. */
export class ImportError extends Error {}

export type ImportLimits = { maxBytes: number; maxTriangles: number };

export const DEFAULT_LIMITS: ImportLimits = {
  maxBytes: MAX_MODEL_BYTES,
  maxTriangles: MAX_MODEL_TRIANGLES,
};

const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

/** Turns the loader's technical error into a sentence for the user. */
export function friendlyLoadError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("DRACOLoader")) {
    return "This model uses Draco compression, which is not supported yet.";
  }
  if (text.includes("setMeshoptDecoder")) {
    return "This model uses Meshopt compression, which is not supported yet.";
  }
  if (text.includes("KTX2")) {
    return "This model uses KTX2 textures, which are not supported yet.";
  }
  return `This file could not be read as a 3D model. ${text.replace(/^THREE\.GLTFLoader:\s*/, "").slice(0, 160)}`;
}

/**
 * Reads the bytes of a GLB file into a three.js scene. Nothing is fetched from the network: a model
 * that points at files outside itself (by web address) is refused instead of loading them.
 */
export async function parseGlb(buffer: ArrayBuffer): Promise<Object3D> {
  const blocked: string[] = [];
  const manager = new LoadingManager();
  // Only data inside the file itself (data: and blob: addresses) may be used
  manager.setURLModifier((url) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    blocked.push(url);
    return "data:,";
  });

  let scene: Object3D;
  try {
    const gltf = await new GLTFLoader(manager).parseAsync(buffer, "");
    scene = gltf.scene;
  } catch (error) {
    if (blocked.length > 0) throw outsideFilesError(blocked.length);
    throw new ImportError(friendlyLoadError(error));
  }
  if (blocked.length > 0) throw outsideFilesError(blocked.length);
  return scene;
}

function outsideFilesError(count: number): ImportError {
  return new ImportError(
    `This model needs ${count} file${count === 1 ? "" : "s"} from outside itself (such as textures kept next to it), which cannot be loaded. Export it as one self-contained GLB file.`,
  );
}

/** Triangle count and the box around a loaded model, or null if it contains nothing to see. */
export function measureModel(root: Object3D): {
  triangles: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
} | null {
  root.updateMatrixWorld(true);
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const geometry = object.geometry;
    const vertices = geometry.index
      ? geometry.index.count
      : (geometry.getAttribute("position")?.count ?? 0);
    triangles += Math.floor(vertices / 3);
  });
  const box = new Box3().setFromObject(root);
  if (triangles === 0 || box.isEmpty()) return null;
  return {
    triangles,
    boundsMin: [box.min.x, box.min.y, box.min.z],
    boundsMax: [box.max.x, box.max.y, box.max.z],
  };
}

/**
 * The loaded scene of each imported file, loaded once. Every object that uses the file gets its own
 * copy of this (see useModelScene / ModelObject), so ten cars cost one load.
 */
const loadedScenes = new Map<string, Promise<Object3D>>();

export function loadModelScene(assetId: string): Promise<Object3D> {
  const cached = loadedScenes.get(assetId);
  if (cached) return cached;
  const promise = (async () => {
    const bytes = await assetStorage.get(assetId);
    if (!bytes) {
      throw new ImportError(
        "The file for this model is missing, so it cannot be shown.",
      );
    }
    return parseGlb(bytes);
  })();
  loadedScenes.set(assetId, promise);
  // A failure is not remembered, so trying again (or fixing the cause) can work
  promise.catch(() => loadedScenes.delete(assetId));
  return promise;
}

/**
 * Checks and reads a GLB file the user picked or dropped. On success the file is stored and the
 * details to put in the scene are returned; otherwise an ImportError with a clear message is thrown.
 */
export async function importGlbFile(
  file: File,
  limits: ImportLimits = DEFAULT_LIMITS,
): Promise<AssetInfo> {
  if (!/\.glb$/i.test(file.name)) {
    throw new ImportError(
      `"${file.name}" is not a .glb file. Only GLB models can be imported for now.`,
    );
  }
  if (file.size === 0) throw new ImportError("The file is empty.");
  if (file.size > limits.maxBytes) {
    throw new ImportError(
      `This file is ${megabytes(file.size)} MB; the limit is ${megabytes(limits.maxBytes)} MB.`,
    );
  }

  const buffer = await file.arrayBuffer();
  const check = checkGlbBytes(new Uint8Array(buffer));
  if (!check.ok) throw new ImportError(check.reason);

  const id = await sha256Hex(buffer);
  const root = await parseGlb(buffer);
  const measured = measureModel(root);
  if (!measured) {
    throw new ImportError("This model does not contain any shapes to show.");
  }
  if (measured.triangles > limits.maxTriangles) {
    throw new ImportError(
      `This model has ${measured.triangles.toLocaleString("en-US")} triangles; the limit is ${limits.maxTriangles.toLocaleString("en-US")}.`,
    );
  }

  try {
    await assetStorage.put(id, buffer);
  } catch (error) {
    // Usually a full or blocked browser storage: tell the user, keep the details for debugging
    console.error("Could not store the imported file:", error);
    throw new ImportError(describeStorageError(error));
  }
  loadedScenes.set(id, Promise.resolve(root));
  return {
    id,
    name: assetNameFromFileName(file.name),
    type: "model",
    bytes: file.size,
    note: "",
    ...measured,
  };
}
