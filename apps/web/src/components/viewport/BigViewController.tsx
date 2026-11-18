"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, type Vector3 } from "three";
import { isSideView } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useViewStore } from "@/store/viewStore";
import { fitToSize, placeSideCamera, updateSlab } from "./bigViewCamera";
import { flatMemory, syncFlatBackground } from "./flatBackground";
import { getPerspectiveCamera, setPerspectiveCamera } from "./cameraRegistry";

type Controls = { target: Vector3; update: () => void };

/**
 * Shows the big view the owner chose: the normal 3D view, or a pinned flat side view. A side view replaces the
 * editor's camera by a flat camera framed on the selection; the orbit controls are then told not to turn or pan
 * (zoom still works), see Viewport.tsx. Going back to Perspective puts the normal camera back exactly as it was.
 */
export default function BigViewController() {
  const bigView = useViewStore((state) => state.bigView);
  const camera = useThree((state) => state.camera);
  const set = useThree((state) => state.set);
  const size = useThree((state) => state.size);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as Controls | null;
  const flat = useRef<OrthographicCamera | null>(null);
  const target = useRef<[number, number, number] | null>(null);
  const sizeRef = useRef(size);
  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // Remember the normal camera the first time (before any side view replaces it)
  useEffect(() => {
    if (camera instanceof PerspectiveCamera && !getPerspectiveCamera()) {
      setPerspectiveCamera(camera);
    }
  }, [camera]);

  // A side view takes over the camera; Perspective gives the normal one back
  useEffect(() => {
    const normal = getPerspectiveCamera();
    if (!normal) return;
    if (!isSideView(bigView)) {
      target.current = null;
      set({ camera: normal });
      return;
    }
    const side =
      flat.current ?? new OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    flat.current = side;
    target.current = placeSideCamera(side, bigView, sizeRef.current);
    set({ camera: side });
  }, [bigView, set]);

  // The orbit controls turn round the point the side view looks at, so zooming stays centred on it
  useEffect(() => {
    if (!controls || !target.current) return;
    controls.target.set(...target.current);
    controls.update();
  }, [controls, bigView, camera]);

  // Objects that move, turn or change while a side view is open: the near and far planes follow what is selected
  // (every frame while something is selected, because a gizmo moves the object on screen before the scene data
  // changes), and another selection is framed again (the view cannot be panned to it by hand). Deselecting changes
  // nothing: the view keeps showing the slice it had, so clicking empty space neither throws the view away nor
  // lets the objects in front of the one you were looking at back in.
  const framePending = useRef(false);
  useEffect(
    () =>
      useSceneStore.subscribe((state, before) => {
        if (
          state.selectedIds !== before.selectedIds &&
          state.selectedIds.length > 0
        ) {
          framePending.current = true;
        }
      }),
    [],
  );
  useFrame(() => {
    const side = flat.current;
    if (!side || camera !== side || !isSideView(bigView)) {
      framePending.current = false;
      return;
    }
    if (useSceneStore.getState().selectedIds.length === 0) return;
    if (framePending.current) {
      framePending.current = false;
      target.current = placeSideCamera(side, bigView, sizeRef.current);
      if (controls) {
        controls.target.set(...target.current);
        controls.update();
      }
    } else {
      // The boxes are measured from the objects as they are drawn now (their world matrices are refreshed first)
      updateSlab(side);
    }
  });

  // The flat side views draw a plain background (the sky picture looks like a stray box through a flat camera).
  // The scene's own background is kept and put back when the normal view returns.
  const scene = useThree((state) => state.scene);
  useFrame(() => {
    syncFlatBackground(
      scene,
      flat.current !== null && camera === flat.current,
      flatMemory,
    );
  });

  // A resized canvas: the flat camera is sized in pixels
  useEffect(() => {
    if (flat.current && camera === flat.current) fitToSize(flat.current, size);
  }, [size, camera]);

  return null;
}
