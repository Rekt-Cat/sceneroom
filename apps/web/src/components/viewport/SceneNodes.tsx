"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import { DoubleSide, FrontSide, Mesh, type Object3D } from "three";
import {
  buildSceneTree,
  isEffectivelyLocked,
  type PrimitiveKind,
  type SceneNode,
  type TreeNode,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import ModelObject from "./ModelObject";
import MultiSelectionGizmo from "./MultiSelectionGizmo";
import SelectionGizmo from "./SelectionGizmo";
import { shouldIgnoreClick } from "./gizmoGuard";
import { registerMesh } from "./meshRegistry";
import { OUTLINE_COLOR, OUTLINE_THICKNESS } from "./selectionStyle";

/** One geometry per primitive kind; all are about 1 unit in size. */
function Geometry({ kind }: { kind: PrimitiveKind }) {
  switch (kind) {
    case "cube":
      return <boxGeometry args={[1, 1, 1]} />;
    case "sphere":
      return <sphereGeometry args={[0.5, 32, 16]} />;
    case "cylinder":
      return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
    case "plane":
      return <planeGeometry args={[1, 1]} />;
    case "cone":
      return <coneGeometry args={[0.5, 1, 32]} />;
  }
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
  /** The objects inside this one. Drawn as children of this mesh, so they move, turn and scale with it. */
  children?: ReactNode;
}) {
  const select = useSceneStore((state) => state.select);
  const toggleSelect = useSceneStore((state) => state.toggleSelect);
  const { position, rotation, scale } = node.transform;

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

  // An imported model: a group holding the loaded file. A group has no `raycast` of its own that
  // covers the model inside it, so hidden and locked models simply get no click handler (an object
  // without a handler is not tested for clicks at all).
  if (node.kind === "model") {
    return (
      <group
        ref={setMesh}
        visible={node.visible}
        position={position}
        rotation={rotation}
        scale={scale}
        onClick={interactive ? handleClick : undefined}
      >
        <ModelObject assetId={node.assetId} selected={selected} />
        {children}
      </group>
    );
  }

  return (
    <mesh
      ref={setMesh}
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
      onClick={handleClick}
    >
      <Geometry kind={node.kind} />
      {/* A plane has no thickness; by default its back face is not drawn, so it vanishes from behind */}
      <meshStandardMaterial
        color={node.color}
        roughness={node.roughness}
        metalness={node.metalness}
        side={node.kind === "plane" ? DoubleSide : FrontSide}
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
  ancestorHidden = false,
  ancestorLocked = false,
}: {
  entry: TreeNode;
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
        />
      ))}
      {soleId && soleObject && !isEffectivelyLocked(scene, soleId) && (
        <SelectionGizmo object={soleObject} nodeId={soleId} />
      )}
      {selectedIds.length > 1 && <MultiSelectionGizmo ids={selectedIds} />}
    </>
  );
}
