import { Object3D } from "three";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addNode,
  createEmptyScene,
  createNode,
  setTransform,
  updateNode,
  type Scene,
  type Transform,
} from "@sceneroom/shared";
import { GLIDE_MS, clearGlides, planGlides, stepGlides } from "./remoteGlide";

const at = (x: number, turn = 0, size = 1): Transform => ({
  position: [x, 0, 0],
  rotation: [0, turn, 0],
  scale: [size, size, size],
});

function setup() {
  let scene: Scene = addNode(createEmptyScene(), createNode("cube", "cube"));
  scene = setTransform(scene, "cube", at(0));
  const object = new Object3D();
  object.position.set(0, 0, 0);
  const get = () => object;
  /** A change from someone else: planned, then drawn at its target (as the 3D view does), then stepped. */
  const arrive = (next: Scene, now: number) => {
    planGlides(scene, next, get, now);
    scene = next;
    const t = scene.nodes["cube"]!.transform;
    object.position.set(...t.position);
    object.rotation.set(...t.rotation);
    object.scale.set(...t.scale);
  };
  const step = (now: number) => stepGlides((id) => scene.nodes[id], get, now);
  return {
    object,
    arrive,
    step,
    scene: () => scene,
    set: (next: Scene) => (scene = next),
  };
}

beforeEach(clearGlides);

describe("remote glide", () => {
  it("starts where the object was drawn, passes through the middle and ends exactly at the target", () => {
    const t = setup();
    t.arrive(setTransform(t.scene(), "cube", at(10, 1, 3)), 1000);
    t.step(1000);
    expect(t.object.position.x).toBeCloseTo(0);
    expect(t.object.scale.x).toBeCloseTo(1);
    t.step(1000 + GLIDE_MS / 2);
    expect(t.object.position.x).toBeGreaterThan(5);
    expect(t.object.position.x).toBeLessThan(10);
    expect(t.object.rotation.y).toBeGreaterThan(0.5);
    expect(t.object.rotation.y).toBeLessThan(1);
    t.step(1000 + GLIDE_MS);
    expect(t.object.position.x).toBe(10);
    expect(t.object.rotation.y).toBe(1);
    expect(t.object.scale.x).toBe(3);
  });

  it("a new change in the middle of a glide carries on from where the object is, with no jump back", () => {
    const t = setup();
    t.arrive(setTransform(t.scene(), "cube", at(10)), 0);
    t.step(GLIDE_MS / 2);
    const middle = t.object.position.x;
    // The next change is planned while the object is still half way (before it is drawn at the new target)
    t.arrive(setTransform(t.scene(), "cube", at(20)), GLIDE_MS / 2);
    // planGlides took the position before `arrive` drew the target
    t.step(GLIDE_MS / 2);
    expect(t.object.position.x).toBeCloseTo(middle);
    t.step(GLIDE_MS * 2);
    expect(t.object.position.x).toBe(20);
  });

  it("is dropped at once when this person changes the object meanwhile", () => {
    const t = setup();
    t.arrive(setTransform(t.scene(), "cube", at(10)), 0);
    t.step(10);
    t.set(setTransform(t.scene(), "cube", at(-5)));
    t.step(20);
    expect(t.object.position.x).toBe(-5);
    t.object.position.x = 99;
    t.step(30);
    expect(t.object.position.x).toBe(99);
  });

  it("does nothing for a change that is not a move, for a new object, or after a new parent", () => {
    const t = setup();
    t.arrive(updateNode(t.scene(), "cube", { name: "Renamed" }), 0);
    t.object.position.x = 7;
    t.step(10);
    expect(t.object.position.x).toBe(7);

    let next = addNode(t.scene(), createNode("group", "cube"));
    next = setTransform(next, "cube", at(4));
    next = {
      ...next,
      nodes: {
        ...next.nodes,
        cube: { ...next.nodes["cube"]!, parentId: "group" },
      },
    };
    t.arrive(next, 0);
    t.step(1);
    expect(t.object.position.x).toBe(4);
  });

  it("forgets an object that is gone, and everything when cleared", () => {
    const t = setup();
    t.arrive(setTransform(t.scene(), "cube", at(10)), 0);
    clearGlides();
    t.object.position.x = 3;
    t.step(10);
    expect(t.object.position.x).toBe(3);
    t.arrive(setTransform(t.scene(), "cube", at(8)), 20);
    t.set(createEmptyScene());
    expect(() => t.step(30)).not.toThrow();
  });
});
