"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TransformControls } from "@react-three/drei";
import { Matrix4, Vector3, type Group } from "three";
import { topLevelSelection, type Transform } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { markGizmoUsed } from "./gizmoGuard";
import { getMesh } from "./meshRegistry";
import { SNAP, toRadians } from "./snapSettings";

/**
 * One gizmo for several selected objects. The handles sit on an invisible "pivot" at the middle of the
 * group. While you drag, the change of the pivot is applied to every selected object, so the group moves,
 * turns or scales as one. When you let go the new transforms go to the store in a single change.
 *
 * Only the top objects of the selection are moved: a selected child follows its selected parent, and
 * moving it as well would move it twice. Each object's new transform is worked out relative to its own
 * parent, because that is what the scene stores.
 */
export default function MultiSelectionGizmo({ ids }: { ids: string[] }) {
  const mode = useSceneStore((state) => state.transformMode);
  const snapping = useSceneStore(
    (state) => state.snapEnabled !== state.snapKeyHeld,
  );
  const scene = useSceneStore((state) => state.scene);
  const setNodeTransforms = useSceneStore((state) => state.setNodeTransforms);
  const [pivot, setPivot] = useState<Group | null>(null);

  const movingIds = useMemo(() => topLevelSelection(scene, ids), [scene, ids]);

  // Put the pivot at the average position (in the 3D view) of the objects that will move, and reset it
  // to a plain state. Runs after every change to the scene, once the objects have their new positions.
  useLayoutEffect(() => {
    if (!pivot) return;
    const sum = new Vector3();
    const point = new Vector3();
    let count = 0;
    for (const id of movingIds) {
      const object = getMesh(id);
      if (!object) continue;
      object.updateWorldMatrix(true, false);
      sum.add(object.getWorldPosition(point));
      count += 1;
    }
    if (count > 0) pivot.position.copy(sum.divideScalar(count));
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
  }, [pivot, movingIds]);

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
    for (const id of movingIds) {
      const object = getMesh(id);
      if (!object) continue;
      object.updateWorldMatrix(true, false);
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
      // New place in the 3D view, then turned into a transform relative to the parent
      const world = new Matrix4().multiplyMatrices(change, start);
      if (object.parent) {
        object.parent.updateWorldMatrix(true, false);
        world.premultiply(
          new Matrix4().copy(object.parent.matrixWorld).invert(),
        );
      }
      world.decompose(object.position, object.quaternion, object.scale);
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
      <group ref={setPivot} />
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
