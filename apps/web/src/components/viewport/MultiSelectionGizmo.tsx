"use client";

import { useMemo, useRef, useState } from "react";
import { TransformControls } from "@react-three/drei";
import { Matrix4, type Group } from "three";
import type { Transform } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { markGizmoUsed } from "./gizmoGuard";
import { getMesh } from "./meshRegistry";
import { SNAP, toRadians } from "./snapSettings";

/**
 * One gizmo for several selected objects. The handles sit on an invisible "pivot" at the middle of the
 * group. While you drag, the change of the pivot is applied to every selected object, so the group moves,
 * turns or scales as one. When you let go the new transforms go to the store in a single change.
 *
 * Objects are drawn in world space for now (parenting is not rendered yet), so each object's local
 * transform is also its world transform.
 */
export default function MultiSelectionGizmo({ ids }: { ids: string[] }) {
  const mode = useSceneStore((state) => state.transformMode);
  const snapping = useSceneStore(
    (state) => state.snapEnabled !== state.snapKeyHeld,
  );
  const nodes = useSceneStore((state) => state.scene.nodes);
  const setNodeTransforms = useSceneStore((state) => state.setNodeTransforms);
  const [pivot, setPivot] = useState<Group | null>(null);

  // The pivot starts at the average position of the selected objects
  const center = useMemo<[number, number, number]>(() => {
    const positions = ids.flatMap((id) => {
      const node = nodes[id];
      return node ? [node.transform.position] : [];
    });
    const count = Math.max(positions.length, 1);
    return [
      positions.reduce((sum, p) => sum + p[0], 0) / count,
      positions.reduce((sum, p) => sum + p[1], 0) / count,
      positions.reduce((sum, p) => sum + p[2], 0) / count,
    ];
  }, [ids, nodes]);

  // Matrices captured when a drag starts, to apply "how far the pivot moved" to each object
  const dragRef = useRef<{
    pivotInverse: Matrix4;
    starts: Map<string, Matrix4>;
  } | null>(null);

  function onDragStart() {
    if (!pivot) return;
    markGizmoUsed();
    pivot.updateMatrixWorld();
    const starts = new Map<string, Matrix4>();
    for (const id of ids) {
      const object = getMesh(id);
      if (!object) continue;
      object.updateMatrixWorld();
      starts.set(id, object.matrixWorld.clone());
    }
    dragRef.current = {
      pivotInverse: pivot.matrixWorld.clone().invert(),
      starts,
    };
  }

  function onDragMove() {
    const drag = dragRef.current;
    if (!pivot || !drag) return;
    pivot.updateMatrixWorld();
    const change = new Matrix4().multiplyMatrices(
      pivot.matrixWorld,
      drag.pivotInverse,
    );
    for (const [id, start] of drag.starts) {
      const object = getMesh(id);
      if (!object) continue;
      new Matrix4()
        .multiplyMatrices(change, start)
        .decompose(object.position, object.quaternion, object.scale);
    }
  }

  function onDragEnd() {
    markGizmoUsed();
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const updates: Record<string, Transform> = {};
    for (const id of drag.starts.keys()) {
      const object = getMesh(id);
      if (!object) continue;
      const { position, rotation, scale } = object;
      updates[id] = {
        position: [position.x, position.y, position.z],
        rotation: [rotation.x, rotation.y, rotation.z],
        scale: [scale.x, scale.y, scale.z],
      };
    }
    // Put the pivot back to a plain state, ready for the next drag
    if (pivot) {
      pivot.rotation.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
    }
    if (Object.keys(updates).length > 0) setNodeTransforms(updates);
  }

  return (
    <>
      <group ref={setPivot} position={center} />
      {pivot && (
        <TransformControls
          object={pivot}
          mode={mode}
          translationSnap={snapping ? SNAP.translate : null}
          rotationSnap={snapping ? toRadians(SNAP.rotateDegrees) : null}
          scaleSnap={snapping ? SNAP.scale : null}
          onMouseDown={onDragStart}
          onObjectChange={onDragMove}
          onMouseUp={onDragEnd}
        />
      )}
    </>
  );
}
