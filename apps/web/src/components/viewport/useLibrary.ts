import { useMemo } from "react";
import { collectProjectModels, type Scene } from "@sceneroom/shared";
import { useProjectStore } from "@/store/projectStore";
import { useSceneStore } from "@/store/sceneStore";

/**
 * What the whole project can use in any scene: the imported models (every scene's records, each file once)
 * and the prefabs. Shared by the Assets tab and the count shown on its label, so the two always agree.
 */
export function useLibrary() {
  const openScene = useSceneStore((state) => state.scene);
  const tabs = useProjectStore((state) => state.scenes);
  const activeSceneId = useProjectStore((state) => state.activeSceneId);
  const parked = useProjectStore((state) => state.parked);
  const prefabs = useProjectStore((state) => state.prefabs);

  // Every scene of the project, the open one first
  const everyScene = useMemo<Scene[]>(
    () => [
      openScene,
      ...tabs
        .filter((t) => t.id !== activeSceneId)
        .map((t) => parked[t.id]!.scene),
    ],
    [openScene, tabs, activeSceneId, parked],
  );
  // The tab lists imported models; the data of editable meshes is internal to the objects that use it
  const models = useMemo(() => collectProjectModels(everyScene), [everyScene]);
  const prefabList = useMemo(
    () => Object.values(prefabs).sort((a, b) => a.name.localeCompare(b.name)),
    [prefabs],
  );
  return { everyScene, models, prefabList };
}
