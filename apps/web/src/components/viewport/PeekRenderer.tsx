"use client";

import { useFrame } from "@react-three/fiber";
import { renderPeek } from "./peekRender";

/**
 * Draws the four views while the peek is shown. It is only mounted while the peek is on: a frame callback with
 * a priority above 0 makes React Three Fiber stop drawing the normal view itself, so this draws instead, and
 * when it is removed the normal drawing starts again.
 */
export default function PeekRenderer() {
  useFrame(({ gl, scene, size }) => renderPeek(gl, scene, size), 1);
  return null;
}
