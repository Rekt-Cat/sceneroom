import {
  SCENE_TEMPLATE_INFO,
  availableSceneName,
  createProject,
  createTemplateScene,
  sceneFileName,
  DEFAULT_PROJECT_NAME,
  type Project,
  type ProjectEntry,
  type SceneTemplateName,
} from "@sceneroom/shared";
import { assetStorage } from "@/assets/assetStorage";
import type { IndexedDbProjectLibrary } from "@/persistence/projectLibrary";
import {
  buildProjectFile,
  describeProject,
  missingNote,
  readProjectFile,
} from "@/sceneFile/sceneFileActions";
import { download } from "@/sceneFile/download";

/** What an action on the home screen says afterwards. */
export type HomeResult =
  { ok: true; id?: string; note?: string } | { ok: false; text: string };

/** A new project from a scene template (Blank is the plain start). Its name is one no other project has. */
export async function createNewProject(
  library: IndexedDbProjectLibrary,
  entries: readonly ProjectEntry[],
  template: SceneTemplateName = "blank",
): Promise<HomeResult> {
  try {
    const scene = createTemplateScene(template, () => crypto.randomUUID());
    const project: Project = {
      ...createProject(crypto.randomUUID(), scene, "Scene 1"),
      name: availableSceneName(entries, DEFAULT_PROJECT_NAME),
    };
    const id = await library.create(project);
    return { ok: true, id };
  } catch (error) {
    console.error("Making the project failed:", error);
    return { ok: false, text: "Could not make the project. Please try again." };
  }
}

/** Opens a `.sceneroom` file as a NEW project (nothing that exists is replaced). The file is checked completely first. */
export async function importProject(
  library: IndexedDbProjectLibrary,
  entries: readonly ProjectEntry[],
  file: File,
): Promise<HomeResult> {
  try {
    const read = await readProjectFile(file);
    if (!read) return { ok: false, text: "" }; // the reason was shown by readProjectFile
    for (const [id, data] of Object.entries(read.assets)) {
      await assetStorage.put(id, data.buffer as ArrayBuffer);
    }
    const project: Project = {
      ...read.project,
      name: availableSceneName(entries, read.project.name),
    };
    const id = await library.create(project);
    const note = missingNote(read.project, read.assets);
    return {
      ok: true,
      id,
      note: `Opened ${file.name} (${describeProject(read.project)}).${note.text}`,
    };
  } catch (error) {
    console.error("Opening the file failed:", error);
    return {
      ok: false,
      text: `Could not open ${file.name}. Please try again.`,
    };
  }
}

/** Saves one project as a `.sceneroom` file download (all its scenes and the models they use). */
export async function exportProjectFile(
  library: IndexedDbProjectLibrary,
  id: string,
): Promise<HomeResult> {
  try {
    const loaded = await library.load(id);
    if (loaded.status !== "loaded") {
      return { ok: false, text: "That project could not be read." };
    }
    const { bytes, missing } = await buildProjectFile(loaded.project);
    download(sceneFileName(new Date(), loaded.project.name), bytes);
    return {
      ok: true,
      note:
        missing.length > 0
          ? `Saved, but ${missing.length} model file${missing.length === 1 ? " was" : "s were"} not found in this browser and could not be included.`
          : `Saved ${loaded.project.name}.`,
    };
  } catch (error) {
    console.error("Saving the project file failed:", error);
    return { ok: false, text: "Could not save the file. Please try again." };
  }
}

export { SCENE_TEMPLATE_INFO };
