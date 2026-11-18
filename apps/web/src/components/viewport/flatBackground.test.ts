import { describe, expect, it } from "vitest";
import { Color, Scene } from "three";
import {
  flatMemory,
  syncFlatBackground,
  withRealBackground,
  withFlatBackground,
  type FlatBackgroundMemory,
} from "./flatBackground";

describe("the plain background of the flat side views", () => {
  it("is on while a flat view shows, and the scene's own background comes back after", () => {
    const scene = new Scene();
    const own = new Color("#123456");
    scene.background = own;
    const memory: FlatBackgroundMemory = { mine: null, original: null };
    syncFlatBackground(scene, true, memory);
    expect(scene.background).not.toBe(own);
    syncFlatBackground(scene, true, memory); // stays the same on later frames
    expect(scene.background).toBe(memory.mine);
    syncFlatBackground(scene, false, memory);
    expect(scene.background).toBe(own);
  });

  it("keeps a background the environment put in while the flat view was showing", () => {
    const scene = new Scene();
    const memory: FlatBackgroundMemory = { mine: null, original: null };
    syncFlatBackground(scene, true, memory);
    const changed = new Color("#abcdef");
    scene.background = changed;
    syncFlatBackground(scene, true, memory);
    syncFlatBackground(scene, false, memory);
    expect(scene.background).toBe(changed);
  });

  it("withFlatBackground restores the background even if drawing fails", () => {
    const scene = new Scene();
    const own = new Color("#112233");
    scene.background = own;
    expect(() =>
      withFlatBackground(scene, () => {
        throw new Error("draw failed");
      }),
    ).toThrow("draw failed");
    expect(scene.background).toBe(own);
  });
});

describe("the perspective tile of the four-view peek", () => {
  it("is drawn with the real background even while a flat big view has the plain colour on the scene", () => {
    const scene = new Scene();
    const sky = new Color("#0088f0");
    scene.background = sky;
    flatMemory.mine = null;
    flatMemory.original = null;
    syncFlatBackground(scene, true, flatMemory);
    expect(scene.background).not.toBe(sky);
    let during: unknown = null;
    withRealBackground(scene, () => {
      during = scene.background;
    });
    expect(during).toBe(sky);
    // and the flat colour is back afterwards
    expect(scene.background).toBe(flatMemory.mine);
    syncFlatBackground(scene, false, flatMemory);
    expect(scene.background).toBe(sky);
  });

  it("does nothing special when no flat view is showing", () => {
    const scene = new Scene();
    const own = new Color("#112233");
    scene.background = own;
    flatMemory.mine = null;
    let during: unknown = null;
    withRealBackground(scene, () => {
      during = scene.background;
    });
    expect(during).toBe(own);
  });
});
