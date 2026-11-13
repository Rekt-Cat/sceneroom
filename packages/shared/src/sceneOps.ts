import {
  NODE_NAME_MAX_LENGTH,
  type PrimitiveKind,
  type Scene,
  type SceneNode,
  type Transform,
} from "./scene";

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
      name:
        oldId === id
          ? `${original.name} copy`.slice(0, NODE_NAME_MAX_LENGTH)
          : original.name,
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
