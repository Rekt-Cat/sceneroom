import { beforeEach, describe, expect, it } from "vitest";
import { Group, OrthographicCamera, PerspectiveCamera, Scene } from "three";
import { useViewStore } from "@/store/viewStore";
import { setPerspectiveCamera } from "./cameraRegistry";
import { placeSideCamera } from "./bigViewCamera";
import { renderPeek } from "./peekRender";
import { registerMesh } from "./meshRegistry";
import { useSceneStore } from "@/store/sceneStore";
import { addNode, createEmptyScene, createNode } from "@sceneroom/shared";

type Snapshot = {
  position: { x: number; y: number; z: number };
  left: number;
  right: number;
  top: number;
  bottom: number;
  zoom: number;
};
type Call = { kind: string; args: unknown[]; snapshot?: Snapshot };

/** A stand-in for the WebGL renderer that writes down what it was asked to do. */
function fakeRenderer() {
  const calls: Call[] = [];
  const note =
    (kind: string) =>
    (...args: unknown[]) => {
      calls.push({ kind, args });
    };
  const gl = {
    setScissorTest: note("scissorTest"),
    setViewport: note("viewport"),
    setScissor: note("scissor"),
    setClearColor: note("clearColor"),
    getClearColor: (c: { set: (v: number) => unknown }) => c.set(0x123456),
    getClearAlpha: () => 1,
    clear: note("clear"),
    render: (scene: unknown, camera: unknown) => {
      // One flat camera is reused for every side tile, so what it looked like NOW is written down
      const flat = camera instanceof OrthographicCamera ? camera : null;
      calls.push({
        kind: "render",
        args: [scene, camera],
        snapshot: flat
          ? {
              position: {
                x: flat.position.x,
                y: flat.position.y,
                z: flat.position.z,
              },
              left: flat.left,
              right: flat.right,
              top: flat.top,
              bottom: flat.bottom,
              zoom: flat.zoom,
            }
          : undefined,
      });
    },
  };
  return { gl: gl as never, calls };
}

beforeEach(() => {
  useViewStore.setState(useViewStore.getInitialState(), true);
  useSceneStore.getState().loadScene(createEmptyScene());
  setPerspectiveCamera(null);
});

describe("drawing the four views", () => {
  const size = { width: 1000, height: 600 };

  it("draws four tiles, one camera each: flat for the sides, the normal camera for the perspective tile", () => {
    const persp = new PerspectiveCamera(50, 1.6, 0.1, 100);
    setPerspectiveCamera(persp);
    const { gl, calls } = fakeRenderer();
    renderPeek(gl, new Scene(), size);
    const renders = calls.filter((c) => c.kind === "render");
    expect(renders).toHaveLength(4);
    const cameras = renders.map((c) => c.args[1]);
    expect(cameras[0]).toBeInstanceOf(OrthographicCamera); // Top
    expect(cameras[1]).toBeInstanceOf(OrthographicCamera); // Front
    expect(cameras[2]).toBeInstanceOf(OrthographicCamera); // Right
    expect(cameras[3]).toBe(persp);
  });

  it("gives each tile its own rectangle, counted from the bottom of the canvas, and clears the gaps first", () => {
    setPerspectiveCamera(new PerspectiveCamera());
    const { gl, calls } = fakeRenderer();
    renderPeek(gl, new Scene(), size);
    expect(calls[0]).toEqual({ kind: "scissorTest", args: [false] });
    expect(calls.some((c) => c.kind === "clear")).toBe(true);
    const viewports = calls.filter((c) => c.kind === "viewport").slice(1, 5);
    // tiles are 488 by 288 with an 8 pixel gap; the top ones start 8 from the top: 600 - 8 - 288 = 304 from the bottom
    expect(viewports[0]!.args).toEqual([8, 304, 488, 288]);
    expect(viewports[1]!.args).toEqual([504, 304, 488, 288]);
    expect(viewports[2]!.args).toEqual([8, 8, 488, 288]);
    expect(viewports[3]!.args).toEqual([504, 8, 488, 288]);
    // the scissor is the same rectangle, and everything is put back at the end
    const scissors = calls.filter((c) => c.kind === "scissor");
    expect(scissors.map((c) => c.args)).toEqual(viewports.map((c) => c.args));
    expect(calls.at(-2)).toEqual({ kind: "scissorTest", args: [false] });
    expect(calls.at(-1)).toEqual({ kind: "viewport", args: [0, 0, 1000, 600] });
  });

  it("puts back the normal camera's shape and the renderer's clear colour after drawing", () => {
    const persp = new PerspectiveCamera(50, 1.6, 0.1, 100);
    setPerspectiveCamera(persp);
    const { gl, calls } = fakeRenderer();
    renderPeek(gl, new Scene(), size);
    expect(persp.aspect).toBe(1.6);
    const colours = calls.filter((c) => c.kind === "clearColor");
    // the backdrop first, then the colour it had (0x123456)
    expect(colours).toHaveLength(2);
    expect((colours[1]!.args[0] as { getHex: () => number }).getHex()).toBe(
      0x123456,
    );
  });

  it("each side tile frames the selection from its side with the tile's shape", () => {
    setPerspectiveCamera(new PerspectiveCamera());
    useSceneStore
      .getState()
      .loadScene(addNode(createEmptyScene(), createNode("a", "cube")));
    useSceneStore.getState().select("a");
    const stand = new Group(); // a stand-in object in the registry for the selected cube
    registerMesh("a", stand);
    stand.updateMatrixWorld();
    const { gl, calls } = fakeRenderer();
    renderPeek(gl, new Scene(), size);
    registerMesh("a", null);
    const shots = calls
      .filter((c) => c.kind === "render")
      .map((c) => c.snapshot);
    // top looks down from above, front from +z, right from +x
    expect(shots[0]!.position.y).toBeGreaterThan(0);
    expect(shots[1]!.position.z).toBeGreaterThan(0);
    expect(shots[2]!.position.x).toBeGreaterThan(0);
    for (const c of shots.slice(0, 3)) {
      expect((c!.right - c!.left) / (c!.top - c!.bottom)).toBeCloseTo(
        488 / 288,
        5,
      );
      expect(c!.zoom).toBe(1);
    }
  });

  it("follows what a tile is set to show", () => {
    setPerspectiveCamera(new PerspectiveCamera());
    useViewStore.getState().setPeekTile(0, "left");
    useViewStore.getState().setPeekTile(3, "bottom");
    const { gl, calls } = fakeRenderer();
    renderPeek(gl, new Scene(), size);
    const shots = calls
      .filter((c) => c.kind === "render")
      .map((c) => c.snapshot);
    expect(shots[0]!.position.x).toBeLessThan(0); // left: from -x
    expect(shots[3]).toBeDefined(); // the last tile is a flat side now, not the normal camera
    expect(shots[3]!.position.y).toBeLessThan(0); // bottom: from -y
  });

  it("with no normal camera registered, the perspective tile is skipped instead of failing", () => {
    const { gl, calls } = fakeRenderer();
    expect(() => renderPeek(gl, new Scene(), size)).not.toThrow();
    expect(calls.filter((c) => c.kind === "render")).toHaveLength(3);
  });
});

describe("the camera of a pinned big view", () => {
  it("is a flat camera sized in pixels with a zoom that fits the selection, looking from the right side", () => {
    const camera = new OrthographicCamera();
    const target = placeSideCamera(camera, "front", {
      width: 800,
      height: 600,
    });
    expect(camera.left).toBe(-400);
    expect(camera.right).toBe(400);
    expect(camera.top).toBe(300);
    expect(camera.bottom).toBe(-300);
    expect(camera.zoom).toBeGreaterThan(0);
    expect(camera.position.z).toBeGreaterThan(target[2]); // in front
    expect((camera as unknown as { manual: boolean }).manual).toBe(true);
    // what it sees, in world units, is the framed height
    expect((camera.top - camera.bottom) / camera.zoom).toBeGreaterThan(0);
  });

  it("a different side looks from a different place at the same thing", () => {
    const front = new OrthographicCamera();
    const left = new OrthographicCamera();
    const t1 = placeSideCamera(front, "front", { width: 800, height: 600 });
    const t2 = placeSideCamera(left, "left", { width: 800, height: 600 });
    expect(t1).toEqual(t2);
    expect(left.position.x).toBeLessThan(t2[0]);
  });
});
