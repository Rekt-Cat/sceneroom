import { useEffect, useState } from "react";
import type { PaintSlot } from "@sceneroom/shared";
import type { Texture } from "three";
import { usePaintStore } from "@/store/paintStore";
import { cachedTexture, liveTextureFor, loadMapTexture } from "./paintSession";

/**
 * The picture an object's surface shows in one slot: the live one while the object is being painted in that slot,
 * otherwise the stored picture (read once, then kept). Null while it loads, or when the object has none.
 */
export function useMapTexture(
  nodeId: string,
  slot: PaintSlot,
  mapId: string | null,
): Texture | null {
  // Redraw when painting starts or stops on this object, and when Undo or Redo swaps the live picture
  usePaintStore((state) => (state.nodeId === nodeId ? state.version + 1 : 0));
  const [loaded, setLoaded] = useState<{ id: string; texture: Texture } | null>(
    null,
  );
  useEffect(() => {
    if (!mapId) return;
    let current = true;
    void loadMapTexture(mapId, slot).then((texture) => {
      if (current && texture) setLoaded({ id: mapId, texture });
    });
    return () => {
      current = false;
    };
  }, [mapId, slot]);
  const live = liveTextureFor(nodeId, slot);
  if (live) return live;
  if (!mapId) return null;
  return (
    cachedTexture(mapId, slot) ?? (loaded?.id === mapId ? loaded.texture : null)
  );
}
