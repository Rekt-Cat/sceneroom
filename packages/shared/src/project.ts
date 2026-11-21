import { z } from "zod";
import {
  createEmptyScene,
  sceneSchema,
  type Scene,
  type SceneNode,
} from "./scene";
import { addNode, createNode } from "./sceneOps";
import { createCharacterNode } from "./character";
import { setEnvironment } from "./environment";
import { MAX_PREFABS, prefabSchema, type Prefab } from "./prefab";

/**
 * A project is the unit people work on: a name and several scenes (one for NPCs, one for buildings,
 * one that puts everything together, and so on). Each scene is an ordinary `Scene`. The model files are
 * not inside the scenes: they are kept once, by fingerprint, and every scene that uses one refers to it.
 * (Members, roles and the shared library come with the backend; see docs/overview/PLAN.md, Phase 5b.)
 */
export const PROJECT_SCHEMA_VERSION = 1;
export const MAX_PROJECT_SCENES = 50;
export const MAX_SCENE_NAME_LENGTH = 60;
export const DEFAULT_PROJECT_NAME = "Untitled project";

export const projectSceneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(MAX_SCENE_NAME_LENGTH),
  scene: sceneSchema,
  /**
   * Set for a scene that exists to edit a prefab: its contents are the prefab, and changes to it reach every
   * copy of the prefab. Absent for an ordinary scene.
   */
  prefabId: z.string().min(1).optional(),
});

export const projectSchema = z
  .object({
    version: z.literal(PROJECT_SCHEMA_VERSION),
    name: z.string().min(1).max(MAX_SCENE_NAME_LENGTH),
    activeSceneId: z.string().min(1),
    scenes: z.array(projectSceneSchema).min(1).max(MAX_PROJECT_SCENES),
    /** The project's prefabs, by id (reusable objects shown in the Assets tab). Older projects load with none. */
    prefabs: z.record(z.string(), prefabSchema).default({}),
  })
  .refine((project) => Object.keys(project.prefabs).length <= MAX_PREFABS, {
    message: `a project can have at most ${MAX_PREFABS} prefabs`,
    path: ["prefabs"],
  })
  .refine(
    (project) =>
      Object.entries(project.prefabs).every(([key, p]) => key === p.id),
    { message: "a prefab is stored under the wrong id", path: ["prefabs"] },
  )
  .refine(
    (project) => project.scenes.some((s) => s.id === project.activeSceneId),
    {
      message: "the open scene is not in the project",
      path: ["activeSceneId"],
    },
  )
  .refine(
    (project) =>
      new Set(project.scenes.map((s) => s.id)).size === project.scenes.length,
    {
      message: "two scenes have the same id",
      path: ["scenes"],
    },
  );

export type ProjectScene = z.infer<typeof projectSceneSchema>;
export type Project = z.infer<typeof projectSchema>;

/** A project with one scene: what a single saved scene becomes (and what a new browser starts with). */
export function createProject(
  sceneId: string,
  scene: Scene,
  sceneName = "Scene 1",
): Project {
  return {
    version: PROJECT_SCHEMA_VERSION,
    name: DEFAULT_PROJECT_NAME,
    activeSceneId: sceneId,
    scenes: [{ id: sceneId, name: sceneName, scene }],
    prefabs: {},
  };
}

export type ParsedProject =
  { ok: true; project: Project } | { ok: false; reason: string };

/** Checks a project read from storage (or, later, a file or the server) like any other outside data. */
export function parseProject(raw: unknown): ParsedProject {
  const result = projectSchema.safeParse(raw);
  if (result.success) return { ok: true, project: result.data };
  const first = result.error.issues[0];
  const where = first?.path.length ? ` (at ${first.path.join(".")})` : "";
  return {
    ok: false,
    reason: `${first?.message ?? "the data has the wrong shape"}${where}`,
  };
}

/** The name with surrounding spaces removed and cut to the limit, or null if nothing is left. */
export function normalizeSceneName(name: string): string | null {
  const clean = name
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, MAX_SCENE_NAME_LENGTH)
    .trim();
  return clean === "" ? null : clean;
}

/** `name` if no scene has it, otherwise "name (2)", "name (3)", and so on. */
export function availableSceneName(
  scenes: readonly { name: string }[],
  name: string,
): string {
  const taken = new Set(scenes.map((s) => s.name));
  if (!taken.has(name)) return name;
  // Counting starts from the name without a number already on it ("Town (2)" copies as "Town (3)")
  const base = name.replace(/ \(\d+\)$/, "");
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, MAX_SCENE_NAME_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Why a scene cannot be added, or null if it can. */
export function whyCannotAddScene(project: Project): string | null {
  return project.scenes.length >= MAX_PROJECT_SCENES
    ? `A project can have at most ${MAX_PROJECT_SCENES} scenes.`
    : null;
}

/** Adds a scene after the others. The new scene's name is made unique. */
export function addProjectScene(
  project: Project,
  scene: ProjectScene,
): Project {
  const reason = whyCannotAddScene(project);
  if (reason) throw new Error(reason);
  if (project.scenes.some((s) => s.id === scene.id)) {
    throw new Error(`Scene "${scene.id}" already exists`);
  }
  const name = availableSceneName(project.scenes, scene.name);
  return { ...project, scenes: [...project.scenes, { ...scene, name }] };
}

/** Renames a scene. A name that is empty or already used by another scene is refused (null). */
export function renameProjectScene(
  project: Project,
  id: string,
  name: string,
): Project | null {
  const clean = normalizeSceneName(name);
  if (clean === null) return null;
  if (project.scenes.some((s) => s.id !== id && s.name === clean)) return null;
  return {
    ...project,
    scenes: project.scenes.map((s) =>
      s.id === id ? { ...s, name: clean } : s,
    ),
  };
}

/** Removes a scene. The last scene cannot be removed; if the open scene goes, a neighbour opens. */
export function deleteProjectScene(project: Project, id: string): Project {
  const index = project.scenes.findIndex((s) => s.id === id);
  if (index === -1 || project.scenes.length <= 1) return project;
  const scenes = project.scenes.filter((s) => s.id !== id);
  const activeSceneId =
    project.activeSceneId === id
      ? scenes[Math.min(index, scenes.length - 1)]!.id
      : project.activeSceneId;
  return { ...project, scenes, activeSceneId };
}

/** Moves a scene to a new place in the tab order (clamped to the ends). */
export function moveProjectScene(
  project: Project,
  id: string,
  toIndex: number,
): Project {
  const from = project.scenes.findIndex((s) => s.id === id);
  if (from === -1) return project;
  const to = Math.max(0, Math.min(project.scenes.length - 1, toIndex));
  if (to === from) return project;
  const scenes = [...project.scenes];
  const [moved] = scenes.splice(from, 1);
  scenes.splice(to, 0, moved!);
  return { ...project, scenes };
}

/** Which scene the project has the id of, or null. */
export function findProjectScene(
  project: Project,
  id: string,
): ProjectScene | null {
  return project.scenes.find((s) => s.id === id) ?? null;
}

/* ------------------------------ templates ------------------------------ */

export const SCENE_TEMPLATES = [
  "blank",
  "characters",
  "buildings",
  "environment",
  "assembly",
] as const;
export type SceneTemplateName = (typeof SCENE_TEMPLATES)[number];

/** What each template is for, in plain words (shown in the "New scene" menu). */
export const SCENE_TEMPLATE_INFO: Record<
  SceneTemplateName,
  { label: string; help: string }
> = {
  blank: { label: "Blank", help: "An empty scene" },
  characters: {
    label: "Characters",
    help: "A floor and one person, to design and pose people",
  },
  buildings: {
    label: "Buildings",
    help: "A large floor with a first block to build on",
  },
  environment: {
    label: "Environment",
    help: "Ground, a sky and a little fog, for landscapes and forests",
  },
  assembly: {
    label: "Assembly",
    help: "A floor and a sky, to put everything from the other scenes together",
  },
};

function groundNode(id: string, size: number, color: string): SceneNode {
  const base = createNode(id, "plane");
  return {
    ...base,
    name: "Ground",
    color,
    // A plane stands upright by default; the ground lies flat at height 0
    transform: {
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [size, size, 1],
    },
  };
}

/**
 * The starting contents of a new scene. They are only a starting point: everything in them can be
 * changed or deleted. `newId` supplies a fresh id for each object (so this stays a plain function).
 */
export function createTemplateScene(
  template: SceneTemplateName,
  newId: () => string,
): Scene {
  const empty = createEmptyScene();
  switch (template) {
    case "blank":
      return empty;
    case "characters":
      return addNode(
        addNode(empty, groundNode(newId(), 12, "#4a5058")),
        createCharacterNode(newId(), "person"),
      );
    case "buildings":
      return setEnvironment(
        addNode(addNode(empty, groundNode(newId(), 60, "#5b6168")), {
          ...createNode(newId(), "cube"),
          name: "Block",
          transform: {
            position: [0, 1.5, 0],
            rotation: [0, 0, 0],
            scale: [4, 3, 4],
          },
        }),
        { backgroundMode: "sky", reflections: "sky" },
      );
    case "environment":
      return setEnvironment(
        addNode(empty, groundNode(newId(), 120, "#5f7a4a")),
        {
          backgroundMode: "sky",
          reflections: "sky",
          fogEnabled: true,
          fogColor: "#bcd6ea",
          fogNear: 30,
          fogFar: 160,
        },
      );
    case "assembly":
      return setEnvironment(
        addNode(empty, groundNode(newId(), 60, "#5b6168")),
        {
          backgroundMode: "sky",
          reflections: "sky",
        },
      );
  }
}

/**
 * Adds scenes that came from somewhere else (a file) after the others. They get new ids (so they can never
 * clash with the scenes already here) and unique names. Throws if the project would get too many scenes.
 * Returns the project and the ids of the new scenes, in order.
 */
export function addProjectScenes(
  project: Project,
  incoming: readonly ProjectScene[],
  newId: () => string,
): { project: Project; addedIds: string[] } {
  if (project.scenes.length + incoming.length > MAX_PROJECT_SCENES) {
    throw new Error(
      `A project can have at most ${MAX_PROJECT_SCENES} scenes; this one has ${project.scenes.length} and ${incoming.length} more were given.`,
    );
  }
  let next = project;
  const addedIds: string[] = [];
  for (const scene of incoming) {
    const id = newId();
    next = addProjectScene(next, { ...scene, id });
    addedIds.push(id);
  }
  return { project: next, addedIds };
}

/** The prefabs that objects in this scene are linked to (as copies), by id. */
export function prefabsUsedByScene(
  project: Pick<Project, "prefabs">,
  scene: Scene,
): Record<string, Prefab> {
  const used: Record<string, Prefab> = {};
  for (const node of Object.values(scene.nodes)) {
    const prefab = node.prefab ? project.prefabs[node.prefab.id] : undefined;
    if (prefab) used[prefab.id] = prefab;
  }
  return used;
}
