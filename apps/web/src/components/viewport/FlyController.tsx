"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import {
  FLY_KEY_CODES,
  NO_FLY_KEYS,
  flyStep,
  type FlyKeys,
} from "@sceneroom/shared";
import { useViewStore } from "@/store/viewStore";

/** While flying, the point the camera turns round is this far in front of it: close, so it turns on the spot. */
export const LOOK_AROUND_DISTANCE = 0.05;

type Controls = {
  target: Vector3;
  update: () => void;
};

/**
 * Flying the camera, as in the Unity and Unreal scene views: hold the right mouse button and press W A S D to
 * fly (Q down, E up, Ctrl or Cmd for faster). Dragging with the right button still turns the view. While a fly
 * key is held the camera turns on the spot (as if looking round); letting go of the button puts the orbit
 * point back in front of the camera at the distance it had, so orbiting round an object works as before.
 * Without a fly key the right-drag is the usual orbit. The keys do nothing else while the button is held
 * (A, W, E and Q have other jobs the rest of the time).
 */
export default function FlyController() {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const controls = useThree(
    (state) => state.controls,
  ) as unknown as Controls | null;
  const flying = useRef(false);
  const lookingAround = useRef(false);
  const orbitDistance = useRef(0);
  const down = useRef<FlyKeys>({ ...NO_FLY_KEYS });
  const fast = useRef(false);

  useEffect(() => {
    if (!controls) return;
    const forward = new Vector3();

    /** The camera turns on the spot from now on: the point it turns round moves right in front of it. */
    function startLookingAround() {
      if (lookingAround.current || !controls) return;
      orbitDistance.current = camera.position.distanceTo(controls.target);
      camera.getWorldDirection(forward);
      controls.target
        .copy(camera.position)
        .addScaledVector(forward, LOOK_AROUND_DISTANCE);
      lookingAround.current = true;
    }

    /** Puts the point the camera orbits back in front of it, as far away as it was. */
    function stopLookingAround() {
      if (!lookingAround.current || !controls) return;
      camera.getWorldDirection(forward);
      controls.target
        .copy(camera.position)
        .addScaledVector(forward, orbitDistance.current);
      controls.update();
      lookingAround.current = false;
    }

    function release() {
      if (!flying.current) return;
      flying.current = false;
      down.current = { ...NO_FLY_KEYS };
      stopLookingAround();
      useViewStore.getState().setFlying(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (!event.isTrusted || event.button !== 2 || event.target !== canvas)
        return;
      flying.current = true;
      useViewStore.getState().setFlying(true);
    }
    function onPointerUp(event: PointerEvent) {
      if (event.button === 2) release();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!flying.current) return;
      fast.current = event.ctrlKey || event.metaKey;
      const key = FLY_KEY_CODES[event.code];
      if (!key) return;
      // These keys fly now; nothing else may act on them
      event.preventDefault();
      event.stopImmediatePropagation();
      down.current = { ...down.current, [key]: true };
      startLookingAround();
      useViewStore.getState().markFlew();
    }
    function onKeyUp(event: KeyboardEvent) {
      fast.current = event.ctrlKey || event.metaKey;
      const key = FLY_KEY_CODES[event.code];
      if (!key) return;
      down.current = { ...down.current, [key]: false };
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", release);
      release();
    };
  }, [camera, canvas, controls]);

  const forward = useRef(new Vector3());
  useFrame((_, delta) => {
    if (!flying.current || !controls) return;
    const keys = down.current;
    if (!Object.values(keys).some(Boolean)) return;
    camera.getWorldDirection(forward.current);
    const distance = lookingAround.current
      ? orbitDistance.current
      : camera.position.distanceTo(controls.target);
    const [x, y, z] = flyStep(
      keys,
      [forward.current.x, forward.current.y, forward.current.z],
      distance,
      fast.current,
      delta,
    );
    // The camera and the point it turns round move together
    camera.position.add(forward.current.set(x, y, z));
    controls.target.add(forward.current);
    controls.update();
  });

  return null;
}
