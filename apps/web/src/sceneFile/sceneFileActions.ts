import {
  MAX_PROJECT_SCENES,
  MAX_SCENE_FILE_BYTES,
  SCENE_FILE_EXTENSION,
  createProject,
  decodeProjectFile,
  encodeProjectFile,
  projectAssetIds,
  prefabsUsedByScene,
  pruneUnusedMeshAssets,
  sceneFileName,
  type EncodedSceneFile,
  type Project,
} from "@sceneroom/shared";
import { assetStorage } from "@/assets/assetStorage";
import { sha256Hex } from "@/assets/hash";
import { getProject, useProjectStore } from "@/store/projectStore";
import { useImportStore } from "@/store/importStore";
import { download } from "./download";

/**
 * Packs a project and the model and mesh files its scenes use (read from the browser's storage; a file
 * used by several scenes is read and packed once). Mesh versions that only Undo could bring back are not
 * saved, so they are not even read.
 */
export async function buildProjectFile(
  project: Project = getProject(),
): Promise<EncodedSceneFile> {
  const wanted = projectAssetIds({
    ...project,
    scenes: project.scenes.map((s) => ({
      ...s,
      scene: pruneUnusedMeshAssets(s.scene),
    })),
  });
  const assets: Record<string, Uint8Array> = {};
  for (const id of wanted) {
    const data = await assetStorage.get(id);
    if (data) assets[id] = new Uint8Array(data);
  }
  return encodeProjectFile(project, assets);
}

/** The project of just one scene (for "Save this scene as a file"). Null if there is no such scene. */
export function projectOfScene(
  project: Project,
  sceneId: string,
): Project | null {
  const scene = project.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  return {
    ...createProject(scene.id, scene.scene, scene.name),
    name: project.name,
    // The prefabs its objects are linked to come along, so they still work where the file is opened
    prefabs: prefabsUsedByScene(project, scene.scene),
  };
}

/** Saves a file download and says in the bar over the 3D view what happened. */
async function saveFile(project: Project, fileBase: string): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  try {
    const { bytes, missing } = await buildProjectFile(project);
    const name = sceneFileName(new Date(), fileBase);
    download(name, bytes);
    const scenes = project.scenes.length;
    const note =
      missing.length > 0
        ? ` ${missing.length} imported model file${missing.length === 1 ? " was" : "s were"} not found in this browser and could not be included.`
        : "";
    setMessage({
      tone: missing.length > 0 ? "error" : "info",
      text: `Saved ${name} (${scenes} scene${scenes === 1 ? "" : "s"}, ${(bytes.length / (1024 * 1024)).toFixed(1)} MB).${note}`,
    });
  } catch (error) {
    console.error("Saving the project failed:", error);
    setMessage({
      tone: "error",
      text: "Could not save the file. Please try again.",
    });
  } finally {
    setBusy(false);
  }
}

/** Saves the whole project (every scene and every file they use) as one file. */
export async function saveProjectToFile(): Promise<void> {
  const project = getProject();
  await saveFile(project, project.name);
}

/** Saves only one scene (default: the open one) as a file, with the files it uses. */
export async function saveSceneToFile(sceneId?: string): Promise<void> {
  const project = getProject();
  const single = projectOfScene(project, sceneId ?? project.activeSceneId);
  if (!single) return;
  await saveFile(single, single.scenes[0]!.name);
}

/** How a number of objects is described when asking whether to replace what is open. */
function describe(objects: number): string {
  return `${objects} object${objects === 1 ? "" : "s"}`;
}

function describeProject(project: Project): string {
  const objects = project.scenes.reduce(
    (sum, s) => sum + Object.keys(s.scene.nodes).length,
    0,
  );
  const scenes = project.scenes.length;
  return `${scenes} scene${scenes === 1 ? "" : "s"}, ${describe(objects)}`;
}

/**
 * Reads and checks a SceneRoom file: its size, its structure, and that every model file matches its
 * fingerprint. Says in the bar over the 3D view exactly what is wrong and gives back null if anything is.
 */
async function readProjectFile(
  file: File,
): Promise<{ project: Project; assets: Record<string, Uint8Array> } | null> {
  const { setMessage } = useImportStore.getState();
  // The size is checked before the file is read into memory
  if (file.size > MAX_SCENE_FILE_BYTES) {
    setMessage({
      tone: "error",
      text: `"${file.name}" is ${(file.size / (1024 * 1024)).toFixed(1)} MB; the limit is ${MAX_SCENE_FILE_BYTES / (1024 * 1024)} MB.`,
    });
    return null;
  }
  const decoded = decodeProjectFile(new Uint8Array(await file.arrayBuffer()));
  if (!decoded.ok) {
    setMessage({ tone: "error", text: `${file.name}: ${decoded.reason}` });
    return null;
  }

  // A model file is stored under a fingerprint of its contents; a file that does not match its
  // fingerprint was changed (or is not what it claims), so it is refused
  for (const [id, data] of Object.entries(decoded.assets)) {
    if ((await sha256Hex(data.buffer as ArrayBuffer)) !== id) {
      const name =
        decoded.project.scenes.find((s) => s.scene.assets[id])?.scene.assets[id]
          ?.name ?? id;
      setMessage({
        tone: "error",
        text: `${file.name}: the model "${name}" does not match its fingerprint, so the file was changed or damaged.`,
      });
      return null;
    }
  }
  return { project: decoded.project, assets: decoded.assets };
}

/** What is said after a file was loaded: how many scenes, and which models have no file. */
function missingNote(project: Project, assets: Record<string, Uint8Array>) {
  const missing = projectAssetIds(project).filter((id) => !assets[id]);
  return {
    tone: missing.length > 0 ? ("error" as const) : ("info" as const),
    text:
      missing.length > 0
        ? ` ${missing.length} model file${missing.length === 1 ? " is" : "s are"} not in the file, so those models show as red boxes.`
        : "",
  };
}

/**
 * Opens a SceneRoom file as the project: checks it completely, asks before replacing the project that is
 * open (undo cannot bring it back; saving it first as a file can), puts the model files in the browser's
 * storage and loads every scene. A file saved before projects existed opens as a project with one scene.
 */
export async function openProjectFromFile(
  file: File,
  confirmReplace: (question: string) => boolean = (question) =>
    window.confirm(question),
): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  setMessage(null);
  try {
    const read = await readProjectFile(file);
    if (!read) return;

    const current = getProject();
    const hasWork = current.scenes.some(
      (s) => Object.keys(s.scene.nodes).length > 0,
    );
    if (
      hasWork &&
      !confirmReplace(
        `Replace the open project (${describeProject(current)}) with "${file.name}" (${describeProject(read.project)})? This cannot be undone. Save the open project as a file first if you want to keep it.`,
      )
    ) {
      return;
    }

    for (const [id, data] of Object.entries(read.assets)) {
      await assetStorage.put(id, data.buffer as ArrayBuffer);
    }
    useProjectStore.getState().loadProject(read.project);
    const note = missingNote(read.project, read.assets);
    setMessage({
      tone: note.tone,
      text: `Opened ${file.name} (${describeProject(read.project)}).${note.text}`,
    });
  } catch (error) {
    console.error("Opening the file failed:", error);
    setMessage({
      tone: "error",
      text: `Could not open ${file.name}. Please try again.`,
    });
  } finally {
    setBusy(false);
  }
}

/**
 * Adds the scenes of a SceneRoom file to the open project, next to the ones already there (nothing is
 * replaced, so no question is asked). The scenes get new ids and, if needed, new names.
 */
export async function importScenesFromFile(file: File): Promise<void> {
  const { setBusy, setMessage } = useImportStore.getState();
  if (useImportStore.getState().busy) return;
  setBusy(true);
  setMessage(null);
  try {
    const read = await readProjectFile(file);
    if (!read) return;
    // Refuse before anything is stored, if the scenes do not fit
    const have = useProjectStore.getState().scenes.length;
    const adding = read.project.scenes.length;
    if (have + adding > MAX_PROJECT_SCENES) {
      setMessage({
        tone: "error",
        text: `${file.name}: a project can have at most ${MAX_PROJECT_SCENES} scenes; this one has ${have} and the file has ${adding}.`,
      });
      return;
    }
    // The files first, so the new scenes show their models as soon as they appear
    for (const [id, data] of Object.entries(read.assets)) {
      await assetStorage.put(id, data.buffer as ArrayBuffer);
    }
    const problem = useProjectStore
      .getState()
      .addScenes(read.project.scenes, read.project.prefabs);
    if (problem) {
      setMessage({ tone: "error", text: `${file.name}: ${problem}` });
      return;
    }
    const note = missingNote(read.project, read.assets);
    const count = read.project.scenes.length;
    setMessage({
      tone: note.tone,
      text: `Added ${count} scene${count === 1 ? "" : "s"} from ${file.name}.${note.text}`,
    });
  } catch (error) {
    console.error("Adding scenes from the file failed:", error);
    setMessage({
      tone: "error",
      text: `Could not add the scenes from ${file.name}. Please try again.`,
    });
  } finally {
    setBusy(false);
  }
}

/** True for a file name that ends in the SceneRoom extension. */
export function isSceneFileName(name: string): boolean {
  return name.toLowerCase().endsWith(SCENE_FILE_EXTENSION);
}
