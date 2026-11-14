"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Matrix4,
  Raycaster,
  Vector2,
  type BufferAttribute,
  type BufferGeometry,
  type Group,
  type Mesh,
} from "three";
import {
  allPoints,
  expandToWelded,
  flatFacePoints,
  isEffectivelyLocked,
  nearestPoint,
  selectionAfterBox,
  selectionAfterWeldedClick,
  selectionCentroid,
  weldGroups,
} from "@sceneroom/shared";
import { commitMeshPositions } from "@/meshEdit/commitMeshEdit";
import { buildEditOverlay, type EditOverlay } from "@/meshEdit/editOverlay";
import { copyPositions, transformSelectedLive } from "@/meshEdit/liveEdit";
import { projectPoints } from "@/meshEdit/projectPoints";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import Gizmo from "./Gizmo";
import { markGizmoUsed, shouldIgnoreClick } from "./gizmoGuard";
import { getMesh } from "./meshRegistry";
import { SNAP, toRadians } from "./snapSettings";

/** A click on a point counts when the pointer is within this many pixels of it. */
const PICK_DISTANCE_PX = 12;

/** A press that moves less than this (in pixels) is a click, not the start of a camera drag or a box. */
const CLICK_MOVE_LIMIT_PX = 4;

/** Marks the stand-in geometry a mesh shows while its data is being read (see SceneNodes). */
export const PLACEHOLDER_FLAG = "isMeshPlaceholder";

/**
 * Edit mode in the 3D view: draws the wire lines and a dot on every point of the mesh being edited,
 * lets you click points to select them (Shift to add), and gives the move handle on the selected points.
 * Renders nothing when edit mode is off. Lives inside the Canvas (it needs the camera).
 */
export default function MeshEditor() {
  const nodeId = useEditStore((state) => state.nodeId);
  if (!nodeId) return null;
  // key: a fresh session for each edited object
  return <EditSession key={nodeId} nodeId={nodeId} />;
}

type Bound = { object: Mesh; geometry: BufferGeometry };

function EditSession({ nodeId }: { nodeId: string }) {
  const camera = useThree((state) => state.camera);
  const canvas = useThree((state) => state.gl.domElement);
  const selected = useEditStore((state) => state.selected);
  const snapping = useSceneStore(
    (state) => state.snapEnabled !== state.snapKeyHeld,
  );
  // A locked object cannot be changed: no handle (it may have been locked while it was being edited)
  const locked = useSceneStore((state) =>
    isEffectivelyLocked(state.scene, nodeId),
  );

  // The mesh object on screen, and the geometry it has now. The geometry is replaced after every edit,
  // Undo and Redo (a new stored mesh), so it is checked every frame and everything is attached again.
  const [bound, setBound] = useState<Bound | null>(null);
  useFrame(() => {
    const object = getMesh(nodeId) as Mesh | undefined;
    const geometry = object?.geometry;
    if (!object || !geometry || !geometry.getAttribute("position")) return;
    if (geometry.userData[PLACEHOLDER_FLAG]) return;
    if (bound?.geometry !== geometry || bound?.object !== object) {
      setBound({ object, geometry });
    }
  });

  // The wire lines and dots, on the mesh object itself so they move and turn with it
  const overlayRef = useRef<EditOverlay | null>(null);
  useEffect(() => {
    if (!bound) return;
    const overlay = buildEditOverlay(bound.geometry);
    bound.object.add(overlay.group);
    overlay.setSelected(useEditStore.getState().selected);
    overlayRef.current = overlay;
    return () => {
      overlay.dispose();
      overlayRef.current = null;
    };
  }, [bound]);
  useEffect(() => {
    overlayRef.current?.setSelected(selected);
  }, [selected, bound]);

  // ---- Picking: click a point (Shift adds or removes) ----
  useEffect(() => {
    if (!bound) return;
    let down: { x: number; y: number; moved: boolean } | null = null;

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0 || event.target !== canvas) return;
      // Ctrl or Cmd + drag is the selection box (BoxSelectController)
      if (event.ctrlKey || event.metaKey) return;
      down = { x: event.clientX, y: event.clientY, moved: false };
    }
    function onPointerMove(event: PointerEvent) {
      if (!down) return;
      if (
        Math.hypot(event.clientX - down.x, event.clientY - down.y) >
        CLICK_MOVE_LIMIT_PX
      ) {
        down.moved = true;
      }
    }
    function onPointerUp(event: PointerEvent) {
      const press = down;
      down = null;
      if (!press || press.moved || shouldIgnoreClick() || !bound) return;
      const rect = canvas.getBoundingClientRect();
      // Alt + click: select the whole flat face under the pointer (ready for Extrude)
      if (event.altKey) {
        selectFaceAt(event, rect);
        return;
      }
      const projected = projectPoints(
        bound.object,
        camera,
        rect,
        (bound.geometry.getAttribute("position") as BufferAttribute).array,
      );
      const hit = nearestPoint(
        projected,
        event.clientX,
        event.clientY,
        PICK_DISTANCE_PX,
      );
      const edit = useEditStore.getState();
      // All the points on the spot that was hit are chosen together (a cube has three at each corner), so
      // moving a corner never tears the surface open
      const groups = weldGroups(
        (bound.geometry.getAttribute("position") as BufferAttribute)
          .array as Float32Array,
      );
      edit.setSelected(
        selectionAfterWeldedClick(groups, edit.selected, hit, event.shiftKey),
      );
    }

    /** Selects the flat face the pointer is over (Shift adds it to the selection). Empty space clears. */
    function selectFaceAt(event: PointerEvent, rect: DOMRect) {
      if (!bound) return;
      const edit = useEditStore.getState();
      const pointer = new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster
        .intersectObject(bound.object, false)
        .find((h) => h.object === bound.object && h.faceIndex != null);
      if (!hit || hit.faceIndex == null) {
        if (!event.shiftKey) edit.setSelected([]);
        return;
      }
      const index = bound.geometry.index;
      const positions = (
        bound.geometry.getAttribute("position") as BufferAttribute
      ).array as Float32Array;
      if (!index) return;
      const mesh = { positions, indices: Uint32Array.from(index.array) };
      const groups = weldGroups(positions);
      const face = flatFacePoints(mesh, hit.faceIndex, groups);
      edit.setSelected(
        selectionAfterBox(
          edit.selected,
          expandToWelded(groups, face),
          event.shiftKey,
        ),
      );
    }

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [bound, camera, canvas]);

  // ---- The handle on the selected points: move, turn or scale (W, E, R) ----
  const mode = useSceneStore((state) => state.transformMode);
  const [pivot, setPivot] = useState<Group | null>(null);

  /** Puts the handle at the middle of the selected points, in a plain state (not turned or scaled). */
  function placePivot() {
    if (!pivot || !bound) return;
    const middle = selectionCentroid(
      (bound.geometry.getAttribute("position") as BufferAttribute)
        .array as Float32Array,
      useEditStore.getState().selected,
    );
    if (!middle) return;
    bound.object.updateWorldMatrix(true, false);
    pivot.position.set(...middle).applyMatrix4(bound.object.matrixWorld);
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
  }
  useEffect(placePivot, [pivot, bound, selected]);

  const dragRef = useRef<{
    start: Float32Array;
    pivotInverse: Matrix4;
    selected: readonly number[];
  } | null>(null);

  function onDragStart() {
    if (!pivot || !bound) return;
    markGizmoUsed();
    pivot.updateMatrixWorld();
    dragRef.current = {
      start: copyPositions(bound.geometry),
      pivotInverse: pivot.matrixWorld.clone().invert(),
      selected: useEditStore.getState().selected,
    };
  }

  function onDragMove() {
    const drag = dragRef.current;
    if (!pivot || !bound || !drag) return;
    pivot.updateMatrixWorld();
    bound.object.updateWorldMatrix(true, false);
    // How the handle changed in the 3D view (a move, a turn or a scale, around where it stood) ...
    const change = new Matrix4().multiplyMatrices(
      pivot.matrixWorld,
      drag.pivotInverse,
    );
    // ... as a change in the mesh's own space (the object may be turned, scaled or inside a parent)
    const world = bound.object.matrixWorld;
    const local = new Matrix4()
      .copy(world)
      .invert()
      .multiply(change)
      .multiply(world);
    transformSelectedLive(
      bound.geometry,
      drag.start,
      drag.selected,
      local.elements,
    );
  }

  function onDragEnd() {
    markGizmoUsed();
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || !bound) return;
    const count = drag.selected.length;
    const verb =
      mode === "rotate" ? "Rotate" : mode === "scale" ? "Scale" : "Move";
    void commitMeshPositions(
      nodeId,
      copyPositions(bound.geometry),
      count === 1 ? `${verb} point` : `${verb} ${count} points`,
    ).then(() => placePivot());
    // Back to a plain handle, ready for the next drag
    placePivot();
  }

  return (
    <>
      <group ref={setPivot} />
      {pivot && selected.length > 0 && bound && !locked && (
        <Gizmo
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

/** Selects every point of the mesh being edited (the A key). */
export function selectAllPoints(): void {
  const { nodeId } = useEditStore.getState();
  const geometry = nodeId
    ? ((getMesh(nodeId) as Mesh | undefined)?.geometry as
        BufferGeometry | undefined)
    : undefined;
  const count = geometry?.getAttribute("position")?.count ?? 0;
  useEditStore.getState().setSelected(allPoints(count));
}
