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
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  FrontSide,
  Mesh,
  type Object3D,
} from "three";
import {
  buildSceneTree,
  cutNodeIds,
  DEFAULT_LIGHTS,
  LIGHT_KINDS,
  isEffectivelyLocked,
  type LightKind,
  type Modifier,
  type ShapeMesh,
  type PrimitiveKind,
  type SceneNode,
  type TreeNode,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import LightObject from "./LightObject";
import { loadMeshData } from "@/assets/meshStorage";
import { useEnvironmentTexture } from "./environmentTexture";
import { buildMeshGeometry, buildShapeGeometry } from "./shapeGeometry";
import ModelObject from "./ModelObject";
import MultiSelectionGizmo from "./MultiSelectionGizmo";
import SelectionGizmo from "./SelectionGizmo";
import { shouldIgnoreClick } from "./gizmoGuard";
import { registerMesh } from "./meshRegistry";
import { OUTLINE_COLOR, OUTLINE_THICKNESS } from "./selectionStyle";

function isLightKind(kind: string): kind is LightKind {
  return (LIGHT_KINDS as readonly string[]).includes(kind);
}

/**
 * The geometry of a shape: its plain form cut into segments, with the object's modifiers (bend, twist,
 * taper) applied. Rebuilt only when the kind, the segments or the modifiers change; the old one is freed.
 */
export function ShapeGeometry({
  kind,
  segments,
  modifiers,
}: {
  kind: PrimitiveKind;
  segments: number;
  modifiers: readonly Modifier[];
}) {
  const geometry = useMemo(
    () => buildShapeGeometry(kind, segments, modifiers),
    [kind, segments, modifiers],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
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
  return geometry;
})();

/**
 * The geometry of an editable mesh: its stored points and triangles with the object's modifiers applied.
 * The stored data is read once (it never changes: an edit makes a new one). While it is being read the
 * object shows nothing; if it is missing or damaged a plain box stands in, and the Inspector says why.
 */
export function MeshGeometry({
  assetId,
  modifiers,
}: {
  assetId: string | null;
  modifiers: readonly Modifier[];
}) {
  const [data, setData] = useState<
    { id: string; mesh: ShapeMesh } | { id: string; failed: true } | null
  >(null);

  useEffect(() => {
    if (!assetId) return;
    let current = true;
    loadMeshData(assetId)
      .then((mesh) => {
        if (current) setData({ id: assetId, mesh });
      })
      .catch((error: unknown) => {
        console.warn("Could not load a mesh:", error);
        if (current) setData({ id: assetId, failed: true });
      });
    return () => {
      current = false;
    };
  }, [assetId]);

  // Only the data that belongs to the current id (the old one may still be in state for a moment)
  const ready = data && data.id === assetId ? data : null;
  const mesh = ready && "mesh" in ready ? ready.mesh : null;
  const geometry = useMemo(
    () => (mesh ? buildMeshGeometry(mesh, modifiers) : null),
    [mesh, modifiers],
  );
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (geometry) return <primitive object={geometry} attach="geometry" />;
  if (ready && "failed" in ready) return <boxGeometry args={[1, 1, 1]} />;
  // While the data is being read: an invisible placeholder, never an object with no geometry at all
  return <primitive object={PLACEHOLDER_GEOMETRY} attach="geometry" />;
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
  const { position, rotation, scale } = node.transform;
  const material = node.material;
  const seeThrough = cut || material.opacity < 1;
  const envTexture = useEnvironmentTexture((state) => state.texture);
  const reflectionStrength = useSceneStore(
    (state) => state.scene.environment.reflectionStrength,
  );

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
    // Shift + click adds or removes this object; a plain click selects only it
    if (event.nativeEvent.shiftKey) toggleSelect(node.id);
    else select(node.id);
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
    >
      {node.kind === "mesh" ? (
        <MeshGeometry assetId={node.assetId} modifiers={node.modifiers} />
      ) : (
        <ShapeGeometry
          kind={node.kind}
          segments={node.segments}
          modifiers={node.modifiers}
        />
      )}
      <meshStandardMaterial
        // A new material when the shading, the side or solid / see-through changes: three.js builds its
        // shader for these (a solid material is compiled to ignore opacity completely)
        key={`${material.flatShading}-${material.doubleSided}-${seeThrough}-${envTexture !== null}`}
        // What the surface reflects. Set on each material (and not left to the scene) so that the
        // object's own Reflection strength can scale it
        envMap={envTexture}
        envMapIntensity={material.reflectionStrength * reflectionStrength}
        color={node.color}
        roughness={material.roughness}
        metalness={material.metalness}
        emissive={material.emissiveColor}
        emissiveIntensity={material.emissiveIntensity}
        flatShading={material.flatShading}
        // A cut object is drawn faded until it is pasted; a see-through one does not hide what is behind it
        transparent={seeThrough}
        opacity={cut ? Math.min(0.4, material.opacity) : material.opacity}
        depthWrite={!seeThrough}
        // A plane has no thickness, so it needs both sides to be seen from behind
        side={material.doubleSided ? DoubleSide : FrontSide}
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
  const [soleObject, setSoleObject] = useState<Object3D | null>(null);

  const tree = useMemo(() => buildSceneTree(scene), [scene]);
  const clipboard = useSceneStore((state) => state.clipboard);
  const cutIds = useMemo(
    () => cutNodeIds(scene, clipboard),
    [scene, clipboard],
  );
  const soleId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null;

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
      {soleId && soleObject && !isEffectivelyLocked(scene, soleId) && (
        <SelectionGizmo object={soleObject} nodeId={soleId} />
      )}
      {selectedIds.length > 1 && <MultiSelectionGizmo ids={selectedIds} />}
    </>
  );
}
