"use client";

import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, Stats } from "@react-three/drei";
import { useSceneStore } from "@/store/sceneStore";
import SceneNodes from "./SceneNodes";

/**
 * The 3D viewport: a camera you can orbit around the scene nodes on an infinite grid.
 * Browser-only (WebGL), so it is loaded through ViewportLoader with SSR switched off.
 */
export default function Viewport() {
  const select = useSceneStore((state) => state.select);
  return (
    // Clicking empty space (no mesh hit) clears the selection
    <Canvas
      camera={{ position: [5, 4, 7], fov: 50 }}
      onPointerMissed={() => select(null)}
    >
      <color attach="background" args={["#14191d"]} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 4]} intensity={1.6} />

      <SceneNodes />

      <Grid
        infiniteGrid
        cellSize={1}
        sectionSize={5}
        cellColor="#2c3b44"
        sectionColor="#5a6a75"
        fadeDistance={45}
        fadeStrength={1.5}
      />

      {/* No damping: the camera follows the mouse immediately (damping adds a gliding delay) */}
      <OrbitControls makeDefault enableDamping={false} rotateSpeed={1.25} />

      {/* FPS counter (frames per second) in the corner */}
      <Stats />
    </Canvas>
  );
}
