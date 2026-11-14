"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import {
  CanvasTexture,
  Color,
  EquirectangularReflectionMapping,
  Fog,
  PMREMGenerator,
  SRGBColorSpace,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { EnvironmentSettings } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useEnvironmentTexture } from "./environmentTexture";

/** How blurred the studio's reflections are (0 sharp to 1 very soft). Passed to three.js's `fromScene`. */
const STUDIO_BLUR = 0.04;

/** Size of the picture the sky is drawn on, in pixels. The sky is smooth, so a thin strip is enough. */
const SKY_PICTURE_SIZE: [number, number] = [8, 256];

/**
 * The sky as a picture that wraps all the way around (top to bottom: the colour straight up, the horizon,
 * then the ground). Used both as what is drawn behind everything and, blurred, as what is reflected.
 */
function createSkyTexture(
  top: string,
  horizon: string,
  ground: string,
): CanvasTexture {
  const [width, height] = SKY_PICTURE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.5, horizon);
    // A short, soft step from the horizon down to the ground colour
    gradient.addColorStop(0.54, ground);
    gradient.addColorStop(1, ground);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.mapping = EquirectangularReflectionMapping;
  return texture;
}

/** The generated picture shiny surfaces reflect, or null when reflections are off. */
function createReflections(
  gl: WebGLRenderer,
  settings: EnvironmentSettings,
  sky: Texture | null,
): Texture | null {
  if (settings.reflections === "off") return null;
  const generator = new PMREMGenerator(gl);
  try {
    if (settings.reflections === "studio") {
      const room = new RoomEnvironment();
      const texture = generator.fromScene(room, STUDIO_BLUR).texture;
      room.dispose();
      return texture;
    }
    const picture =
      sky ??
      createSkyTexture(
        settings.skyTop,
        settings.skyHorizon,
        settings.skyGround,
      );
    const texture = generator.fromEquirectangular(picture).texture;
    if (!sky) picture.dispose();
    return texture;
  } finally {
    generator.dispose();
  }
}

/** Puts the background, fog and reflections on the three.js scene (a plain function: it changes the scene). */
function applyToScene(
  scene: Scene,
  settings: EnvironmentSettings,
  sky: Texture | null,
  reflections: Texture | null,
): void {
  scene.background =
    settings.backgroundMode === "sky" && sky
      ? sky
      : new Color(settings.backgroundColor);
  scene.environment = reflections;
  scene.environmentIntensity = settings.reflectionStrength;
  scene.fog = settings.fogEnabled
    ? new Fog(settings.fogColor, settings.fogNear, settings.fogFar)
    : null;
}

/** The settings that cost nothing to change: reflection strength, fog, and a plain background colour. */
function applyCheapSettings(scene: Scene, settings: EnvironmentSettings): void {
  scene.environmentIntensity = settings.reflectionStrength;
  scene.fog = settings.fogEnabled
    ? new Fog(settings.fogColor, settings.fogNear, settings.fogFar)
    : null;
  if (settings.backgroundMode === "color") {
    scene.background = new Color(settings.backgroundColor);
  }
}

/**
 * Draws the world from the scene's environment settings: the background (a colour or the sky), the
 * reflections, and the fog. Lives inside the Canvas. It renders nothing itself.
 *
 * The (slow) generated pictures are remade only when the settings that make them change, not when a
 * number like the fog distance is dragged.
 */
export default function SceneEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const settings = useSceneStore((state) => state.scene.environment);

  const {
    backgroundMode,
    skyTop,
    skyHorizon,
    skyGround,
    reflections: reflectionMode,
  } = settings;

  // The sky picture: needed for a sky background and for sky reflections
  const needsSky = backgroundMode === "sky" || reflectionMode === "sky";
  // The reflections picture: remade when its kind, or the sky it is made from, changes
  const reflectionKey =
    reflectionMode === "sky"
      ? `sky-${skyTop}-${skyHorizon}-${skyGround}`
      : reflectionMode;

  useEffect(() => {
    const sky = needsSky
      ? createSkyTexture(skyTop, skyHorizon, skyGround)
      : null;
    const reflections = createReflections(gl, { ...settings }, sky);
    useEnvironmentTexture.getState().set(reflections);
    applyToScene(scene, settings, sky, reflections);
    return () => {
      useEnvironmentTexture.getState().set(null);
      sky?.dispose();
      reflections?.dispose();
    };
    // Only the settings that change the pictures are listed; the rest is applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gl,
    scene,
    needsSky,
    backgroundMode,
    skyTop,
    skyHorizon,
    skyGround,
    reflectionKey,
  ]);

  // The cheap settings (colours, strength, fog) are applied on every change
  useEffect(() => {
    applyCheapSettings(scene, settings);
  }, [scene, settings]);

  return null;
}
