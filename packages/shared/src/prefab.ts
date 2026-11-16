import { z } from "zod";
import {
  NODE_NAME_MAX_LENGTH,
  assetInfoSchema,
  createEmptyScene,
  sceneNodeSchema,
  type AssetInfo,
  type Scene,
  type SceneNode,
  type Transform,
} from "./scene";
import {
  addAsset,
  addNode,
  availableName,
  getSubtreeIds,
  removeNodes,
} from "./sceneOps";

/**
 * A prefab is an object (with everything inside it) kept in the project's Assets, so it can be used in
 * any scene. Unity calls these prefabs; Maya references; Blender linked libraries.
 *
 * Copies of it in scenes are linked "instances": their inside (shape, colours, modifiers, children) follows
 * the prefab, and only their place, turn and size, name and visibility are their own. To change a prefab you
 * OPEN it: it appears as a scene of its own (a scene with `prefabId`), you edit it like any scene, and every
 * copy follows.
 */
export const MAX_PREFAB_NODES = 5000;
export const MAX_PREFABS = 200;

export const prefabSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(NODE_NAME_MAX_LENGTH),
    /** The top object first, then everything inside it (each parent before its children). */
    nodes: z.array(sceneNodeSchema).min(1).max(MAX_PREFAB_NODES),
    /** The records of the imported files and meshes the objects use. */
    assets: z.array(assetInfoSchema),
    /** Goes up by one each time the prefab is changed. */
    revision: z.number().int().min(1).default(1),
  })
  .refine((prefab) => prefab.nodes[0]!.parentId === null, {
    message: "the first object of a prefab must be at the top",
    path: ["nodes"],
  })
  .refine(
    (prefab) => {
      const seen = new Set<string>();
      for (const node of prefab.nodes) {
        if (seen.has(node.id)) return false;
        if (node.parentId !== null && !seen.has(node.parentId)) return false;
        seen.add(node.id);
      }
      return true;
    },
    {
      message:
        "the objects of a prefab must have unique ids and come parent first",
      path: ["nodes"],
    },
  );

export type Prefab = z.infer<typeof prefabSchema>;

/** The prefab's top object (the one every copy is placed as). */
export function prefabRootId(prefab: Prefab): string {
  return prefab.nodes[0]!.id;
}

/** The records of the files the objects use, each once. */
function assetsUsedBy(scene: Scene, nodes: readonly SceneNode[]): AssetInfo[] {
  const ids = new Set(
    nodes.flatMap((node) => (node.assetId ? [node.assetId] : [])),
  );
  return [...ids].flatMap((id) => (scene.assets[id] ? [scene.assets[id]] : []));
}

/** Why the object (with everything inside it) cannot be a prefab, in plain words, or null if it can. */
export function whyCannotMakePrefab(
  scene: Scene,
  nodeId: string,
  prefabCount = 0,
): string | null {
  const node = scene.nodes[nodeId];
  if (!node) return "That object no longer exists.";
  if (prefabCount >= MAX_PREFABS) {
    return `A project can have at most ${MAX_PREFABS} prefabs.`;
  }
  return whyCannotBePrefabContent(scene, nodeId);
}

/** The size and nesting checks shared by making a prefab and applying changes to one. */
function whyCannotBePrefabContent(scene: Scene, rootId: string): string | null {
  const ids = getSubtreeIds(scene, rootId);
  if (ids.length > MAX_PREFAB_NODES) {
    return `This object has ${ids.length} objects inside; a prefab can have at most ${MAX_PREFAB_NODES}.`;
  }
  const linked = ids.find((id) => scene.nodes[id]!.prefab !== null);
  if (linked) {
    const name = scene.nodes[linked]!.name;
    return linked === rootId
      ? `"${name}" already is a copy of a prefab. Open that prefab to change it, or Unlink it first.`
      : `"${name}" inside it is a copy of a prefab. Unlink it first (prefabs inside prefabs come later).`;
  }
  return null;
}

/**
 * Takes the object and everything inside it as a prefab. The scene is not changed (the caller turns the
 * object into a copy). Null if a prefab cannot be made (see whyCannotMakePrefab).
 */
export function createPrefab(
  scene: Scene,
  nodeId: string,
  prefabId: string,
  name?: string,
): Prefab | null {
  if (whyCannotMakePrefab(scene, nodeId) !== null) return null;
  const nodes = getSubtreeIds(scene, nodeId).map((id) => {
    const node = scene.nodes[id]!;
    return id === nodeId ? { ...node, parentId: null } : node;
  });
  return {
    id: prefabId,
    name: name ?? scene.nodes[nodeId]!.name,
    nodes,
    assets: assetsUsedBy(scene, nodes),
    revision: 1,
  };
}

/** What a prefab scene's contents make of the prefab. */
export type PrefabFromScene =
  | {
      ok: true;
      prefab: Prefab;
      /** Top-level objects of the scene that are not the prefab's top object (they are not part of it). */
      extraTopLevel: string[];
    }
  | { ok: false; reason: string };

/**
 * Reads the prefab back from the scene that is used to edit it. The prefab is the top object it had (found
 * by its id) and everything inside it; other top-level objects are not part of it and are reported. Same id,
 * name and assets rules; the revision goes up by one.
 */
export function prefabFromScene(scene: Scene, prefab: Prefab): PrefabFromScene {
  const rootId = prefabRootId(prefab);
  const root = scene.nodes[rootId];
  if (!root) {
    return {
      ok: false,
      reason: `The prefab's top object "${prefab.nodes[0]!.name}" is not in this scene any more, so the prefab was not changed. Undo, or put it back.`,
    };
  }
  const reason = whyCannotBePrefabContent(scene, rootId);
  if (reason) return { ok: false, reason };
  const nodes = getSubtreeIds(scene, rootId).map((id) => {
    const node = scene.nodes[id]!;
    return id === rootId ? { ...node, parentId: null } : node;
  });
  const extraTopLevel = Object.values(scene.nodes)
    .filter((n) => n.parentId === null && n.id !== rootId)
    .map((n) => n.id);
  return {
    ok: true,
    prefab: {
      ...prefab,
      nodes,
      assets: assetsUsedBy(scene, nodes),
      revision: prefab.revision + 1,
    },
    extraTopLevel,
  };
}

/** True if two versions of a prefab have the same objects and files (the revision does not count). */
export function samePrefabContent(a: Prefab, b: Prefab): boolean {
  return (
    JSON.stringify([a.nodes, a.assets]) === JSON.stringify([b.nodes, b.assets])
  );
}

/** A scene whose contents are the prefab, exactly as it is stored, for editing it. */
export function createPrefabScene(prefab: Prefab): Scene {
  const empty = createEmptyScene();
  return {
    ...empty,
    nodes: Object.fromEntries(prefab.nodes.map((node) => [node.id, node])),
    assets: Object.fromEntries(prefab.assets.map((info) => [info.id, info])),
  };
}

type Placement = {
  /** The id of the new top object. */
  rootId: string;
  parentId: string | null;
  name: string;
  transform: Transform;
  visible: boolean;
  locked: boolean;
  /** Keeps the place among its neighbours (used when an instance is rebuilt). */
  order?: number;
};

/** Adds the prefab's objects as a linked instance, as described by `placement`. */
function materialize(
  scene: Scene,
  prefab: Prefab,
  newId: () => string,
  placement: Placement,
): Scene {
  let next = prefab.assets.reduce(addAsset, scene);
  const ids = new Map(prefab.nodes.map((node) => [node.id, newId()]));
  ids.set(prefabRootId(prefab), placement.rootId);
  for (const [index, original] of prefab.nodes.entries()) {
    const id = ids.get(original.id)!;
    if (index === 0) {
      next = addNode(next, {
        ...original,
        id,
        parentId: placement.parentId,
        name: placement.name,
        transform: placement.transform,
        visible: placement.visible,
        locked: placement.locked,
        prefab: { id: prefab.id },
      });
      if (placement.order !== undefined) {
        next = {
          ...next,
          nodes: {
            ...next.nodes,
            [id]: { ...next.nodes[id]!, order: placement.order },
          },
        };
      }
    } else {
      next = addNode(next, {
        ...original,
        id,
        parentId: ids.get(original.parentId!)!,
        // Managed by the prefab: not editable here (open the prefab to change it)
        locked: true,
        prefab: null,
      });
    }
  }
  return next;
}

/**
 * Puts a new linked instance of the prefab in the scene. `position` replaces the top object's position
 * (so a prefab dropped on the ground lands where the pointer is). Returns the new scene.
 */
export function placePrefab(
  scene: Scene,
  prefab: Prefab,
  rootId: string,
  newId: () => string,
  options: {
    parentId?: string | null;
    position?: [number, number, number];
  } = {},
): Scene {
  const top = prefab.nodes[0]!;
  return materialize(scene, prefab, newId, {
    rootId,
    parentId: options.parentId ?? null,
    name: availableName(scene, prefab.name),
    transform: {
      ...top.transform,
      position: options.position ?? top.transform.position,
    },
    visible: true,
    locked: false,
  });
}

/** The ids of the top objects of every instance of the prefab in the scene. */
export function prefabInstanceIds(scene: Scene, prefabId: string): string[] {
  return Object.values(scene.nodes)
    .filter((n) => n.prefab?.id === prefabId)
    .map((n) => n.id);
}

/**
 * Replaces the object (and everything inside it) by a linked instance of the prefab, in the same place with
 * the same id, name, parent, turn, size, visibility, lock and order. Used to turn the object a prefab was made
 * from into a copy, and to rebuild copies when the prefab changed.
 */
export function rebuildAsInstance(
  scene: Scene,
  rootId: string,
  prefab: Prefab,
  newId: () => string,
): Scene {
  const root = scene.nodes[rootId];
  if (!root) return scene;
  const placement: Placement = {
    rootId,
    parentId: root.parentId,
    name: root.name,
    transform: root.transform,
    visible: root.visible,
    locked: root.locked,
    order: root.order,
  };
  return materialize(removeNodes(scene, [rootId]), prefab, newId, placement);
}

/**
 * Rebuilds every instance of the prefab in the scene from the prefab, so they match it again. Each
 * instance keeps its id, parent, name, place, turn, size, visibility, lock and order; only its inside is
 * replaced. Returns the same scene if there are no instances.
 */
export function syncPrefabInstances(
  scene: Scene,
  prefab: Prefab,
  newId: () => string,
): Scene {
  let next = scene;
  for (const rootId of prefabInstanceIds(scene, prefab.id)) {
    next = rebuildAsInstance(next, rootId, prefab, newId);
  }
  return next;
}

/** Turns an instance into an ordinary object (its inside can be edited again). */
export function unlinkPrefabInstance(scene: Scene, rootId: string): Scene {
  const root = scene.nodes[rootId];
  if (!root || root.prefab === null) return scene;
  const nodes = { ...scene.nodes };
  nodes[rootId] = { ...root, prefab: null };
  for (const id of getSubtreeIds(scene, rootId)) {
    if (id !== rootId) nodes[id] = { ...nodes[id]!, locked: false };
  }
  return { ...scene, nodes };
}

/** Unlinks every instance of the prefab in the scene (when the prefab is deleted). */
export function unlinkPrefab(scene: Scene, prefabId: string): Scene {
  let next = scene;
  for (const rootId of prefabInstanceIds(scene, prefabId)) {
    next = unlinkPrefabInstance(next, rootId);
  }
  return next;
}

/** How many instances each prefab has across the scenes, and in how many scenes. */
export function prefabUsage(
  scenes: readonly Scene[],
): Record<string, { instances: number; scenes: number }> {
  const usage: Record<string, { instances: number; scenes: number }> = {};
  for (const scene of scenes) {
    const here = new Set<string>();
    for (const node of Object.values(scene.nodes)) {
      if (!node.prefab) continue;
      const entry = (usage[node.prefab.id] ??= { instances: 0, scenes: 0 });
      entry.instances += 1;
      here.add(node.prefab.id);
    }
    for (const id of here) usage[id]!.scenes += 1;
  }
  return usage;
}

/** A prefab name that no other prefab has ("House", then "House (2)"). */
export function availablePrefabName(
  prefabs: Readonly<Record<string, Prefab>>,
  name: string,
  exceptId?: string,
): string {
  const taken = new Set(
    Object.values(prefabs)
      .filter((p) => p.id !== exceptId)
      .map((p) => p.name),
  );
  if (!taken.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, "");
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const candidate = `${base.slice(0, NODE_NAME_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
