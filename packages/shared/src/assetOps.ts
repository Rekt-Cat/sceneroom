import {
  ASSET_NOTE_MAX_LENGTH,
  NODE_NAME_MAX_LENGTH,
  type AssetInfo,
  type Scene,
} from "./scene";
import { removeNodes } from "./sceneOps";

/** Ids of the objects that show this imported file. */
export function nodesUsingAsset(scene: Scene, assetId: string): string[] {
  return Object.values(scene.nodes)
    .filter((node) => node.assetId === assetId)
    .map((node) => node.id);
}

/** How many objects show each imported file, by asset id (files nobody uses are not listed). */
export function assetUsageCounts(
  scene: Pick<Scene, "nodes">,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of Object.values(scene.nodes)) {
    if (node.assetId) counts[node.assetId] = (counts[node.assetId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Renames an imported file (the name the Assets panel shows). Objects keep their own names. Returns the
 * same scene for an unknown file, an empty name or no change.
 */
export function renameAsset(
  scene: Scene,
  assetId: string,
  name: string,
): Scene {
  const asset = scene.assets[assetId];
  const next = name.trim().slice(0, NODE_NAME_MAX_LENGTH).trim();
  if (!asset || next === "" || next === asset.name) return scene;
  return {
    ...scene,
    assets: { ...scene.assets, [assetId]: { ...asset, name: next } },
  };
}

/** Sets the source / licence note, cut to the allowed length. Same scene if nothing changes. */
export function setAssetNote(
  scene: Scene,
  assetId: string,
  note: string,
): Scene {
  const asset = scene.assets[assetId];
  const next = note.slice(0, ASSET_NOTE_MAX_LENGTH);
  if (!asset || next === asset.note) return scene;
  return {
    ...scene,
    assets: { ...scene.assets, [assetId]: { ...asset, note: next } },
  };
}

/**
 * Forgets an imported file AND removes every object that shows it (with the objects inside them),
 * because an object without its file would only be an empty placeholder. Returns the ids of the removed
 * objects too, so the caller can tidy the selection.
 */
export function removeAsset(
  scene: Scene,
  assetId: string,
): { scene: Scene; removedNodeIds: string[] } {
  if (!scene.assets[assetId]) return { scene, removedNodeIds: [] };
  const users = nodesUsingAsset(scene, assetId);
  const withoutNodes = removeNodes(scene, users);
  const removedNodeIds = Object.keys(scene.nodes).filter(
    (id) => !withoutNodes.nodes[id],
  );
  const assets = Object.fromEntries(
    Object.entries(withoutNodes.assets).filter(([id]) => id !== assetId),
  );
  return { scene: { ...withoutNodes, assets }, removedNodeIds };
}

/**
 * The imported models of the whole project: the union of what its scenes know, each file once. A scene that
 * has a record for a file is the one whose name and note are shown; earlier scenes in `scenes` win (pass the
 * open scene first).
 */
export function collectProjectModels(scenes: readonly Scene[]): AssetInfo[] {
  const byId = new Map<string, AssetInfo>();
  for (const scene of scenes) {
    for (const info of Object.values(scene.assets)) {
      if (info.type === "model" && !byId.has(info.id)) byId.set(info.id, info);
    }
  }
  return [...byId.values()];
}

/** How many objects show each file across all scenes, and in how many scenes. */
export function projectAssetUsage(
  scenes: readonly Scene[],
): Record<string, { objects: number; scenes: number }> {
  const usage: Record<string, { objects: number; scenes: number }> = {};
  for (const scene of scenes) {
    const counts = assetUsageCounts(scene);
    for (const [id, objects] of Object.entries(counts)) {
      const entry = (usage[id] ??= { objects: 0, scenes: 0 });
      entry.objects += objects;
      entry.scenes += 1;
    }
  }
  return usage;
}
