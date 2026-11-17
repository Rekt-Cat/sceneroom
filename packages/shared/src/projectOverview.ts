import type { Prefab } from "./prefab";
import type { AssetInfo, Scene } from "./scene";

/** What a scene holds, for the project overview. */
export type SceneSummary = {
  /** Every object (lights and shapes too). */
  objects: number;
  lights: number;
  /** Copies of prefabs. */
  prefabInstances: number;
  /** The triangles of every object that shows a model or an editable mesh (counted once per object). */
  triangles: number;
};

export function summariseScene(scene: Scene): SceneSummary {
  let lights = 0;
  let prefabInstances = 0;
  let triangles = 0;
  const nodes = Object.values(scene.nodes);
  for (const node of nodes) {
    if (
      node.kind === "directional" ||
      node.kind === "point" ||
      node.kind === "spot"
    ) {
      lights += 1;
    }
    if (node.prefab) prefabInstances += 1;
    if (node.assetId) triangles += scene.assets[node.assetId]?.triangles ?? 0;
  }
  return { objects: nodes.length, lights, prefabInstances, triangles };
}

/**
 * The imported models that nothing shows: no object in any scene and no prefab uses them. They only take
 * room in the Assets tab, so the overview offers to remove them.
 */
export function unusedModels(
  scenes: readonly Scene[],
  prefabs: readonly Prefab[],
  models: readonly AssetInfo[],
): AssetInfo[] {
  const used = new Set<string>();
  for (const scene of scenes) {
    for (const node of Object.values(scene.nodes)) {
      if (node.assetId) used.add(node.assetId);
    }
  }
  for (const prefab of prefabs) {
    for (const node of prefab.nodes) if (node.assetId) used.add(node.assetId);
  }
  return models.filter((model) => !used.has(model.id));
}
