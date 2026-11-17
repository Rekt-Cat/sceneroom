"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrthographicCamera, PerspectiveCamera, type Vector3 } from "three";
import { isSideView } from "@sceneroom/shared";
import { useViewStore } from "@/store/viewStore";
import { fitToSize, placeSideCamera } from "./bigViewCamera";
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

  // A resized canvas: the flat camera is sized in pixels
  useEffect(() => {
    if (flat.current && camera === flat.current) fitToSize(flat.current, size);
  }, [size, camera]);

  return null;
}
