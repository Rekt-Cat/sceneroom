"use client";

import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls, Stats } from "@react-three/drei";
import { MOUSE } from "three";
import { useSceneStore } from "@/store/sceneStore";
import AssetDropController from "./AssetDropController";
import AssetPreview from "./AssetPreview";
import BoxSelectController from "./BoxSelectController";
import CameraModifierSwitch from "./CameraModifierSwitch";
import ViewportContextMenuController from "./ViewportContextMenuController";
import SceneNodes from "./SceneNodes";
import { shouldIgnoreClick } from "./gizmoGuard";

/** How sharp the shadows are (pixels of the shadow picture, per side). */
const SHADOW_MAP_SIZE = 2048;
/** Shadows are drawn for objects within this many units of the middle (the light sees a square this size, both ways). */
const SHADOW_AREA = 15;
/** How dark a shadow is on the ground, 0 (none) to 1 (black). */
const SHADOW_OPACITY = 0.35;
/** Side of the square ground that catches shadows, in units. */
const GROUND_SIZE = 200;

/**
 * The 3D viewport: a camera you can orbit around the scene nodes on an infinite grid.
 * Browser-only (WebGL), so it is loaded through ViewportLoader with SSR switched off.
 */
export default function Viewport() {
  const select = useSceneStore((state) => state.select);
  return (
    // Clicking empty space (no mesh hit) clears the selection
    <Canvas
      shadows
      camera={{ position: [5, 4, 7], fov: 50 }}
      onPointerMissed={() => {
        if (!shouldIgnoreClick()) select(null);
      }}
    >
      <color attach="background" args={["#14191d"]} />

      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 8, 4]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-left={-SHADOW_AREA}
        shadow-camera-right={SHADOW_AREA}
        shadow-camera-top={SHADOW_AREA}
        shadow-camera-bottom={-SHADOW_AREA}
        shadow-bias={-0.0005}
      />
      {/* Shadows need a surface to fall on: the ground catches them (and draws nothing else) */}
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.002}
        receiveShadow
        raycast={() => undefined}
      >
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <shadowMaterial opacity={SHADOW_OPACITY} />
      </mesh>

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
      {/* An asset dragged from the Assets tab can be dropped on the ground */}
      <AssetDropController />
      <AssetPreview />
      {/* A right-click on an object opens the menu */}
      <ViewportContextMenuController />

      {/* FPS counter (frames per second). The class moves it from the page corner to the corner of the
          3D view: the Scene panel width (a CSS variable set in EditorShell) + 12px across, 48px (top bar) + 12px down. */}
      <Stats className="top-[60px]! left-[calc(var(--left-panel-width,288px)+12px)]!" />
    </Canvas>
  );
}
