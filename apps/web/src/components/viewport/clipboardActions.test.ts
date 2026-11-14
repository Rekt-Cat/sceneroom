import { beforeEach, describe, expect, it } from "vitest";
import { Object3D } from "three";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { pasteClipboard } from "./clipboardActions";
import { registerMesh } from "./meshRegistry";

const get = () => useSceneStore.getState();
const node = (id: string) => get().scene.nodes[id]!;
const lastMessage = () => useImportStore.getState().message?.text;

/**
 * A small scene, with the matching 3D objects registered the way the viewport does it:
 *   a   at (0,0,0)
 *   |-- c  at (1,0,0) inside a
 *   b   at (10,0,0), scaled 2
 */
beforeEach(() => {
  useSceneStore.setState(useSceneStore.getInitialState(), true);
  useImportStore.setState({ message: null, busy: false });
  const store = get();
  const a = store.addPrimitive("cube");
  const b = store.addPrimitive("cube");
  const c = store.addPrimitive("sphere");
  // set known ids by rebuilding the scene through the store's own actions
  const scene = get().scene;
  const make = (
    id: string,
    name: string,
    parentId: string | null,
    position: [number, number, number],
    scale: number,
  ) => ({
    ...scene.nodes[id]!,
    name,
    parentId,
    transform: {
      position,
      rotation: [0, 0, 0] as [number, number, number],
      scale: [scale, scale, scale] as [number, number, number],
    },
  });
  get().loadScene({
    ...scene,
    nodes: {
      A: { ...make(a, "A", null, [0, 0, 0], 1), id: "A" },
      B: { ...make(b, "B", null, [10, 0, 0], 2), id: "B" },
      C: { ...make(c, "C", "A", [1, 0, 0], 1), id: "C" },
    },
  });
  const objA = new Object3D();
  const objB = new Object3D();
  objB.position.set(10, 0, 0);
  objB.scale.set(2, 2, 2);
  const objC = new Object3D();
  objC.position.set(1, 0, 0);
  objA.add(objC);
  const root = new Object3D();
  root.add(objA, objB);
  root.updateMatrixWorld(true);
  registerMesh("A", objA);
  registerMesh("B", objB);
  registerMesh("C", objC);
});

describe("pasting a cut (it moves the objects)", () => {
  it("cut a child, click empty space (nothing selected), paste: it becomes a top-level object and stays where it was", () => {
    get().select("C");
    get().cutSelected();
    get().select(null);
    expect(pasteClipboard("auto")).toBe(true);

    expect(node("C").parentId).toBeNull();
    // it was at (1,0,0) in the world, so it still is
    expect(node("C").transform.position).toEqual([1, 0, 0]);
    // the same object (same id), not a copy; nothing else was added
    expect(Object.keys(get().scene.nodes).sort()).toEqual(["A", "B", "C"]);
  });

  it("after the paste the cut mark is gone, the objects are selected, and it is one undo step", () => {
    get().select("C");
    get().cutSelected();
    get().select(null);
    const steps = get().history.past.length;
    pasteClipboard("top");
    expect(get().clipboard).toBeNull();
    expect(get().selectedIds).toEqual(["C"]);
    expect(get().history.past).toHaveLength(steps + 1);
    expect(get().history.past.at(-1)?.label).toBe("Paste");
    get().undo();
    expect(node("C").parentId).toBe("A");
  });

  it("paste into another object: it becomes a child of it and keeps its place in the 3D view", () => {
    get().select("C");
    get().cutSelected();
    get().select("B");
    expect(pasteClipboard({ into: "B" })).toBe(true);
    expect(node("C").parentId).toBe("B");
    // world (1,0,0) inside B (at 10, scale 2): local x = (1 - 10) / 2, scale 1 / 2
    expect(node("C").transform.position[0]).toBeCloseTo(-4.5);
    expect(node("C").transform.scale[0]).toBeCloseTo(0.5);
  });

  it("Paste beside puts the cut object next to the selected one (in the same parent)", () => {
    get().select("C");
    get().cutSelected();
    get().select("B"); // B is top level
    pasteClipboard("beside");
    expect(node("C").parentId).toBeNull();
  });

  it("plain paste with another object selected makes the cut object its child", () => {
    get().select("C");
    get().cutSelected();
    get().select("B");
    expect(pasteClipboard("auto")).toBe(true);
    expect(node("C").parentId).toBe("B");
  });

  it("plain paste of a copy with another object selected puts the copy inside it", () => {
    get().select("C");
    get().copySelected();
    get().select("B");
    pasteClipboard("auto");
    const copy = Object.values(get().scene.nodes).find(
      (n) => n.name === "C (1)",
    )!;
    expect(copy.parentId).toBe("B");
    expect(node("C").parentId).toBe("A"); // the original stays
  });

  it("an object cannot be pasted into itself or into something inside it, and a message says so", () => {
    get().select("A");
    get().cutSelected();
    get().select("C"); // C is inside A
    expect(pasteClipboard({ into: "C" })).toBe(false);
    expect(lastMessage()).toContain("cannot be pasted into itself");
    expect(node("A").parentId).toBeNull();
    expect(get().clipboard?.mode).toBe("cut"); // still waiting for a valid place
  });

  it("cannot paste into a locked object", () => {
    get().setNodesLocked(["B"], true);
    get().select("C");
    get().cutSelected();
    get().select("B");
    expect(pasteClipboard({ into: "B" })).toBe(false);
    expect(lastMessage()).toContain("is locked");
    expect(node("C").parentId).toBe("A");
  });

  it("if the cut object was locked after cutting, nothing is moved and the clipboard is cleared", () => {
    get().select("C");
    get().cutSelected();
    get().setNodesLocked(["C"], true);
    get().select(null);
    expect(pasteClipboard("top")).toBe(false);
    expect(node("C").parentId).toBe("A");
    expect(get().clipboard).toBeNull();
  });
});

describe("pasting a copy in the 3D view", () => {
  it("a copy pasted at the top level appears where the original is in the world, one step along", () => {
    get().select("C");
    get().copySelected();
    get().select(null);
    expect(pasteClipboard("top")).toBe(true);
    const copy = Object.values(get().scene.nodes).find(
      (n) => n.name === "C (1)",
    )!;
    expect(copy.parentId).toBeNull();
    expect(copy.transform.position).toEqual([2, 0, 0]); // world (1,0,0) + one step
    expect(get().scene.nodes["C"]?.parentId).toBe("A"); // the original stays
  });

  it("a copy pasted beside the selected child lands in the same parent, one step along", () => {
    get().select("C");
    get().copySelected();
    pasteClipboard("beside");
    const copy = Object.values(get().scene.nodes).find(
      (n) => n.name === "C (1)",
    )!;
    expect(copy.parentId).toBe("A");
    expect(copy.transform.position).toEqual([2, 0, 0]); // local (1,0,0) + one step
  });

  it("a copy pasted into another object keeps its place in the world (plus a step) and becomes its child", () => {
    get().select("C");
    get().copySelected();
    get().select("B");
    pasteClipboard({ into: "B" });
    const copy = Object.values(get().scene.nodes).find(
      (n) => n.name === "C (1)",
    )!;
    expect(copy.parentId).toBe("B");
    expect(copy.transform.position[0]).toBeCloseTo(-4.5 + 1);
    expect(get().clipboard?.mode).toBe("copy"); // a copy can be pasted again
  });

  it("does nothing, and says nothing, when the clipboard is empty", () => {
    expect(pasteClipboard("top")).toBe(false);
    expect(lastMessage()).toBeUndefined();
  });
});
