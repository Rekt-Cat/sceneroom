import { useEffect, useState } from "react";
import type { Texture } from "three";
import { usePaintStore } from "@/store/paintStore";
import { cachedTexture, liveTextureFor, loadColorMap } from "./paintSession";

/**
 * The picture an object's surface shows: the live one while the object is being painted, otherwise its stored
 * colour map (read once, then kept). Null while it loads, or when the object has no colour map.
 */
export function useColorMapTexture(
  nodeId: string,
  colorMapId: string | null,
): Texture | null {
  // Redraw when painting starts or stops on this object, and when Undo or Redo swaps the live picture
  usePaintStore((state) => (state.nodeId === nodeId ? state.version + 1 : 0));
  const [loaded, setLoaded] = useState<{ id: string; texture: Texture } | null>(
    null,
  );
  useEffect(() => {
    if (!colorMapId) return;
    let current = true;
    void loadColorMap(colorMapId).then((texture) => {
      if (current && texture) setLoaded({ id: colorMapId, texture });
    });
    return () => {
      current = false;
    };
  }, [colorMapId]);
  const live = liveTextureFor(nodeId);
  if (live) return live;
  if (!colorMapId) return null;
  return (
    cachedTexture(colorMapId) ??
    (loaded?.id === colorMapId ? loaded.texture : null)
  );
}
