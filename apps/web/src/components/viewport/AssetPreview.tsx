"use client";

import { useEffect, useMemo, useState } from "react";
import { Mesh, type Material, type Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { fitScale, modelOffset } from "@sceneroom/shared";
import { loadModelScene } from "@/assets/loadModel";
import { useSceneStore } from "@/store/sceneStore";
import { useAssetDragStore } from "./assetDrag";

/** How solid the preview looks while an asset is dragged over the 3D view (1 = solid, 0 = invisible). */
export const PREVIEW_OPACITY = 0.4;

const hitNothing = () => undefined;

/**
 * A see-through copy of the model being dragged from the Assets tab, standing on the ground where it
 * would be placed. It disappears on drop and the real, solid object takes its place.
 */
export default function AssetPreview() {
  const assetId = useAssetDragStore((state) => state.assetId);
  const spot = useAssetDragStore((state) => state.spot);
  if (!assetId || !spot) return null;
  return <Ghost assetId={assetId} spot={spot} />;
}

function Ghost({
  assetId,
  spot,
}: {
  assetId: string;
  spot: [number, number, number];
}) {
  const info = useSceneStore((state) => state.scene.assets[assetId]);
  const [root, setRoot] = useState<Object3D | null>(null);

  useEffect(() => {
    let current = true;
    loadModelScene(assetId)
      .then((loaded) => {
        if (current) setRoot(loaded);
      })
      .catch((error: unknown) => {
        // No preview; the drop still works (and shows the usual message if the file is broken)
        console.warn("Could not show the placement preview:", error);
      });
    return () => {
      current = false;
    };
  }, [assetId]);

  // A copy whose materials are also copies: the loaded model's materials are shared with the real
  // objects, and making those see-through would fade every object that uses the file
  const ghost = useMemo(() => {
    if (!root) return null;
    const copy = clone(root);
    copy.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.raycast = hitNothing;
      const fade = (material: Material) => {
        const faded = material.clone();
        faded.transparent = true;
        faded.opacity = PREVIEW_OPACITY;
        faded.depthWrite = false;
        return faded;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(fade)
        : fade(object.material);
    });
    return copy;
  }, [root]);

  // The copied materials are ours: free them when the preview goes away
  useEffect(() => {
    if (!ghost) return;
    return () => {
      ghost.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
    };
  }, [ghost]);

  if (!info || !ghost) return null;
  const scale = fitScale(info);
  const [x, y, z] = modelOffset(info);
  return (
    <group position={spot} scale={[scale, scale, scale]}>
      <group position={[x, y, z]}>
        <primitive object={ghost} />
      </group>
    </group>
  );
}
