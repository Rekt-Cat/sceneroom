"use client";

import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, Stats } from "@react-three/drei";
import { MOUSE } from "three";
import { useSceneStore } from "@/store/sceneStore";
import BoxSelectController from "./BoxSelectController";
import CameraModifierSwitch from "./CameraModifierSwitch";
import SceneNodes from "./SceneNodes";
import { shouldIgnoreClick } from "./gizmoGuard";

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
      onPointerMissed={() => {
        if (!shouldIgnoreClick()) select(null);
      }}
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
      <OrbitControls
        makeDefault
        enableDamping={false}
        rotateSpeed={1.25}
        // Left-drag pans the camera, right-drag rotates it. Holding Shift swaps the two
        // (built into OrbitControls). The middle button is left unmapped, so it does nothing.
        mouseButtons={{ LEFT: MOUSE.PAN, RIGHT: MOUSE.ROTATE }}
      />

      {/* Lets Shift switch pan/rotate in the middle of a camera drag */}
      <CameraModifierSwitch />
      {/* Ctrl/Cmd + left-drag draws a selection box */}
      <BoxSelectController />

      {/* FPS counter (frames per second). The class moves it from the page corner to the corner of the
          3D view: 288px (Scene panel) + 12px across, 48px (top bar) + 12px down. */}
      <Stats className="top-[60px]! left-[300px]!" />
    </Canvas>
  );
}
