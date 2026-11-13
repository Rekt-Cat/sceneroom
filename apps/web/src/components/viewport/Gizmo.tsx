"use client";

import { useEffect, useRef, type ComponentProps, type ElementRef } from "react";
import { TransformControls } from "@react-three/drei";
import type { Mesh, Object3D } from "three";

type GizmoProps = Omit<ComponentProps<typeof TransformControls>, "ref">;
type Controls = ElementRef<typeof TransformControls>;

/** A part of the library's gizmo: its name is the axis ("X", "Y", "Z"), its tag says which version it is. */
type GizmoPart = Mesh & { tag?: "fwd" | "bwd" };

/**
 * The move gizmo flips an axis to the side facing the camera. For that it keeps a second arrowhead
 * ("bwd"), but the library builds it pointing toward the object, so after the flip the arrow sits on
 * the outer side and points back at the object. This gives each "bwd" arrow the shape of its "fwd"
 * arrow (pointing away from the object); the flip mirrors it to the other side, still pointing away.
 *
 * It reaches into the library's private parts (`gizmo.gizmo.translate`), so if the library is updated,
 * check this still finds them (it does nothing if they are missing).
 */
function pointFlippedArrowsOutward(controls: Controls): void {
  const translate = (
    controls as unknown as {
      gizmo?: { gizmo?: { translate?: Object3D } };
    }
  ).gizmo?.gizmo?.translate;
  if (!translate) return;

  const parts = translate.children as GizmoPart[];
  for (const bwd of parts) {
    if (bwd.tag !== "bwd") continue;
    const fwd = parts.find((p) => p.tag === "fwd" && p.name === bwd.name);
    if (fwd?.geometry) bwd.geometry = fwd.geometry;
  }
}

/** drei's TransformControls, with the flipped-arrow direction fixed. Use it in place of TransformControls. */
export default function Gizmo(props: GizmoProps) {
  const ref = useRef<Controls>(null);
  useEffect(() => {
    if (ref.current) pointFlippedArrowsOutward(ref.current);
  }, []);
  return <TransformControls ref={ref} {...props} />;
}
