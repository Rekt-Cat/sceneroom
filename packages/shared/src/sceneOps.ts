import {
  NODE_NAME_MAX_LENGTH,
  type PrimitiveKind,
  type Scene,
  type SceneNode,
  type Transform,
} from "./scene";
import { topLevelSelection } from "./selection";

/**
 * Pure scene operations: each takes a scene and returns a NEW scene, never mutating the input.
 * Ids are passed in (not generated here) so the functions stay predictable and easy to test.
 */

const DEFAULT_COLOR = "#5cc4e0";

const KIND_LABELS: Record<PrimitiveKind, string> = {
  cube: "Cube",
  sphere: "Sphere",
  cylinder: "Cylinder",
  plane: "Plane",
  cone: "Cone",
};

export function createNode(id: string, kind: PrimitiveKind): SceneNode {
  return {
    id,
    name: KIND_LABELS[kind],
    kind,
    parentId: null,
    visible: true,
    // y = 0.5 puts a 1-unit primitive on top of the ground grid
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    color: DEFAULT_COLOR,
  };
}

export function addNode(scene: Scene, node: SceneNode): Scene {
  if (scene.nodes[node.id]) throw new Error(`Node "${node.id}" already exists`);
  if (node.parentId !== null && !scene.nodes[node.parentId]) {
    throw new Error(`Parent "${node.parentId}" does not exist`);
  }
  return { ...scene, nodes: { ...scene.nodes, [node.id]: node } };
}

/** Ids of a node and everything below it. */
export function getSubtreeIds(scene: Scene, rootId: string): string[] {
  const ids = [rootId];
  for (const id of ids) {
    for (const node of Object.values(scene.nodes)) {
      if (node.parentId === id) ids.push(node.id);
    }
  }
  return ids;
}

/** Removes the node and all its descendants. */
export function removeNode(scene: Scene, id: string): Scene {
  if (!scene.nodes[id]) return scene;
  const doomed = new Set(getSubtreeIds(scene, id));
  const nodes = Object.fromEntries(
    Object.entries(scene.nodes).filter(([key]) => !doomed.has(key)),
  );
  return { ...scene, nodes };
}

/** Matches a trailing " (3)" so duplicating "Cube (3)" continues the numbering instead of nesting. */
const COPY_SUFFIX = /\s\(\d+\)$/;

/**
 * Name for a copy: "Cube" becomes "Cube (1)", then "Cube (2)", and so on. Duplicating "Cube (1)"
 * also gives the next free number of "Cube". Takes the lowest number no object is using yet,
 * and shortens the base name if needed so the result stays within the name length limit.
 */
export function uniqueCopyName(scene: Scene, name: string): string {
  const base = name.replace(COPY_SUFFIX, "");
  const taken = new Set(Object.values(scene.nodes).map((node) => node.name));
  for (let n = 1; ; n++) {
    const suffix = ` (${n})`;
    const candidate =
      base.slice(0, NODE_NAME_MAX_LENGTH - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Copies a node and its descendants. `newIds` supplies one fresh id per copied node
 * in the order given by getSubtreeIds (the root first).
 */
export function duplicateNode(
  scene: Scene,
  id: string,
  newIds: string[],
  /** Moves the top copy by this much, so it does not sit exactly on the original. */
  offset: [number, number, number] = [0, 0, 0],
): Scene {
  const source = scene.nodes[id];
  if (!source) throw new Error(`Node "${id}" does not exist`);
  const oldIds = getSubtreeIds(scene, id);
  if (newIds.length !== oldIds.length) {
    throw new Error(`Expected ${oldIds.length} new ids, got ${newIds.length}`);
  }
  const idMap = new Map(oldIds.map((oldId, i) => [oldId, newIds[i]!]));
  const nodes = { ...scene.nodes };
  for (const oldId of oldIds) {
    const original = scene.nodes[oldId]!;
    const copyId = idMap.get(oldId)!;
    nodes[copyId] = {
      ...original,
      id: copyId,
      name: oldId === id ? uniqueCopyName(scene, original.name) : original.name,
      transform:
        oldId === id
          ? {
              ...original.transform,
              position: [
                original.transform.position[0] + offset[0],
                original.transform.position[1] + offset[1],
                original.transform.position[2] + offset[2],
              ],
            }
          : original.transform,
      // The root copy stays beside the original; descendants follow their copied parent
      parentId:
        oldId === id
          ? original.parentId
          : (idMap.get(original.parentId!) ?? null),
    };
  }
  return { ...scene, nodes };
}

export function updateNode(
  scene: Scene,
  id: string,
  changes: Partial<Pick<SceneNode, "name" | "visible" | "color">>,
): Scene {
  const node = scene.nodes[id];
  if (!node) throw new Error(`Node "${id}" does not exist`);
  return { ...scene, nodes: { ...scene.nodes, [id]: { ...node, ...changes } } };
}

export function setTransform(
  scene: Scene,
  id: string,
  transform: Transform,
): Scene {
  const node = scene.nodes[id];
  if (!node) throw new Error(`Node "${id}" does not exist`);
  return { ...scene, nodes: { ...scene.nodes, [id]: { ...node, transform } } };
}

/** Removes several nodes (and everything below them). Ids that are already gone are ignored. */
export function removeNodes(scene: Scene, ids: readonly string[]): Scene {
  return ids.reduce((next, id) => removeNode(next, id), scene);
}

/**
 * Duplicates each selected node that is not already inside another selected node, so a child is
 * not copied twice. `generateId` is called once per new node. Returns the new scene and the ids
 * of the new top copies (for selecting them).
 */
export function duplicateNodes(
  scene: Scene,
  ids: readonly string[],
  generateId: () => string,
  offset: [number, number, number] = [0, 0, 0],
): { scene: Scene; rootIds: string[] } {
  let next = scene;
  const rootIds: string[] = [];
  for (const id of topLevelSelection(scene, ids)) {
    const newIds = getSubtreeIds(next, id).map(() => generateId());
    next = duplicateNode(next, id, newIds, offset);
    rootIds.push(newIds[0]!);
  }
  return { scene: next, rootIds };
}

/** Sets the transform of several nodes in one go. */
export function setTransforms(
  scene: Scene,
  updates: Readonly<Record<string, Transform>>,
): Scene {
  return Object.entries(updates).reduce(
    (next, [id, transform]) => setTransform(next, id, transform),
    scene,
  );
}
