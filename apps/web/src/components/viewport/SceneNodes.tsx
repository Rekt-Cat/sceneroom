"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import { BufferAttribute, BufferGeometry, Mesh, type Object3D } from "three";
import {
  buildSceneTree,
  cutNodeIds,
  DEFAULT_CHARACTER,
  DEFAULT_LIGHTS,
  DEFAULT_PLANT,
  LIGHT_KINDS,
  isEffectivelyLocked,
  type LightKind,
  type Modifier,
  type ShapeMesh,
  type PrimitiveKind,
  type SceneNode,
  type TreeNode,
} from "@sceneroom/shared";
import { useViewStore } from "@/store/viewStore";
import { useSceneStore } from "@/store/sceneStore";
import LightObject from "./LightObject";
import { loadMeshData, peekMeshData } from "@/assets/meshStorage";
import { useEditStore } from "@/store/editStore";
import { PLACEHOLDER_FLAG } from "./MeshEditor";
import CharacterObject from "./CharacterObject";
import PlantObject from "./PlantObject";
import SurfaceMaterial from "./SurfaceMaterial";
import { buildMeshGeometry, buildShapeGeometry } from "./shapeGeometry";
import ModelObject from "./ModelObject";
import MultiSelectionGizmo from "./MultiSelectionGizmo";
import SelectionGizmo from "./SelectionGizmo";
import { shouldIgnoreClick } from "./gizmoGuard";
import { registerMesh } from "./meshRegistry";
import { endStroke, paintTouch } from "@/paint/paintSession";
import { useMapTexture } from "@/paint/useMapTexture";
import { usePaintStore } from "@/store/paintStore";
import { OUTLINE_COLOR, OUTLINE_THICKNESS } from "./selectionStyle";

function isLightKind(kind: string): kind is LightKind {
  return (LIGHT_KINDS as readonly string[]).includes(kind);
}

/**
 * What an editable mesh shows while its data is still being read: one triangle with no area, so nothing is
 * drawn. An object must never be left with NO points: the selection outline works out smoothed normals for
 * the geometry it sits on and fails on an empty one, which crashed the whole 3D view. Shared by all meshes
 * and never freed (nothing is allowed to dispose it).
 */
const PLACEHOLDER_GEOMETRY = (() => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(9), 3),
  );
  geometry.setIndex([0, 1, 2]);
  // Edit mode must not mistake it for the real mesh
  geometry.userData[PLACEHOLDER_FLAG] = true;
  return geometry;
})();

/** Marks a geometry as not being the object's real mesh (edit mode waits for the real one). */
function markAsStandIn(geometry: BufferGeometry): void {
  geometry.userData[PLACEHOLDER_FLAG] = true;
}

/** What a geometry is built from. `mesh: null` = a stored mesh that could not be read (a plain box stands in). */
type GeometrySource =
  | {
      type: "shape";
      kind: PrimitiveKind;
      segments: number;
      modifiers: readonly Modifier[];
    }
  | { type: "mesh"; mesh: ShapeMesh | null; modifiers: readonly Modifier[] };

function sameSource(a: GeometrySource, b: GeometrySource | null): boolean {
  if (!b || a.modifiers !== b.modifiers) return false;
  if (a.type === "shape") {
    return b.type === "shape" && a.kind === b.kind && a.segments === b.segments;
  }
  return b.type === "mesh" && a.mesh === b.mesh;
}

/** The stored data of a mesh: undefined while it is being read, null if it is missing or damaged. */
function useStoredMesh(assetId: string | null): ShapeMesh | null | undefined {
  const [data, setData] = useState<{
    id: string;
    mesh: ShapeMesh | null;
  } | null>(null);

  useEffect(() => {
    if (!assetId) return;
    let current = true;
    loadMeshData(assetId)
      .then((mesh) => {
        if (current) setData({ id: assetId, mesh });
      })
      .catch((error: unknown) => {
        console.warn("Could not load a mesh:", error);
        if (current) setData({ id: assetId, mesh: null });
      });
    return () => {
      current = false;
    };
  }, [assetId]);

  if (!assetId) return undefined;
  // A mesh that is already in memory (just stored by an edit, or brought back by Undo or Redo) is shown in
  // the same frame. Otherwise only data that belongs to the current id counts (an old one may be in state)
  return (
    peekMeshData(assetId) ?? (data?.id === assetId ? data.mesh : undefined)
  );
}

/**
 * The geometry of a shape or an editable mesh, with the object's modifiers applied. It is rebuilt only when what
 * it is made from changes, and the old one is freed.
 *
 * While a new stored mesh is still being read, **what was shown before stays on screen**: in a shared project the
 * new file comes from the server and can take seconds, and the object must not vanish meanwhile. It is marked as
 * a stand-in then, so edit mode does not take it for the real mesh. With nothing shown before (an object that
 * has just appeared), an invisible placeholder is used.
 */
function NodeGeometry({
  kind,
  assetId,
  segments,
  modifiers,
}: {
  kind: PrimitiveKind | "mesh";
  assetId: string | null;
  segments: number;
  modifiers: readonly Modifier[];
}) {
  const stored = useStoredMesh(kind === "mesh" ? assetId : null);
  const wanted: GeometrySource | null =
    kind !== "mesh"
      ? { type: "shape", kind, segments, modifiers }
      : stored === undefined
        ? null
        : { type: "mesh", mesh: stored, modifiers };

  // The last source that could be drawn (remembered during render, React's way to keep the previous value)
  const [held, setHeld] = useState<GeometrySource | null>(wanted);
  if (wanted && !sameSource(wanted, held)) setHeld(wanted);
  const source = wanted ?? held;

  const type = source?.type;
  const shapeKind = source?.type === "shape" ? source.kind : null;
  const shapeSegments = source?.type === "shape" ? source.segments : 0;
  const mesh = source?.type === "mesh" ? source.mesh : null;
  const sourceModifiers = source?.modifiers;
  const geometry = useMemo(() => {
    if (type === "shape" && shapeKind && sourceModifiers) {
      return buildShapeGeometry(shapeKind, shapeSegments, sourceModifiers);
    }
    return mesh && sourceModifiers
      ? buildMeshGeometry(mesh, sourceModifiers)
      : null;
  }, [type, shapeKind, shapeSegments, mesh, sourceModifiers]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  const standIn = wanted === null;
  useEffect(() => {
    // Edit mode must not mistake the previous shape for the mesh that is still on its way
    if (standIn && geometry) markAsStandIn(geometry);
  }, [standIn, geometry]);

  if (geometry) return <primitive object={geometry} attach="geometry" />;
  if (type === "mesh") return <boxGeometry args={[1, 1, 1]} />;
  // Nothing to show yet: an invisible placeholder, never an object with no geometry at all
  return <primitive object={PLACEHOLDER_GEOMETRY} attach="geometry" />;
}

/** The geometry of a shape (see NodeGeometry). */
export function ShapeGeometry(props: {
  kind: PrimitiveKind;
  segments: number;
  modifiers: readonly Modifier[];
}) {
  return <NodeGeometry assetId={null} {...props} />;
}

/** The geometry of an editable mesh (see NodeGeometry). */
export function MeshGeometry(props: {
  assetId: string | null;
  modifiers: readonly Modifier[];
}) {
  return <NodeGeometry kind="mesh" segments={1} {...props} />;
}

/**
 * three.js still hit-tests objects that are hidden (`visible={false}`), so a hidden object would
 * swallow clicks meant for the objects behind it. Hidden meshes get this "hit nothing" version.
 */
const hitNothing = () => undefined;

function NodeMesh({
  node,
  selected,
  soleSelected,
  onSoleSelectedMesh,
  ancestorHidden,
  ancestorLocked,
  cut,
  children,
}: {
  node: SceneNode;
  selected: boolean;
  /** True when this is the only selected object (it then gets the single-object gizmo). */
  soleSelected: boolean;
  /** Called with the three.js object while it is the only selected one, and with null afterwards. */
  onSoleSelectedMesh: (object: Object3D | null) => void;
  /** True if something this object sits inside is hidden (so it is hidden too, even if it is "visible"). */
  ancestorHidden: boolean;
  /** True if something this object sits inside is locked (so it is locked too). */
  ancestorLocked: boolean;
  /** True if the object is marked as cut (waiting to be pasted): it is drawn faded. */
  cut: boolean;
  /** The objects inside this one. Drawn as children of this mesh, so they move, turn and scale with it. */
  children?: ReactNode;
}) {
  const select = useSceneStore((state) => state.select);
  const toggleSelect = useSceneStore((state) => state.toggleSelect);
  const checker = useViewStore((state) => state.checkerIds.has(node.id));
  const colorMap = useMapTexture(node.id, "colorMap", node.material.colorMap);
  const normalMap = useMapTexture(
    node.id,
    "normalMap",
    node.material.normalMap,
  );
  const surfaceMap = useMapTexture(
    node.id,
    "surfaceMap",
    node.material.surfaceMap,
  );
  const painting = usePaintStore((state) => state.nodeId === node.id);
  const { position, rotation, scale } = node.transform;
  const material = node.material;

  // Must keep the same identity between renders: React calls a changed ref callback again every render
  const nodeId = node.id;
  const setMesh = useCallback(
    (object: Object3D | null) => {
      registerMesh(nodeId, object);
      if (soleSelected) onSoleSelectedMesh(object);
    },
    [nodeId, soleSelected, onSoleSelectedMesh],
  );

  const interactive =
    node.visible && !ancestorHidden && !node.locked && !ancestorLocked;

  function handleClick(event: ThreeEvent<MouseEvent>) {
    // Only the nearest object under the pointer gets the click
    event.stopPropagation();
    if (shouldIgnoreClick()) return;
    // Painting: the clicks are brush strokes (handled on pointer down), not selection
    if (painting) return;
    // Editing this object's points: a click on its surface is for picking points (MeshEditor), and Shift +
    // click must not toggle the object out of the selection (that would end edit mode)
    if (useEditStore.getState().nodeId === node.id) return;
    // Shift + click adds or removes this object; a plain click selects only it
    if (event.nativeEvent.shiftKey) toggleSelect(node.id);
    else select(node.id);
  }

  // The brush: the left button paints where the pointer is on the surface (the UV map says where on the picture)
  function handlePaintDown(event: ThreeEvent<PointerEvent>) {
    if (event.button !== 0 || !event.uv) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    paintTouch([event.uv.x, event.uv.y]);
  }
  function handlePaintMove(event: ThreeEvent<PointerEvent>) {
    if (event.buttons !== 1 || !event.uv) return;
    event.stopPropagation();
    paintTouch([event.uv.x, event.uv.y]);
  }
  function handlePaintUp(event: ThreeEvent<PointerEvent>) {
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    endStroke();
  }

  // A light: a group holding the light and its marker. Like a model, it only takes clicks when it can be edited.
  if (isLightKind(node.kind)) {
    return (
      <group
        ref={setMesh}
        userData={{ nodeId: node.id }}
        visible={node.visible}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={interactive ? handleClick : undefined}
      >
        <LightObject
          kind={node.kind}
          // A light object always has its settings; the default only guards against damaged data
          light={node.light ?? DEFAULT_LIGHTS[node.kind]}
          selected={selected}
        />
        {children}
      </group>
    );
  }

  // A character: a group holding its skeleton of bones with the body parts on them. Like a model, it only
  // takes clicks when it can be edited.
  if (node.kind === "character") {
    return (
      <group
        ref={setMesh}
        userData={{ nodeId: node.id }}
        visible={node.visible}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={interactive ? handleClick : undefined}
      >
        <CharacterObject
          // A character object always has its settings; the default only guards against damaged data
          character={node.character ?? DEFAULT_CHARACTER}
          material={material}
          selected={selected}
          cut={cut}
        />
        {children}
      </group>
    );
  }

  // A plant: a group holding the wood and the leaves grown from its settings. Like a model, it only takes
  // clicks when it can be edited.
  if (node.kind === "plant") {
    return (
      <group
        ref={setMesh}
        userData={{ nodeId: node.id }}
        visible={node.visible}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={interactive ? handleClick : undefined}
      >
        <PlantObject
          // A plant object always has its settings; the default only guards against damaged data
          plant={node.plant ?? DEFAULT_PLANT}
          color={node.color}
          material={material}
          selected={selected}
          cut={cut}
        />
        {children}
      </group>
    );
  }

  // An imported model: a group holding the loaded file. A group has no `raycast` of its own that
  // covers the model inside it, so hidden and locked models simply get no click handler (an object
  // without a handler is not tested for clicks at all).
  if (node.kind === "model") {
    return (
      <group
        ref={setMesh}
        userData={{ nodeId: node.id }}
        visible={node.visible}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={interactive ? handleClick : undefined}
      >
        <ModelObject
          assetId={node.assetId}
          selected={selected}
          cut={cut}
          castShadow={material.castShadow}
          receiveShadow={material.receiveShadow}
        />
        {children}
      </group>
    );
  }

  return (
    <mesh
      ref={setMesh}
      userData={{ nodeId: node.id }}
      visible={node.visible}
      raycast={
        // Hidden and locked objects let clicks pass through to whatever is behind them
        node.visible && !ancestorHidden && !node.locked && !ancestorLocked
          ? Mesh.prototype.raycast
          : hitNothing
      }
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow={material.castShadow}
      receiveShadow={material.receiveShadow}
      onClick={handleClick}
      onPointerDown={painting ? handlePaintDown : undefined}
      onPointerMove={painting ? handlePaintMove : undefined}
      onPointerUp={painting ? handlePaintUp : undefined}
    >
      {/* One component for shapes and meshes, so a shape turned into a mesh keeps showing until the mesh is here */}
      <NodeGeometry
        kind={node.kind}
        assetId={node.assetId}
        segments={node.segments}
        modifiers={node.modifiers}
      />
      <SurfaceMaterial
        color={node.color}
        material={material}
        cut={cut}
        checker={checker}
        colorMap={colorMap}
        surfaceMap={surfaceMap}
        normalMap={normalMap}
      />
      {selected && (
        <Outlines color={OUTLINE_COLOR} thickness={OUTLINE_THICKNESS} />
      )}
      {children}
    </mesh>
  );
}

/** One node and, inside it, its children, all the way down. */
function NodeTree({
  entry,
  selectedIds,
  soleId,
  onSoleSelectedMesh,
  cutIds,
  ancestorHidden = false,
  ancestorLocked = false,
}: {
  entry: TreeNode;
  cutIds: ReadonlySet<string>;
  selectedIds: string[];
  soleId: string | null;
  onSoleSelectedMesh: (object: Object3D | null) => void;
  ancestorHidden?: boolean;
  ancestorLocked?: boolean;
}) {
  const { node, children } = entry;
  return (
    <NodeMesh
      node={node}
      selected={selectedIds.includes(node.id)}
      soleSelected={node.id === soleId}
      onSoleSelectedMesh={onSoleSelectedMesh}
      ancestorHidden={ancestorHidden}
      ancestorLocked={ancestorLocked}
      cut={cutIds.has(node.id)}
    >
      {children.map((child) => (
        <NodeTree
          key={child.node.id}
          entry={child}
          selectedIds={selectedIds}
          soleId={soleId}
          onSoleSelectedMesh={onSoleSelectedMesh}
          ancestorHidden={ancestorHidden || !node.visible}
          ancestorLocked={ancestorLocked || node.locked}
          cutIds={cutIds}
        />
      ))}
    </NodeMesh>
  );
}

/**
 * Draws the scene from the store: each object inside its parent, so a parent's position, rotation and
 * scale carry over to everything in it. Plus the gizmo on the selection.
 */
export default function SceneNodes() {
  const scene = useSceneStore((state) => state.scene);
  const selectedIds = useSceneStore((state) => state.selectedIds);
  const peekActive = useViewStore((state) => state.peekActive);
  const [soleObject, setSoleObject] = useState<Object3D | null>(null);

  const tree = useMemo(() => buildSceneTree(scene), [scene]);
  const clipboard = useSceneStore((state) => state.clipboard);
  const cutIds = useMemo(
    () => cutNodeIds(scene, clipboard),
    [scene, clipboard],
  );
  const soleId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null;
  // While the points of an object are being edited, its own move handle is not shown (the points have one)
  const editingId = useEditStore((state) => state.nodeId);

  return (
    <>
      {tree.map((entry) => (
        <NodeTree
          key={entry.node.id}
          entry={entry}
          selectedIds={selectedIds}
          soleId={soleId}
          onSoleSelectedMesh={setSoleObject}
          cutIds={cutIds}
        />
      ))}
      {/* The four-view peek only looks: no handles in its tiles */}
      {!peekActive &&
        soleId &&
        soleObject &&
        soleId !== editingId &&
        !isEffectivelyLocked(scene, soleId) && (
          <SelectionGizmo object={soleObject} nodeId={soleId} />
        )}
      {!peekActive && selectedIds.length > 1 && (
        <MultiSelectionGizmo ids={selectedIds} />
      )}
    </>
  );
}
