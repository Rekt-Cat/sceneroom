import type { Mesh } from "three";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { useViewStore } from "@/store/viewStore";
import { getMesh } from "./meshRegistry";

/** True if the object as drawn has a UV map (a shape or mesh that a modifier or tool took the map from has none). */
export function hasUvs(nodeId: string): boolean {
  const object = getMesh(nodeId) as Mesh | undefined;
  return !object?.geometry || object.geometry.getAttribute("uv") !== undefined;
}

/**
 * Turns the UV checker on or off for one object. Turning it on says so when the object has no UV map (a modifier
 * or a tool removed it), because the checker cannot be shown on it.
 */
export function setChecker(nodeId: string, on: boolean): void {
  useViewStore.getState().setChecker(nodeId, on);
  if (!on || hasUvs(nodeId)) return;
  const name =
    useSceneStore.getState().scene.nodes[nodeId]?.name ?? "This object";
  useImportStore.getState().setMessage({
    tone: "info",
    text: `"${name}" has no UV map, so the checker cannot be shown on it. Smooth, Thicken and most edit tools remove the map; Unwrap makes a new one (coming soon).`,
  });
}
