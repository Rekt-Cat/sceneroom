"use client";

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

function NodeMesh({ node }: { node: SceneNode }) {
  const { position, rotation, scale } = node.transform;
  return (
    <mesh
      visible={node.visible}
      position={position}
      rotation={rotation}
      scale={scale}
    >
      <Geometry kind={node.kind} />
      <meshStandardMaterial color={node.color} />
    </mesh>
  );
}

/** Draws every node in the scene store. Parenting is not rendered yet (Phase 3 hierarchy). */
export default function SceneNodes() {
  const nodes = useSceneStore((state) => state.scene.nodes);
  return Object.values(nodes).map((node) => (
    <NodeMesh key={node.id} node={node} />
  ));
}
