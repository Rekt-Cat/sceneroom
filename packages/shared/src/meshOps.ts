import { addAsset, addNode, availableName, createNode } from "./sceneOps";
import { type AssetInfo, type Scene } from "./scene";
import { supportsModifiers } from "./modifiers";
import { NODE_NAME_MAX_LENGTH } from "./scene";
import { meshStats } from "./meshData";
import type { ShapeMesh } from "./modifiers";

/** The record that goes into `scene.assets` for a stored mesh (its data is stored apart, under `id`). */
export function meshAssetInfo(
  id: string,
  name: string,
  mesh: ShapeMesh,
  storedBytes: number,
  /** What to write in the mesh's notes (for example what was applied to make it). */
  note = "",
): AssetInfo {
  const { triangles, boundsMin, boundsMax } = meshStats(mesh);
  return {
    id,
    name: name.slice(0, NODE_NAME_MAX_LENGTH) || "Mesh",
    type: "mesh",
    bytes: storedBytes,
    triangles,
    boundsMin,
    boundsMax,
    note,
  };
}

/**
 * Turns a shape (or a mesh) and its modifiers into a plain editable mesh, in place: the object keeps its
 * place in the scene (position, rotation, scale, parent, children, colour, surface) and becomes a "mesh"
 * object that points to the stored data `info`. Its modifiers and segments are cleared, because they are
 * now part of the points. Throws for an object that cannot be turned into a mesh, or if `info` is not a mesh.
 */
export function bakeToMesh(
  scene: Scene,
  nodeId: string,
  info: AssetInfo,
): Scene {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" does not exist`);
  if (!supportsModifiers(node)) {
    throw new Error(`Node "${nodeId}" cannot be turned into a mesh`);
  }
  if (info.type !== "mesh") throw new Error("The stored data is not a mesh");
  const withData = addAsset(scene, info);
  return {
    ...withData,
    nodes: {
      ...withData.nodes,
      [nodeId]: {
        ...node,
        kind: "mesh",
        assetId: info.id,
        modifiers: [],
        segments: 1,
      },
    },
  };
}

/**
 * Makes an editable mesh object point to a NEW stored version of its mesh (after its points were edited),
 * and records the new version in the scene. The old version stays in the scene's list, which is what lets
 * Undo go back to it. Throws for an object that is not a mesh, or if `info` is not a mesh.
 */
export function replaceMesh(
  scene: Scene,
  nodeId: string,
  info: AssetInfo,
): Scene {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" does not exist`);
  if (node.kind !== "mesh") throw new Error(`Node "${nodeId}" is not a mesh`);
  if (info.type !== "mesh") throw new Error("The stored data is not a mesh");
  const withData = addAsset(scene, info);
  return {
    ...withData,
    nodes: { ...withData.nodes, [nodeId]: { ...node, assetId: info.id } },
  };
}

/** Meshes that no object uses are not worth keeping: the scene without their records (their data is dropped when saving). */
export function pruneUnusedMeshAssets(scene: Scene): Scene {
  const used = new Set<string>();
  for (const node of Object.values(scene.nodes)) {
    if (node.assetId) used.add(node.assetId);
  }
  const entries = Object.entries(scene.assets);
  const kept = entries.filter(
    ([id, info]) => info.type !== "mesh" || used.has(id),
  );
  if (kept.length === entries.length) return scene;
  return { ...scene, assets: Object.fromEntries(kept) };
}

/**
 * Turns a plant object into editable meshes: the object itself becomes a mesh of the wood (it keeps its
 * place, name, colour, children and surface), and, if there are leaves, a new mesh object holding them is
 * added inside it, in the leaf colour and with the same surface. Because the leaves are a child, they move
 * with the wood. The plant settings are cleared (they are baked into the points). Throws for an object that
 * is not a plant, or if either `info` is not a mesh.
 */
export function bakePlantToMeshes(
  scene: Scene,
  nodeId: string,
  barkInfo: AssetInfo,
  leaves: { info: AssetInfo; nodeId: string } | null,
): Scene {
  const node = scene.nodes[nodeId];
  if (!node) throw new Error(`Node "${nodeId}" does not exist`);
  if (!node.plant) throw new Error(`Node "${nodeId}" is not a plant`);
  if (barkInfo.type !== "mesh" || (leaves && leaves.info.type !== "mesh")) {
    throw new Error("The stored data is not a mesh");
  }
  let next = addAsset(scene, barkInfo);
  const leafColor = node.plant.leafColor;
  next = {
    ...next,
    nodes: {
      ...next.nodes,
      [nodeId]: { ...node, kind: "mesh", assetId: barkInfo.id, plant: null },
    },
  };
  if (leaves) {
    next = addAsset(next, leaves.info);
    next = addNode(next, {
      ...createNode(leaves.nodeId, "cube"),
      name: availableName(next, `${node.name} leaves`),
      kind: "mesh",
      parentId: nodeId,
      assetId: leaves.info.id,
      // At the wood's origin, not where a new cube would start (half a unit up), so they line up with it
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: leafColor,
      material: { ...node.material },
    });
  }
  return next;
}
