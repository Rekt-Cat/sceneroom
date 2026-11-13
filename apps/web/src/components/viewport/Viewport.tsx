"use client";

import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, Stats } from "@react-three/drei";

/**
 * The 3D viewport: a camera you can orbit around a lit cube on an infinite grid.
 * Browser-only (WebGL), so it is loaded through ViewportLoader with SSR switched off.
 */
export default function Viewport() {
  return (
    <Canvas camera={{ position: [5, 4, 7], fov: 50 }}>
      <color attach="background" args={["#14191d"]} />

      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 4]} intensity={1.6} />

      {/* Sits on the grid: a 1 x 1 x 1 box centred 0.5 above the ground plane */}
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#5cc4e0" />
      </mesh>

      <Grid
        infiniteGrid
        cellSize={1}
        sectionSize={5}
        cellColor="#2c3b44"
        sectionColor="#5a6a75"
        fadeDistance={45}
        fadeStrength={1.5}
      />

      <OrbitControls makeDefault enableDamping />

      {/* FPS counter (frames per second) in the corner */}
      <Stats />
    </Canvas>
  );
}
