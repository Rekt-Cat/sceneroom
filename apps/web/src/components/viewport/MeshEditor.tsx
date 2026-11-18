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
  edgeVertices,
  buildTopology,
  loopCutPreview,
  pointsNear,
  selectionAfterBox,
  selectionAfterEdgeClick,
  selectionAfterFaceClick,
  selectionAfterWeldedClick,
  selectionCentroid,
  weldGroups,
} from "@sceneroom/shared";
import { commitMeshPositions } from "@/meshEdit/commitMeshEdit";
import { buildEditOverlay, type EditOverlay } from "@/meshEdit/editOverlay";
import { editMeshOf, topologyOfGeometry } from "@/meshEdit/geometryTopology";
import { copyPositions, transformSelectedLive } from "@/meshEdit/liveEdit";
import { projectPoints } from "@/meshEdit/projectPoints";
import { pushSurfaceBack } from "@/meshEdit/surfaceOffset";
import { pickEdge } from "@/meshEdit/pickEdge";
import { startLoopCut } from "@/meshEdit/editOperations";
import { visibleSpots } from "@/meshEdit/visibility";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import Gizmo from "./Gizmo";
import { markGizmoUsed, shouldIgnoreClick } from "./gizmoGuard";
import { getMesh } from "./meshRegistry";
import { SNAP, toRadians } from "./snapSettings";

/** A click on a point counts when the pointer is within this many pixels of it. */
const PICK_DISTANCE_PX = 12;

/** How many of the nearest points or edges are tested for being hidden (the ones further down the list are never reached in practice). */
const MAX_CANDIDATES = 40;

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
  const selectMode = useEditStore((state) => state.selectMode);
  const xray = useEditStore((state) => state.xray);
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
  useEffect(() => {
    overlayRef.current?.setMode(selectMode);
  }, [selectMode, bound]);
  // The creased edges of the mesh (drawn in pink)
  useEffect(() => {
    if (!bound) return;
    overlayRef.current?.setCreases(editMeshOf(bound.geometry)?.creases);
  }, [bound]);
  // The seams of the mesh (drawn in red)
  useEffect(() => {
    if (!bound) return;
    overlayRef.current?.setSeams(editMeshOf(bound.geometry)?.seams);
  }, [bound]);

  // Without X-ray the lines and dots on the far side are hidden by the mesh itself. The mesh is pushed back a
  // little in the depth buffer so the lines lying on its surface are not hidden by it too.
  useEffect(() => {
    overlayRef.current?.setXray(xray);
    if (!bound || xray) return;
    return pushSurfaceBack(bound.object);
  }, [xray, bound]);

  // ---- Loop cut tool: moving over an edge shows where the cut would go (green) ----
  const loopCutMode = useEditStore((state) => state.loopCutMode);
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!bound || !loopCutMode || !overlay) return;
    const mesh = editMeshOf(bound.geometry);
    const topology = mesh ? buildTopology(mesh) : null;
    if (!mesh || !topology) return;
    let last = -2;

    function onMove(event: PointerEvent) {
      if (!bound || !mesh || !topology || event.target !== canvas) return;
      const edge = pickEdge(
        topology,
        projectPoints(
          bound.object,
          camera,
          canvas.getBoundingClientRect(),
          mesh.positions,
        ),
        event.clientX,
        event.clientY,
        PICK_DISTANCE_PX,
        useEditStore.getState().xray,
        bound.object,
        camera,
      );
      if (edge === last) return;
      last = edge;
      overlay?.setCutPreview(
        edge < 0 ? null : loopCutPreview(mesh, topology, edge),
      );
    }
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      overlay.setCutPreview(null);
    };
  }, [loopCutMode, bound, camera, canvas]);

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
      const mode = useEditStore.getState().selectMode;
      // The Loop cut tool: a click on an edge cuts the strip of squares across it
      if (useEditStore.getState().loopCutMode) {
        cutAt(event, rect);
        return;
      }
      if (mode === "edge") {
        selectEdgeAt(event, rect);
        return;
      }
      if (mode === "face" && !event.altKey) {
        selectQuadAt(event, rect);
        return;
      }
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
      const edit = useEditStore.getState();
      const positions = (
        bound.geometry.getAttribute("position") as BufferAttribute
      ).array as Float32Array;
      // The nearest point under the pointer; without X-ray the nearest one that can be SEEN
      const near = pointsNear(
        projected,
        event.clientX,
        event.clientY,
        PICK_DISTANCE_PX,
      ).slice(0, MAX_CANDIDATES);
      const seen = edit.xray
        ? near.map(() => true)
        : visibleSpots(
            near.map(
              (p) =>
                [
                  positions[p * 3]!,
                  positions[p * 3 + 1]!,
                  positions[p * 3 + 2]!,
                ] as const,
            ),
            bound.object,
            camera,
          );
      const hit = near.find((_, i) => seen[i]) ?? -1;
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

    /** Loop cut tool: cuts across the edge under the pointer (nothing happens if none is there). */
    function cutAt(event: PointerEvent, rect: DOMRect) {
      if (!bound) return;
      const topology = topologyOfGeometry(bound.geometry);
      if (!topology) return;
      const edge = pickEdge(
        topology,
        projectPoints(
          bound.object,
          camera,
          rect,
          (bound.geometry.getAttribute("position") as BufferAttribute).array,
        ),
        event.clientX,
        event.clientY,
        PICK_DISTANCE_PX,
        useEditStore.getState().xray,
        bound.object,
        camera,
      );
      if (edge < 0) return;
      const [a, b] = edgeVertices(topology, edge);
      void startLoopCut([
        topology.vertexPoints[a]![0]!,
        topology.vertexPoints[b]![0]!,
      ]);
    }

    /**
     * Edge mode: selects the edge nearest to the pointer. Alt + click selects the whole loop through it (the
     * ring of edges round the shape). Shift adds. Empty space clears.
     */
    function selectEdgeAt(event: PointerEvent, rect: DOMRect) {
      if (!bound) return;
      const topology = topologyOfGeometry(bound.geometry);
      if (!topology) return;
      const edit = useEditStore.getState();
      const projected = projectPoints(
        bound.object,
        camera,
        rect,
        (bound.geometry.getAttribute("position") as BufferAttribute).array,
      );
      // The nearest edge under the pointer; without X-ray the nearest one whose middle can be SEEN
      const edge = pickEdge(
        topology,
        projected,
        event.clientX,
        event.clientY,
        PICK_DISTANCE_PX,
        edit.xray,
        bound.object,
        camera,
      );
      edit.setSelected(
        selectionAfterEdgeClick(
          topology,
          edit.selected,
          edge,
          event.shiftKey,
          event.altKey ? "loop" : "edge",
        ),
      );
      // The clicked edge is what the Loop and Ring buttons work from
      if (edge >= 0) {
        const [a, b] = edgeVertices(topology, edge);
        edit.setAnchorEdge([
          topology.vertexPoints[a]![0]!,
          topology.vertexPoints[b]![0]!,
        ]);
      } else if (!event.shiftKey) {
        edit.setAnchorEdge(null);
      }
    }

    /** Face mode: selects the face (a quad, where the mesh has quads) the pointer is over. Shift adds. */
    function selectQuadAt(event: PointerEvent, rect: DOMRect) {
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
      const topology = hit ? topologyOfGeometry(bound.geometry) : null;
      const face =
        hit && topology ? (topology.triangleFace[hit.faceIndex!] ?? -1) : -1;
      edit.setSelected(
        selectionAfterFaceClick(
          topology ?? buildEmpty(),
          edit.selected,
          face,
          event.shiftKey,
        ),
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

/** A topology with nothing in it (for a click that hit nothing, where no mesh needs to be read). */
function buildEmpty() {
  return buildTopology({
    positions: new Float32Array(0),
    indices: new Uint32Array(0),
  });
}
