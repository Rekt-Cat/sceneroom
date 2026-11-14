"use client";

import { useEffect, type RefObject } from "react";
import {
  OrthographicCamera,
  PerspectiveCamera,
  type Camera,
  type Light,
  type LightShadow,
} from "three";

/** The box (or range) a light's shadow picture covers. `left` to `bottom` only apply to sunlight. */
export type ShadowCameraSettings = {
  near: number;
  far: number;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
};

/**
 * Sets the camera a light takes its shadow picture with. React Three Fiber can set these numbers from
 * props (`shadow-camera-left` and so on) but never tells three.js to use them, so they were silently
 * ignored and the shadow area stayed at three.js's default (5 units each way for sunlight). This sets
 * them and refreshes the camera.
 */
export function useShadowCamera(
  lightRef: RefObject<(Light & { shadow: LightShadow }) | null>,
  settings: ShadowCameraSettings,
): void {
  const { near, far, left, right, top, bottom } = settings;
  useEffect(() => {
    const camera = lightRef.current?.shadow.camera;
    if (camera)
      applyShadowCamera(camera, { near, far, left, right, top, bottom });
  }, [lightRef, near, far, left, right, top, bottom]);
}

/** Puts the numbers on the shadow camera and refreshes it (a plain function, so it may change the camera). */
function applyShadowCamera(
  camera: Camera,
  { near, far, left, right, top, bottom }: ShadowCameraSettings,
): void {
  if (camera instanceof OrthographicCamera) {
    if (left !== undefined) camera.left = left;
    if (right !== undefined) camera.right = right;
    if (top !== undefined) camera.top = top;
    if (bottom !== undefined) camera.bottom = bottom;
  }
  if (
    camera instanceof OrthographicCamera ||
    camera instanceof PerspectiveCamera
  ) {
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }
}
