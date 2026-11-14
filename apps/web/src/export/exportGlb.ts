import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { Object3D } from "three";
import { loadModelScene } from "@/assets/loadModel";
import { download } from "@/sceneFile/download";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
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

/** Builds the GLB of the current scene. Also gives back what was exported and what was left out. */
export async function buildGlb(): Promise<{
  bytes: ArrayBuffer;
  report: ExportReport;
}> {
  const { scene } = useSceneStore.getState();
  const models = await loadModels(
    Object.values(scene.nodes).flatMap((node) =>
      node.kind === "model" && node.assetId ? [node.assetId] : [],
    ),
  );
  const { root, report } = buildExportScene(scene, (id) => models.get(id));
  try {
    return { bytes: await sceneToGlb(root), report };
  } finally {
    disposeExportScene(root);
  }
}

/** A file name from today's date: "scene-2026-11-14.glb". */
export function glbFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `scene-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.glb`;
}

/** Exports the scene as a .glb download and says in the bar over the 3D view what happened. */
export async function exportSceneToGlb(): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  setMessage(null);
  try {
    const { bytes, report } = await buildGlb();
    if (report.objects === 0) {
      setMessage({ tone: "error", text: "There is nothing to export yet." });
      return;
    }
    const name = glbFileName();
    download(name, bytes);
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
    setMessage({
      tone: report.missingModels.length > 0 ? "error" : "info",
      text:
        `Exported ${name} (${(bytes.byteLength / (1024 * 1024)).toFixed(1)} MB): ${report.objects} objects, ${report.lights} lights, ${report.models} models.` +
        (left.length > 0 ? ` Left out: ${left.join(", ")}.` : "") +
        " The background, fog, reflections and built-in lights are not part of a GLB.",
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
