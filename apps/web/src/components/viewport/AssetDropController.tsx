"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Raycaster, Vector2 } from "three";
import { groundHit } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { ASSET_DRAG_TYPE, carriesAsset, useAssetDragStore } from "./assetDrag";

/**
 * Lets an asset dragged from the Assets tab be dropped on the 3D view: the new object lands on the
 * ground where the pointer is (or at the middle if the pointer is above the horizon). Lives inside
 * the Canvas because it needs the camera.
 */
export default function AssetDropController() {
  const { gl, camera } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new Raycaster();
    const pointer = new Vector2();

    /** Where on the ground the pointer is (the middle if it is above the horizon). */
    const spotAt = (event: DragEvent): [number, number, number] => {
      const rect = canvas.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const { origin, direction } = raycaster.ray;
      return (
        groundHit(
          [origin.x, origin.y, origin.z],
          [direction.x, direction.y, direction.z],
        ) ?? [0, 0, 0]
      );
    };

    const onDragOver = (event: DragEvent) => {
      if (!carriesAsset(event)) return;
      // Cancelling the event is what allows a drop here
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      // The see-through preview follows the pointer
      useAssetDragStore.getState().setSpot(spotAt(event));
    };

    const onDragLeave = (event: DragEvent) => {
      if (carriesAsset(event)) useAssetDragStore.getState().setSpot(null);
    };

    const onDrop = (event: DragEvent) => {
      if (!carriesAsset(event)) return;
      event.preventDefault();
      const assetId = event.dataTransfer?.getData(ASSET_DRAG_TYPE);
      if (!assetId) return;
      // The preview goes away and the real object appears in its place, at full strength
      const spot = spotAt(event);
      useAssetDragStore.getState().end();
      useSceneStore.getState().placeAsset(assetId, spot);
    };

    canvas.addEventListener("dragover", onDragOver);
    canvas.addEventListener("dragleave", onDragLeave);
    canvas.addEventListener("drop", onDrop);
    return () => {
      canvas.removeEventListener("dragleave", onDragLeave);
      canvas.removeEventListener("dragover", onDragOver);
      canvas.removeEventListener("drop", onDrop);
    };
  }, [gl, camera]);

  return null;
}
