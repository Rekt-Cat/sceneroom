"use client";

import { Outlines } from "@react-three/drei";
import type { PrimitiveKind, SceneNode } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";

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

function NodeMesh({ node, selected }: { node: SceneNode; selected: boolean }) {
  const select = useSceneStore((state) => state.select);
  const { position, rotation, scale } = node.transform;
  return (
    <mesh
      visible={node.visible}
      position={position}
      rotation={rotation}
      scale={scale}
      onClick={(event) => {
        // Only the nearest mesh under the pointer gets the click
        event.stopPropagation();
        select(node.id);
      }}
    >
      <Geometry kind={node.kind} />
      <meshStandardMaterial color={node.color} />
      {selected && (
        <Outlines color={OUTLINE_COLOR} thickness={OUTLINE_THICKNESS} />
      )}
    </mesh>
  );
}

/** Draws every node in the scene store. Parenting is not rendered yet (Phase 3 hierarchy). */
export default function SceneNodes() {
  const nodes = useSceneStore((state) => state.scene.nodes);
  const selectedId = useSceneStore((state) => state.selectedId);
  return Object.values(nodes).map((node) => (
    <NodeMesh key={node.id} node={node} selected={node.id === selectedId} />
  ));
}
