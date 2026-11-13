"use client";

import { useCallback, useState } from "react";
import { Outlines } from "@react-three/drei";
import { DoubleSide, FrontSide, type Object3D } from "three";
import type { PrimitiveKind, SceneNode } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import MultiSelectionGizmo from "./MultiSelectionGizmo";
import SelectionGizmo from "./SelectionGizmo";
import { shouldIgnoreClick } from "./gizmoGuard";
import { registerMesh } from "./meshRegistry";

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

/** Selection outline: thickness is in screen pixels (screenspace is off). */
const OUTLINE_COLOR = "#ffb020";
const OUTLINE_THICKNESS = 3;

function NodeMesh({
  node,
  selected,
  soleSelected,
  onSoleSelectedMesh,
}: {
  node: SceneNode;
  selected: boolean;
  /** True when this is the only selected object (it then gets the single-object gizmo). */
  soleSelected: boolean;
  /** Called with the three.js object while it is the only selected one, and with null afterwards. */
  onSoleSelectedMesh: (object: Object3D | null) => void;
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

  return (
    <mesh
      ref={setMesh}
      visible={node.visible}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(event) => {
        // Only the nearest mesh under the pointer gets the click
        event.stopPropagation();
        if (shouldIgnoreClick()) return;
        // Shift + click adds or removes this object; a plain click selects only it
        if (event.nativeEvent.shiftKey) toggleSelect(node.id);
        else select(node.id);
      }}
    >
      <Geometry kind={node.kind} />
      {/* A plane has no thickness; by default its back face is not drawn, so it vanishes from behind */}
      <meshStandardMaterial
        color={node.color}
        side={node.kind === "plane" ? DoubleSide : FrontSide}
      />
      {selected && (
        <Outlines color={OUTLINE_COLOR} thickness={OUTLINE_THICKNESS} />
      )}
    </mesh>
  );
}

/** Draws every node in the scene store, plus the gizmo on the selection. */
export default function SceneNodes() {
  const nodes = useSceneStore((state) => state.scene.nodes);
  const selectedIds = useSceneStore((state) => state.selectedIds);
  const [soleObject, setSoleObject] = useState<Object3D | null>(null);

  const soleId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null;

  return (
    <>
      {Object.values(nodes).map((node) => (
        <NodeMesh
          key={node.id}
          node={node}
          selected={selectedIds.includes(node.id)}
          soleSelected={node.id === soleId}
          onSoleSelectedMesh={setSoleObject}
        />
      ))}
      {soleId && soleObject && (
        <SelectionGizmo object={soleObject} nodeId={soleId} />
      )}
      {selectedIds.length > 1 && <MultiSelectionGizmo ids={selectedIds} />}
    </>
  );
}
