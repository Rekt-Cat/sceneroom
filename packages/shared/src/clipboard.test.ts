import { describe, expect, it } from "vitest";
import {
  copyToClipboard,
  cutNodeIds,
  movableCutRoots,
  pasteFromClipboard,
  pasteTarget,
  resolveAutoPlacement,
} from "./clipboard";
import { createEmptyScene, sceneSchema } from "./scene";
import {
  addAsset,
  addNode,
  createModelNode,
  createNode,
  removeNodes,
} from "./sceneOps";

function counter() {
  let n = 0;
  return () => `new${++n}`;
}

function sampleScene() {
  // a            (Crate)
  // └─ b         (Ball)
  //    └─ c      (Cone)
  // d            (Plane)
  let scene = createEmptyScene();
  scene = addNode(scene, { ...createNode("a", "cube"), name: "Crate" });
  scene = addNode(scene, {
    ...createNode("b", "sphere"),
    name: "Ball",
    parentId: "a",
  });
  scene = addNode(scene, {
    ...createNode("c", "cone"),
    name: "Cone",
    parentId: "b",
  });
  scene = addNode(scene, { ...createNode("d", "plane"), name: "Plane" });
  return scene;
}

describe("copyToClipboard", () => {
  it("takes the selected objects and everything inside them, parents first", () => {
    const clip = copyToClipboard(sampleScene(), ["a"], "copy")!;
    expect(clip.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(clip.rootIds).toEqual(["a"]);
    expect(clip).toMatchObject({ mode: "copy", pasteCount: 0, assets: [] });
  });

  it("a selected child comes only with its parent, not twice", () => {
    const clip = copyToClipboard(sampleScene(), ["a", "c", "d"], "copy")!;
    expect(clip.rootIds).toEqual(["a", "d"]);
    expect(clip.nodes.map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("copying a child by itself works", () => {
    const clip = copyToClipboard(sampleScene(), ["b"], "cut")!;
    expect(clip.rootIds).toEqual(["b"]);
    expect(clip.nodes.map((n) => n.id)).toEqual(["b", "c"]);
    expect(clip.mode).toBe("cut");
  });

  it("is null when nothing exists to copy", () => {
    expect(copyToClipboard(sampleScene(), [], "copy")).toBeNull();
    expect(copyToClipboard(sampleScene(), ["nope"], "copy")).toBeNull();
  });

  it("includes the records of imported files, once each", () => {
    const info = {
      id: "f1",
      name: "Car",
      type: "model" as const,
      bytes: 1,
      triangles: 1,
      boundsMin: [0, 0, 0] as [number, number, number],
      boundsMax: [1, 1, 1] as [number, number, number],
      note: "",
    };
    let scene = addAsset(createEmptyScene(), info);
    scene = addNode(scene, createModelNode("m1", "Car", "f1", 1));
    scene = addNode(scene, createModelNode("m2", "Car", "f1", 1));
    const clip = copyToClipboard(scene, ["m1", "m2"], "copy")!;
    expect(clip.assets).toEqual([info]);
  });

  it("is a snapshot: changing the scene afterwards does not change it", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["a"], "copy")!;
    const changed = removeNodes(scene, ["a"]);
    expect(changed.nodes["a"]).toBeUndefined();
    expect(clip.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
});

describe("pasteFromClipboard", () => {
  it("adds new objects with new ids and the same structure, leaving the originals alone", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["a"], "copy")!;
    const { scene: after, rootIds } = pasteFromClipboard(
      scene,
      clip,
      counter(),
      { parentId: null },
    );
    expect(Object.keys(after.nodes)).toHaveLength(7);
    expect(rootIds).toEqual(["new1"]);
    // the copy of Ball is inside the copy of Crate, the copy of Cone inside the copy of Ball
    expect(after.nodes["new2"]).toMatchObject({
      name: "Ball",
      parentId: "new1",
    });
    expect(after.nodes["new3"]).toMatchObject({
      name: "Cone",
      parentId: "new2",
    });
    expect(after.nodes["a"]).toEqual(scene.nodes["a"]);
    expect(sceneSchema.safeParse(after).success).toBe(true);
  });

  it("puts the top objects in the parent it is told to, and the objects inside stay inside their own", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["b"], "copy")!;
    const into = pasteFromClipboard(scene, clip, counter(), {
      parentId: "d",
    }).scene;
    expect(into.nodes["new1"]?.parentId).toBe("d");
    expect(into.nodes["new2"]?.parentId).toBe("new1");
    const top = pasteFromClipboard(scene, clip, counter(), {
      parentId: null,
    }).scene;
    expect(top.nodes["new1"]?.parentId).toBeNull();
  });

  it("falls back to the top level if the parent does not exist", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["d"], "copy")!;
    const after = pasteFromClipboard(scene, clip, counter(), {
      parentId: "gone",
    }).scene;
    expect(after.nodes["new1"]?.parentId).toBeNull();
  });

  it("numbers the name of a top object when the name is taken, but not the objects inside", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["a"], "copy")!;
    const { scene: after } = pasteFromClipboard(scene, clip, counter(), {
      parentId: null,
    });
    expect(after.nodes["new1"]?.name).toBe("Crate (1)");
    expect(after.nodes["new2"]?.name).toBe("Ball");
  });

  it("moves the top objects by the offset, and not the objects inside", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["a"], "copy")!;
    const { scene: after } = pasteFromClipboard(scene, clip, counter(), {
      parentId: null,
      offset: [2, 0, 1],
    });
    expect(after.nodes["new1"]?.transform.position).toEqual([2, 0.5, 1]);
    expect(after.nodes["new2"]?.transform.position).toEqual([0, 0.5, 0]);
  });

  it("uses the given transform for a top object (so a copy can keep its place when the parent changes), then the offset", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["d"], "copy")!;
    const placed = {
      position: [7, 8, 9] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: [2, 2, 2] as [number, number, number],
    };
    const { scene: after } = pasteFromClipboard(scene, clip, counter(), {
      parentId: null,
      offset: [1, 0, 0],
      rootTransforms: { d: placed },
    });
    expect(after.nodes["new1"]?.transform).toEqual({
      ...placed,
      position: [8, 8, 9],
    });
  });

  it("pasting twice makes two separate sets of objects", () => {
    const scene = sampleScene();
    const clip = copyToClipboard(scene, ["d"], "copy")!;
    const gen = counter();
    const first = pasteFromClipboard(scene, clip, gen, { parentId: null });
    const second = pasteFromClipboard(first.scene, clip, gen, {
      parentId: null,
    });
    expect(Object.keys(second.scene.nodes)).toHaveLength(6);
    expect(second.scene.nodes[second.rootIds[0]!]?.name).toBe("Plane (2)");
  });

  it("adds the record of an imported file if the scene does not have it, and the model uses it", () => {
    const info = {
      id: "f1",
      name: "Car",
      type: "model" as const,
      bytes: 1,
      triangles: 1,
      boundsMin: [0, 0, 0] as [number, number, number],
      boundsMax: [1, 1, 1] as [number, number, number],
      note: "",
    };
    let scene = addAsset(createEmptyScene(), info);
    scene = addNode(scene, createModelNode("m", "Car", "f1", 1));
    const clip = copyToClipboard(scene, ["m"], "copy")!;
    const { scene: after } = pasteFromClipboard(
      createEmptyScene(),
      clip,
      counter(),
      { parentId: null },
    );
    expect(after.assets["f1"]).toEqual(info);
    expect(after.nodes["new1"]).toMatchObject({ kind: "model", assetId: "f1" });
  });

  it("keeps everything else about an object (colour, material, hidden, locked)", () => {
    let scene = createEmptyScene();
    scene = addNode(scene, {
      ...createNode("a", "cube"),
      color: "#112233",
      roughness: 0.2,
      metalness: 0.9,
      visible: false,
      locked: true,
    });
    const clip = copyToClipboard(scene, ["a"], "copy")!;
    const { scene: after } = pasteFromClipboard(scene, clip, counter(), {
      parentId: null,
    });
    expect(after.nodes["new1"]).toMatchObject({
      color: "#112233",
      roughness: 0.2,
      metalness: 0.9,
      visible: false,
      locked: true,
    });
  });
});

describe("cutNodeIds and movableCutRoots", () => {
  it("a cut marks the cut objects and everything inside them", () => {
    const scene = sampleScene();
    const cut = copyToClipboard(scene, ["b"], "cut")!;
    expect([...cutNodeIds(scene, cut)].sort()).toEqual(["b", "c"]);
  });

  it("a copy, or nothing on the clipboard, marks nothing", () => {
    const scene = sampleScene();
    expect(cutNodeIds(scene, copyToClipboard(scene, ["b"], "copy")).size).toBe(
      0,
    );
    expect(cutNodeIds(scene, null).size).toBe(0);
  });

  it("ignores cut objects that no longer exist", () => {
    const scene = sampleScene();
    const cut = copyToClipboard(scene, ["d"], "cut")!;
    expect(cutNodeIds(removeNodes(scene, ["d"]), cut).size).toBe(0);
  });

  it("movableCutRoots leaves out objects that are gone or locked by now", () => {
    const scene = sampleScene();
    const cut = copyToClipboard(scene, ["a", "d"], "cut")!;
    expect(movableCutRoots(scene, cut)).toEqual(["a", "d"]);
    const lockedD = {
      ...scene,
      nodes: { ...scene.nodes, d: { ...scene.nodes["d"]!, locked: true } },
    };
    expect(movableCutRoots(lockedD, cut)).toEqual(["a"]);
    expect(movableCutRoots(removeNodes(scene, ["a"]), cut)).toEqual(["d"]);
    expect(
      movableCutRoots(scene, copyToClipboard(scene, ["a"], "copy")!),
    ).toEqual([]);
  });
});

describe("pasteTarget", () => {
  const scene = sampleScene();
  const copy = copyToClipboard(scene, ["d"], "copy")!;
  const cutB = copyToClipboard(scene, ["b"], "cut")!;

  it("beside the selected object means in its parent", () => {
    expect(pasteTarget(scene, ["c"], copy, "beside")).toEqual({
      ok: true,
      parentId: "b",
    });
    expect(pasteTarget(scene, ["d"], copy, "beside")).toEqual({
      ok: true,
      parentId: null,
    });
  });

  it("beside several selected objects: their shared parent, or the top level if they differ", () => {
    expect(pasteTarget(scene, ["b", "b"], copy, "beside")).toEqual({
      ok: true,
      parentId: "a",
    });
    expect(pasteTarget(scene, ["c", "d"], copy, "beside")).toEqual({
      ok: true,
      parentId: null,
    });
  });

  it("beside with nothing selected means the top level", () => {
    expect(pasteTarget(scene, [], copy, "beside")).toEqual({
      ok: true,
      parentId: null,
    });
  });

  it("top level always works", () => {
    expect(pasteTarget(scene, ["c"], copy, "top")).toEqual({
      ok: true,
      parentId: null,
    });
  });

  it("into an object means inside it", () => {
    expect(pasteTarget(scene, [], copy, { into: "d" })).toEqual({
      ok: true,
      parentId: "d",
    });
  });

  it("refuses an object that does not exist", () => {
    const result = pasteTarget(scene, [], copy, { into: "gone" });
    expect(result.ok).toBe(false);
  });

  it("refuses a locked parent, and a parent inside a locked object, with its name in the message", () => {
    const locked = {
      ...scene,
      nodes: { ...scene.nodes, a: { ...scene.nodes["a"]!, locked: true } },
    };
    const direct = pasteTarget(locked, [], copy, { into: "a" });
    expect(direct.ok === false && direct.reason).toContain('"Crate" is locked');
    expect(pasteTarget(locked, [], copy, { into: "c" }).ok).toBe(false);
  });

  it("a cut cannot be pasted into itself or into something inside it", () => {
    expect(pasteTarget(scene, [], cutB, { into: "b" }).ok).toBe(false);
    expect(pasteTarget(scene, [], cutB, { into: "c" }).ok).toBe(false);
    // but into the parent, a sibling, or the top level is fine
    expect(pasteTarget(scene, [], cutB, { into: "a" }).ok).toBe(true);
    expect(pasteTarget(scene, [], cutB, { into: "d" }).ok).toBe(true);
    expect(pasteTarget(scene, [], cutB, "top").ok).toBe(true);
  });

  it("a copy CAN go inside the thing it was copied from", () => {
    const copyA = copyToClipboard(scene, ["a"], "copy")!;
    expect(pasteTarget(scene, [], copyA, { into: "c" })).toEqual({
      ok: true,
      parentId: "c",
    });
  });
});

describe("plain paste (auto): into the selected object, unless it is what was copied", () => {
  const scene = sampleScene();
  const cutCone = copyToClipboard(scene, ["c"], "cut")!; // Cone, inside Ball inside Crate
  const copyCrate = copyToClipboard(scene, ["a"], "copy")!;

  it("nothing selected: the top level", () => {
    expect(resolveAutoPlacement(scene, [], cutCone)).toBe("top");
    expect(pasteTarget(scene, [], cutCone, "auto")).toEqual({
      ok: true,
      parentId: null,
    });
  });

  it("another object selected: inside it, so cut A + click B + paste makes A a child of B", () => {
    expect(resolveAutoPlacement(scene, ["d"], cutCone)).toEqual({ into: "d" });
    expect(pasteTarget(scene, ["d"], cutCone, "auto")).toEqual({
      ok: true,
      parentId: "d",
    });
  });

  it("works the same for a copy: copy A, click B, paste puts the copy inside B", () => {
    expect(pasteTarget(scene, ["d"], copyCrate, "auto")).toEqual({
      ok: true,
      parentId: "d",
    });
  });

  it("the selected object is what was copied: beside it (the copy does not go inside itself)", () => {
    expect(resolveAutoPlacement(scene, ["a"], copyCrate)).toBe("beside");
    expect(pasteTarget(scene, ["a"], copyCrate, "auto")).toEqual({
      ok: true,
      parentId: null,
    });
  });

  it("the selected object is inside what was copied: beside it", () => {
    expect(resolveAutoPlacement(scene, ["c"], copyCrate)).toBe("beside"); // c is inside a
    expect(pasteTarget(scene, ["c"], copyCrate, "auto")).toEqual({
      ok: true,
      parentId: "b",
    });
  });

  it("a cut that is still selected stays where it is (beside itself, in its own parent)", () => {
    expect(pasteTarget(scene, ["c"], cutCone, "auto")).toEqual({
      ok: true,
      parentId: "b",
    });
  });

  it("several selected objects: beside them", () => {
    expect(resolveAutoPlacement(scene, ["d", "b"], cutCone)).toBe("beside");
  });

  it("ignores selected ids that do not exist", () => {
    expect(resolveAutoPlacement(scene, ["gone"], cutCone)).toBe("top");
  });

  it("is still refused when the object it would go into is locked, or is inside the cut", () => {
    const locked = {
      ...scene,
      nodes: { ...scene.nodes, d: { ...scene.nodes["d"]!, locked: true } },
    };
    expect(pasteTarget(locked, ["d"], cutCone, "auto").ok).toBe(false);
    const cutCrate = copyToClipboard(scene, ["a"], "cut")!;
    // b is inside the cut crate, so "beside b" would be inside the crate itself: refused
    expect(pasteTarget(scene, ["b"], cutCrate, "auto").ok).toBe(false);
  });
});
