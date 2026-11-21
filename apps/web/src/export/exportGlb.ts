import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { Object3D, Texture } from "three";
import { loadMapTexture } from "@/paint/paintSession";
import type { PaintSlot } from "@sceneroom/shared";
import { loadModelScene } from "@/assets/loadModel";
import { loadMeshData } from "@/assets/meshStorage";
import {
  fileDate,
  fileSafeName,
  type Scene,
  type ShapeMesh,
} from "@sceneroom/shared";
import { download } from "@/sceneFile/download";
import { useImportStore } from "@/store/importStore";
import { getProject } from "@/store/projectStore";
import {
  buildExportScene,
  disposeExportScene,
  type ExportReport,
} from "./buildExportScene";

/** Turns a three.js scene into the bytes of a .glb file. */
export async function sceneToGlb(root: Object3D): Promise<ArrayBuffer> {
  const result = await new GLTFExporter().parseAsync(root, {
    binary: true,
    // Position, rotation and scale per object, not a matrix: easier to read in other programs
    trs: true,
    onlyVisible: true,
  });
  if (!(result instanceof ArrayBuffer)) {
    throw new Error("The exporter did not produce a binary file");
  }
  return result;
}

/** Loads the model files the scene uses (each once). A file that cannot be loaded is simply left out. */
async function loadModels(assetIds: readonly string[]) {
  const models = new Map<string, Object3D>();
  for (const id of assetIds) {
    try {
      models.set(id, await loadModelScene(id));
    } catch (error) {
      console.warn(`Model file ${id} could not be loaded for export:`, error);
    }
  }
  return models;
}

/** Loads the editable meshes the scene uses. One that cannot be loaded is left out. */
async function loadMeshes(assetIds: readonly string[]) {
  const meshes = new Map<string, ShapeMesh>();
  for (const id of assetIds) {
    try {
      meshes.set(id, await loadMeshData(id));
    } catch (error) {
      console.warn(`Mesh ${id} could not be loaded for export:`, error);
    }
  }
  return meshes;
}

/** Loads the painted pictures the scene uses (colour, and roughness and metalness). One that cannot be loaded is left out. */
async function loadTextures(
  wanted: readonly { id: string; slot: PaintSlot }[],
) {
  const textures = new Map<string, Texture>();
  for (const { id, slot } of wanted) {
    const texture = await loadMapTexture(id, slot);
    if (texture) textures.set(id, texture);
  }
  return textures;
}

/** Builds the GLB of a scene (default: the open one). Also gives back what was exported and what was left out. */
export async function buildGlb(scene: Scene = getOpenScene()): Promise<{
  bytes: ArrayBuffer;
  report: ExportReport;
}> {
  const models = await loadModels(
    Object.values(scene.nodes).flatMap((node) =>
      node.kind === "model" && node.assetId ? [node.assetId] : [],
    ),
  );
  const meshes = await loadMeshes(
    Object.values(scene.nodes).flatMap((node) =>
      node.kind === "mesh" && node.assetId ? [node.assetId] : [],
    ),
  );
  const wanted = new Map<string, PaintSlot>();
  for (const node of Object.values(scene.nodes)) {
    if (node.material.colorMap) wanted.set(node.material.colorMap, "colorMap");
    if (node.material.normalMap) {
      wanted.set(node.material.normalMap, "normalMap");
    }
    if (node.material.surfaceMap) {
      wanted.set(node.material.surfaceMap, "surfaceMap");
    }
  }
  const textures = await loadTextures(
    [...wanted].map(([id, slot]) => ({ id, slot })),
  );
  const { root, report } = buildExportScene(
    scene,
    (id) => models.get(id),
    (id) => meshes.get(id),
    (id) => textures.get(id),
  );
  try {
    return { bytes: await sceneToGlb(root), report };
  } finally {
    disposeExportScene(root);
  }
}

/** The scene that is open in the editor. */
function getOpenScene(): Scene {
  const project = getProject();
  return project.scenes.find((s) => s.id === project.activeSceneId)!.scene;
}

/** A file name from the scene's name and today's date: "town-2026-11-14.glb". */
export function glbFileName(date: Date = new Date(), name = "scene"): string {
  return `${fileSafeName(name)}-${fileDate(date)}.glb`;
}

const MB = 1024 * 1024;

/** The sentence about what a GLB left out (hidden objects, models with no file). */
function leftOut(report: ExportReport): string {
  const left: string[] = [];
  if (report.hidden > 0) {
    left.push(
      `${report.hidden} hidden object${report.hidden === 1 ? "" : "s"}`,
    );
  }
  if (report.missingModels.length > 0) {
    left.push(
      `${report.missingModels.length} model${report.missingModels.length === 1 ? "" : "s"} with no file (${report.missingModels.slice(0, 3).join(", ")})`,
    );
  }
  return left.length > 0 ? ` Left out: ${left.join(", ")}.` : "";
}

const NOT_IN_GLB =
  " The background, fog, reflections and built-in lights are not part of a GLB.";

/**
 * Exports one scene (default: the open one) as a .glb download and says in the bar over the 3D view what
 * happened.
 */
export async function exportSceneToGlb(sceneId?: string): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  setMessage(null);
  try {
    const project = getProject();
    const target = project.scenes.find(
      (s) => s.id === (sceneId ?? project.activeSceneId),
    );
    if (!target) return;
    const { bytes, report } = await buildGlb(target.scene);
    if (report.objects === 0) {
      setMessage({ tone: "error", text: "There is nothing to export yet." });
      return;
    }
    const name = glbFileName(new Date(), target.name);
    download(name, bytes);
    setMessage({
      tone: report.missingModels.length > 0 ? "error" : "info",
      text:
        `Exported ${name} (${(bytes.byteLength / MB).toFixed(1)} MB): ${report.objects} objects, ${report.lights} lights, ${report.models} models.` +
        leftOut(report) +
        NOT_IN_GLB,
    });
  } catch (error) {
    console.error("Exporting the scene failed:", error);
    setMessage({
      tone: "error",
      text: "Could not export the scene. Please try again.",
    });
  } finally {
    setBusy(false);
  }
}

/**
 * Exports every scene of the project as its own .glb file (one download per scene; the browser may ask
 * once to allow several downloads). Empty scenes are skipped and named in the message.
 */
export async function exportProjectToGlb(): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  setMessage(null);
  try {
    const project = getProject();
    const used = new Set<string>();
    const written: string[] = [];
    const empty: string[] = [];
    let missingModels = 0;
    let totalBytes = 0;
    for (const target of project.scenes) {
      // A scene that edits a prefab is only a way to change the prefab; its copies are exported where they are placed
      if (target.prefabId) continue;
      const { bytes, report } = await buildGlb(target.scene);
      if (report.objects === 0) {
        empty.push(target.name);
        continue;
      }
      // Two scene names can make the same file name ("A b" and "A-b"): number the later one
      let name = glbFileName(new Date(), target.name);
      for (let n = 2; used.has(name); n++) {
        name = glbFileName(new Date(), `${target.name} ${n}`);
      }
      used.add(name);
      download(name, bytes);
      written.push(name);
      totalBytes += bytes.byteLength;
      missingModels += report.missingModels.length;
    }
    if (written.length === 0) {
      setMessage({ tone: "error", text: "There is nothing to export yet." });
      return;
    }
    setMessage({
      tone: missingModels > 0 ? "error" : "info",
      text:
        `Exported ${written.length} file${written.length === 1 ? "" : "s"} (${(totalBytes / MB).toFixed(1)} MB): ${written.join(", ")}.` +
        (empty.length > 0
          ? ` Skipped the empty scene${empty.length === 1 ? "" : "s"} ${empty.join(", ")}.`
          : "") +
        (missingModels > 0
          ? ` ${missingModels} model${missingModels === 1 ? " has" : "s have"} no file and ${missingModels === 1 ? "was" : "were"} left out.`
          : "") +
        NOT_IN_GLB,
    });
  } catch (error) {
    console.error("Exporting the project failed:", error);
    setMessage({
      tone: "error",
      text: "Could not export the project. Please try again.",
    });
  } finally {
    setBusy(false);
  }
}
