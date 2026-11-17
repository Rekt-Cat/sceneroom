import { Box3 } from "three";
import { getSubtreeIds } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { getMesh } from "./meshRegistry";
import { worldBoxOf } from "./screenBounds";

/** The box round the objects (and everything inside them) as they are on screen, or null if none can be seen. */
export function boxOfNodes(ids: readonly string[]): Box3 | null {
  const { scene } = useSceneStore.getState();
  const all = new Set<string>();
  for (const id of ids) {
    if (scene.nodes[id])
      for (const inside of getSubtreeIds(scene, id)) all.add(inside);
  }
  const total = new Box3();
  for (const id of all) {
    const object = getMesh(id);
    if (!object) continue;
    const box = worldBoxOf(object);
    if (box) total.union(box);
  }
  return total.isEmpty() ? null : total;
}

/**
 * The box round what the four-view peek and the big side views look at: the selected objects, or the whole
 * scene when nothing is selected. A small box round the middle if there is nothing to measure.
 */
export function viewBox(): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const { scene, selectedIds } = useSceneStore.getState();
  const ids = selectedIds.length > 0 ? selectedIds : Object.keys(scene.nodes);
  const box = boxOfNodes(ids);
  if (!box) return { min: [-1, 0, -1], max: [1, 2, 1] };
  return {
    min: [box.min.x, box.min.y, box.min.z],
    max: [box.max.x, box.max.y, box.max.z],
  };
}
