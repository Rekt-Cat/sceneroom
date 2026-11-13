"use client";

import type { Object3D } from "three";
import { useSceneStore } from "@/store/sceneStore";
import Gizmo from "./Gizmo";
import { markGizmoUsed } from "./gizmoGuard";
import { SNAP, toRadians } from "./snapSettings";

/**
 * The move / rotate / scale handles on the selected object.
 * While you drag, the gizmo moves the three.js object directly (smooth, no React work).
 * The new transform is written to the store once, when you let go, so one drag = one change
 * (which is what undo/redo will need in Phase 3).
 */
export default function SelectionGizmo({
  object,
  nodeId,
}: {
  object: Object3D;
  nodeId: string;
}) {
  const mode = useSceneStore((state) => state.transformMode);
  // Snap is the toggle, flipped while Shift is held (so Shift gives a temporary snap, or a temporary smooth)
  const snapping = useSceneStore(
    (state) => state.snapEnabled !== state.snapKeyHeld,
  );
  const setNodeTransform = useSceneStore((state) => state.setNodeTransform);

  return (
    <Gizmo
      object={object}
      mode={mode}
      translationSnap={snapping ? SNAP.translate : null}
      rotationSnap={snapping ? toRadians(SNAP.rotateDegrees) : null}
      scaleSnap={snapping ? SNAP.scale : null}
      onMouseDown={markGizmoUsed}
      onMouseUp={() => {
        markGizmoUsed();
        const { position, rotation, scale } = object;
        setNodeTransform(nodeId, {
          position: [position.x, position.y, position.z],
          rotation: [rotation.x, rotation.y, rotation.z],
          scale: [scale.x, scale.y, scale.z],
        });
      }}
    />
  );
}
