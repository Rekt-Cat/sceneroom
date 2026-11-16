"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, PerspectiveCamera, Sphere, Vector3 } from "three";
import { framingDistance, getSubtreeIds } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useViewStore } from "@/store/viewStore";
import { getMesh } from "./meshRegistry";
import { worldBoxOf } from "./screenBounds";

/** How long the camera takes to glide to the object, in seconds. */
export const FOCUS_SECONDS = 0.35;

/** A direction to look from when the camera is exactly at its target (so there is no direction to keep). */
const FALLBACK_DIRECTION = new Vector3(1, 0.8, 1.4).normalize();

type Glide = {
  fromPosition: Vector3;
  toPosition: Vector3;
  fromTarget: Vector3;
  toTarget: Vector3;
  elapsed: number;
};

/** The box round the objects (and everything inside them) as they are on screen, or null if none can be seen. */
function boxOfNodes(ids: readonly string[]): Box3 | null {
  const { scene } = useSceneStore.getState();
  const all = new Set<string>();
  for (const id of ids) {
    if (scene.nodes[id])
      for (const inside of getSubtreeIds(scene, id)) all.add(inside);
  }
  const total = new Box3();
  for (const id of all) {
    const object = getMesh(id);
    if (!object) continue;
    const box = worldBoxOf(object);
    if (box) total.union(box);
  }
  return total.isEmpty() ? null : total;
}

/**
 * Moves the camera so the requested objects fill the view: the same direction of looking, the orbit point
 * on the middle of the objects, and far enough back that all of them fit. Asked for by double-clicking a row
 * of the scene list, or by the F key. The camera glides (a short, smooth move); touching the camera while it
 * moves stops the glide, and people who asked their system for less motion get a jump instead.
 */
export default function FocusController() {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as {
    target: Vector3;
    update: () => void;
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
  } | null;
  const size = useThree((state) => state.size);
  const glide = useRef<Glide | null>(null);

  // Grabbing the camera stops a glide in progress
  useEffect(() => {
    if (!controls) return;
    const stop = () => {
      glide.current = null;
    };
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener("start", stop);
  }, [controls]);

  useEffect(
    () =>
      useViewStore.subscribe((state, previous) => {
        const request = state.focusRequest;
        if (!request || request === previous.focusRequest) return;
        if (!controls || !(camera instanceof PerspectiveCamera)) return;
        const box = boxOfNodes(request.ids);
        if (!box) return;

        const sphere = box.getBoundingSphere(new Sphere());
        const distance = framingDistance(
          sphere.radius,
          camera.fov,
          size.width / Math.max(size.height, 1),
        );
        // Keep looking the way the camera looks now
        const direction = camera.position.clone().sub(controls.target);
        if (direction.lengthSq() < 1e-9) direction.copy(FALLBACK_DIRECTION);
        direction.normalize();
        const toTarget = sphere.center.clone();
        const toPosition = toTarget
          .clone()
          .addScaledVector(direction, distance);

        const reduceMotion =
          typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotion) {
          camera.position.copy(toPosition);
          controls.target.copy(toTarget);
          controls.update();
          return;
        }
        glide.current = {
          fromPosition: camera.position.clone(),
          toPosition,
          fromTarget: controls.target.clone(),
          toTarget,
          elapsed: 0,
        };
      }),
    [camera, controls, size],
  );

  useFrame((_, delta) => {
    const move = glide.current;
    if (!move || !controls) return;
    move.elapsed += delta;
    const t = Math.min(move.elapsed / FOCUS_SECONDS, 1);
    // Slow at both ends (smoothstep)
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(move.fromPosition, move.toPosition, eased);
    controls.target.lerpVectors(move.fromTarget, move.toTarget, eased);
    controls.update();
    if (t >= 1) glide.current = null;
  });

  return null;
}
