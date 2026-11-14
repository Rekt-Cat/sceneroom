import { beforeEach, describe, expect, it } from "vitest";
import { nextRedoLabel, nextUndoLabel } from "@sceneroom/shared";
import { useSceneStore } from "./sceneStore";

const get = () => useSceneStore.getState();
const nodeCount = () => Object.keys(get().scene.nodes).length;

beforeEach(() => {
  useSceneStore.setState(useSceneStore.getInitialState(), true);
});

describe("undo and redo", () => {
  it("undoes and redoes adding an object, including the selection", () => {
    const before = nodeCount();
    const id = get().addPrimitive("sphere");
    expect(nodeCount()).toBe(before + 1);
    expect(get().selectedIds).toEqual([id]);
    expect(nextUndoLabel(get().history)).toBe("Add sphere");

    get().undo();
    expect(nodeCount()).toBe(before);
    expect(get().selectedIds).toEqual([]);

    get().redo();
    expect(nodeCount()).toBe(before + 1);
    expect(get().selectedIds).toEqual([id]);
  });

  it("does nothing when there is nothing to undo or redo", () => {
    const scene = get().scene;
    get().undo();
    get().redo();
    expect(get().scene).toBe(scene);
  });

  it("undoes a delete and brings the objects and the selection back", () => {
    get().select("initial-cube");
    get().deleteSelected();
    expect(nodeCount()).toBe(0);
    get().undo();
    expect(get().scene.nodes["initial-cube"]).toBeDefined();
    expect(get().selectedIds).toEqual(["initial-cube"]);
  });

  it("undoes a duplicate", () => {
    get().select("initial-cube");
    get().duplicateSelected();
    expect(nodeCount()).toBe(2);
    get().undo();
    expect(nodeCount()).toBe(1);
  });

  it("undoes transform, colour, rename and visibility changes one by one", () => {
    const node = get().scene.nodes["initial-cube"]!;
    get().setNodeTransform("initial-cube", {
      ...node.transform,
      position: [4, 0.5, 0],
    });
    get().setNodeColor("initial-cube", "#ff0000");
    get().renameNode("initial-cube", "Box");
    get().setNodeVisible("initial-cube", false);

    const read = () => get().scene.nodes["initial-cube"]!;
    expect(read()).toMatchObject({
      color: "#ff0000",
      name: "Box",
      visible: false,
    });

    get().undo();
    expect(read().visible).toBe(true);
    get().undo();
    expect(read().name).toBe("Cube");
    get().undo();
    expect(read().color).toBe(node.color);
    get().undo();
    expect(read().transform.position).toEqual([0, 0.5, 0]);
  });

  it("a new change after an undo ends the redo chain", () => {
    get().addPrimitive("cube");
    get().undo();
    expect(nextRedoLabel(get().history)).toBe("Add cube");
    get().addPrimitive("cone");
    expect(nextRedoLabel(get().history)).toBeNull();
  });

  it("does not record steps for selection, mode or snap changes", () => {
    get().select("initial-cube");
    get().toggleSelect("initial-cube");
    get().setSelection(["initial-cube"]);
    get().setTransformMode("rotate");
    get().toggleSnap();
    expect(get().history.past).toHaveLength(0);
  });
});

describe("changes that change nothing leave no undo step", () => {
  it("same transform, same colour, same name, same visibility", () => {
    const node = get().scene.nodes["initial-cube"]!;
    get().setNodeTransform("initial-cube", { ...node.transform });
    get().setNodeTransforms({ "initial-cube": { ...node.transform } });
    get().setNodeColor("initial-cube", node.color.toUpperCase());
    get().renameNode("initial-cube", `  ${node.name} `);
    get().setNodeVisible("initial-cube", true);
    expect(get().history.past).toHaveLength(0);
  });

  it("refused input records nothing and returns null", () => {
    expect(get().setNodeColor("initial-cube", "red")).toBeNull();
    expect(get().renameNode("initial-cube", "   ")).toBeNull();
    expect(get().history.past).toHaveLength(0);
  });

  it("deleting or duplicating with nothing selected records nothing", () => {
    get().deleteSelected();
    get().duplicateSelected();
    expect(get().history.past).toHaveLength(0);
  });
});

describe("group transform", () => {
  it("is one undo step for several objects", () => {
    const sphereId = get().addPrimitive("sphere");
    const a = get().scene.nodes["initial-cube"]!;
    const b = get().scene.nodes[sphereId]!;
    const before = get().history.past.length;
    get().setNodeTransforms({
      [a.id]: { ...a.transform, position: [1, 0.5, 0] },
      [b.id]: { ...b.transform, position: [2, 0.5, 0] },
    });
    expect(get().history.past).toHaveLength(before + 1);
    get().undo();
    expect(get().scene.nodes[a.id]?.transform.position).toEqual([0, 0.5, 0]);
    expect(get().scene.nodes[b.id]?.transform.position).toEqual([0, 0.5, 0]);
  });
});

describe("an edit made of many small updates (dragging a value)", () => {
  const node = () => get().scene.nodes["initial-cube"]!;
  const moveTo = (x: number) =>
    get().previewNodeTransform("initial-cube", {
      ...node().transform,
      position: [x, 0.5, 0],
    });

  it("becomes exactly one undo step", () => {
    get().beginEdit("Transform");
    moveTo(1);
    moveTo(2);
    moveTo(3);
    expect(get().history.past).toHaveLength(0); // nothing recorded while dragging
    get().endEdit(true);

    expect(node().transform.position).toEqual([3, 0.5, 0]);
    expect(get().history.past).toHaveLength(1);
    expect(nextUndoLabel(get().history)).toBe("Transform");

    get().undo();
    expect(node().transform.position).toEqual([0, 0.5, 0]);
    get().redo();
    expect(node().transform.position).toEqual([3, 0.5, 0]);
  });

  it("cancelling restores the old value and records nothing", () => {
    get().beginEdit("Transform");
    moveTo(5);
    get().endEdit(false);
    expect(node().transform.position).toEqual([0, 0.5, 0]);
    expect(get().history.past).toHaveLength(0);
    expect(get().pendingEdit).toBeNull();
  });

  it("an edit that previewed nothing records nothing", () => {
    get().beginEdit("Transform");
    get().endEdit(true);
    expect(get().history.past).toHaveLength(0);
  });

  it("previews are ignored when no edit is in progress", () => {
    moveTo(9);
    expect(node().transform.position).toEqual([0, 0.5, 0]);
  });

  it("undo and redo do nothing while an edit is in progress", () => {
    get().addPrimitive("cube");
    get().beginEdit("Transform");
    moveTo(1);
    const nodes = nodeCount();
    get().undo();
    expect(nodeCount()).toBe(nodes);
    get().endEdit(true);
    get().undo(); // now it works: takes back the drag
    expect(node().transform.position).toEqual([0, 0.5, 0]);
  });
});

describe("re-parenting", () => {
  const moveTo = (x: number) => ({
    position: [x, 0.5, 0] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: [1, 1, 1] as [number, number, number],
  });

  it("is one undo step that restores the parent and the transform", () => {
    const sphere = get().addPrimitive("sphere");
    const before = get().scene.nodes[sphere]!;
    get().reparentNodes(
      [{ id: sphere, parentId: "initial-cube", transform: moveTo(2) }],
      "Move into Cube",
    );
    expect(get().scene.nodes[sphere]).toMatchObject({
      parentId: "initial-cube",
      transform: moveTo(2),
    });
    expect(nextUndoLabel(get().history)).toBe("Move into Cube");

    get().undo();
    expect(get().scene.nodes[sphere]?.parentId).toBeNull();
    expect(get().scene.nodes[sphere]?.transform).toEqual(before.transform);
    get().redo();
    expect(get().scene.nodes[sphere]?.parentId).toBe("initial-cube");
  });

  it("leaves no undo step when nothing changes", () => {
    const node = get().scene.nodes["initial-cube"]!;
    get().reparentNodes(
      [
        {
          id: "initial-cube",
          parentId: null,
          transform: { ...node.transform },
        },
      ],
      "Move to top level",
    );
    expect(get().history.past).toHaveLength(0);
  });

  it("refuses a loop and changes nothing", () => {
    const sphere = get().addPrimitive("sphere");
    get().reparentNodes(
      [{ id: sphere, parentId: "initial-cube", transform: moveTo(1) }],
      "Move",
    );
    const steps = get().history.past.length;
    expect(() =>
      get().reparentNodes(
        [{ id: "initial-cube", parentId: sphere, transform: moveTo(0) }],
        "Move",
      ),
    ).toThrow();
    expect(get().scene.nodes["initial-cube"]?.parentId).toBeNull();
    expect(get().history.past).toHaveLength(steps);
  });

  it("keeps the selection", () => {
    const sphere = get().addPrimitive("sphere");
    get().reparentNodes(
      [{ id: sphere, parentId: "initial-cube", transform: moveTo(1) }],
      "Move",
    );
    expect(get().selectedIds).toEqual([sphere]);
  });
});

describe("locked objects", () => {
  const lock = () => get().setNodesLocked(["initial-cube"], true);
  const cube = () => get().scene.nodes["initial-cube"]!;
  const at = (x: number, y: number, z: number): [number, number, number] => [
    x,
    y,
    z,
  ];

  it("locking and unlocking is one undo step each", () => {
    lock();
    expect(cube().locked).toBe(true);
    expect(nextUndoLabel(get().history)).toBe("Lock");
    get().setNodesLocked(["initial-cube"], false);
    expect(cube().locked).toBe(false);
    expect(nextUndoLabel(get().history)).toBe("Unlock");
    get().undo();
    expect(cube().locked).toBe(true);
    get().undo();
    expect(cube().locked).toBe(false);
  });

  it("locking something already locked records nothing", () => {
    lock();
    const steps = get().history.past.length;
    lock();
    expect(get().history.past).toHaveLength(steps);
  });

  it("a locked object cannot be moved, by any of the ways of moving it", () => {
    lock();
    const before = cube().transform;
    const moved = { ...before, position: at(9, 9, 9) };
    get().setNodeTransform("initial-cube", moved);
    get().setNodeTransforms({ "initial-cube": moved });
    get().beginEdit("Transform");
    get().previewNodeTransform("initial-cube", moved);
    get().endEdit(true);
    expect(cube().transform).toEqual(before);
    expect(get().history.past).toHaveLength(1); // only the lock itself
  });

  it("a locked object cannot be renamed or recoloured", () => {
    lock();
    expect(get().renameNode("initial-cube", "New name")).toBeNull();
    expect(get().setNodeColor("initial-cube", "#ff0000")).toBeNull();
    expect(cube()).toMatchObject({ name: "Cube", color: "#5cc4e0" });
  });

  it("a locked object is not deleted, and stays selected", () => {
    lock();
    get().select("initial-cube");
    get().deleteSelected();
    expect(get().scene.nodes["initial-cube"]).toBeDefined();
    expect(get().selectedIds).toEqual(["initial-cube"]);
  });

  it("deleting a mixed selection deletes only the unlocked objects", () => {
    lock();
    const sphere = get().addPrimitive("sphere");
    get().setSelection(["initial-cube", sphere]);
    get().deleteSelected();
    expect(get().scene.nodes[sphere]).toBeUndefined();
    expect(get().scene.nodes["initial-cube"]).toBeDefined();
    expect(get().selectedIds).toEqual(["initial-cube"]);
  });

  it("a locked object cannot be moved under another, nor can anything be put inside it", () => {
    lock();
    const sphere = get().addPrimitive("sphere");
    const moveTo = (id: string, parentId: string | null) =>
      get().reparentNodes(
        [{ id, parentId, transform: get().scene.nodes[id]!.transform }],
        "Move",
      );
    expect(() => moveTo("initial-cube", sphere)).toThrow();
    expect(() => moveTo(sphere, "initial-cube")).toThrow();
  });

  it("everything inside a locked parent is locked too", () => {
    const sphere = get().addPrimitive("sphere");
    get().reparentNodes(
      [
        {
          id: sphere,
          parentId: "initial-cube",
          transform: get().scene.nodes[sphere]!.transform,
        },
      ],
      "Move",
    );
    lock();
    const before = get().scene.nodes[sphere]!.transform;
    get().setNodeTransform(sphere, { ...before, position: at(5, 5, 5) });
    expect(get().scene.nodes[sphere]?.transform).toEqual(before);
    expect(get().renameNode(sphere, "Child")).toBeNull();
  });

  it("a locked object can still be hidden and duplicated", () => {
    lock();
    get().setNodeVisible("initial-cube", false);
    expect(cube().visible).toBe(false);
    get().select("initial-cube");
    get().duplicateSelected();
    expect(Object.keys(get().scene.nodes)).toHaveLength(2);
  });
});

describe("material (roughness and metalness)", () => {
  const cube = () => get().scene.nodes["initial-cube"]!;

  it("changes the values and is one undo step", () => {
    get().setNodeMaterial("initial-cube", { roughness: 0.2, metalness: 0.9 });
    expect(cube()).toMatchObject({ roughness: 0.2, metalness: 0.9 });
    expect(nextUndoLabel(get().history)).toBe("Material");
    get().undo();
    expect(cube()).toMatchObject({ roughness: 0.6, metalness: 0.1 });
  });

  it("keeps values between 0 and 1 and ignores nonsense", () => {
    get().setNodeMaterial("initial-cube", { roughness: 5, metalness: -3 });
    expect(cube()).toMatchObject({ roughness: 1, metalness: 0 });
    const steps = get().history.past.length;
    get().setNodeMaterial("initial-cube", { roughness: NaN });
    expect(get().history.past).toHaveLength(steps);
    expect(cube().roughness).toBe(1);
  });

  it("records nothing when the value does not change", () => {
    get().setNodeMaterial("initial-cube", { roughness: 0.6 });
    expect(get().history.past).toHaveLength(0);
  });

  it("dragging a slider is many previews and one undo step", () => {
    get().beginEdit("Material");
    get().previewNodeMaterial("initial-cube", { roughness: 0.5 });
    get().previewNodeMaterial("initial-cube", { roughness: 0.4 });
    get().previewNodeMaterial("initial-cube", { roughness: 0.3 });
    expect(get().history.past).toHaveLength(0);
    get().endEdit(true);
    expect(cube().roughness).toBe(0.3);
    expect(get().history.past).toHaveLength(1);
    get().undo();
    expect(cube().roughness).toBe(0.6);
  });

  it("previews are ignored when no edit is in progress", () => {
    get().previewNodeMaterial("initial-cube", { roughness: 0.1 });
    expect(cube().roughness).toBe(0.6);
  });

  it("a locked object's material cannot be changed", () => {
    get().setNodesLocked(["initial-cube"], true);
    get().setNodeMaterial("initial-cube", { roughness: 0.1 });
    get().beginEdit("Material");
    get().previewNodeMaterial("initial-cube", { roughness: 0.1 });
    get().endEdit(true);
    expect(cube().roughness).toBe(0.6);
  });

  it("a duplicate has the same material", () => {
    get().setNodeMaterial("initial-cube", { metalness: 0.8 });
    get().select("initial-cube");
    get().duplicateSelected();
    const copies = Object.values(get().scene.nodes).filter(
      (node) => node.id !== "initial-cube",
    );
    expect(copies).toHaveLength(1);
    expect(copies[0]?.metalness).toBe(0.8);
  });
});

describe("picking a colour (many previews, one undo step)", () => {
  const cube = () => get().scene.nodes["initial-cube"]!;

  it("is one undo step however many colours were passed through", () => {
    get().beginEdit("Change colour");
    get().previewNodeColor("initial-cube", "#112233");
    get().previewNodeColor("initial-cube", "#445566");
    get().previewNodeColor("initial-cube", "#AABBCC");
    expect(get().history.past).toHaveLength(0);
    get().endEdit(true);
    expect(cube().color).toBe("#aabbcc");
    expect(get().history.past).toHaveLength(1);
    expect(nextUndoLabel(get().history)).toBe("Change colour");
    get().undo();
    expect(cube().color).toBe("#5cc4e0");
  });

  it("ignores previews with no edit in progress, bad colours, and locked objects", () => {
    get().previewNodeColor("initial-cube", "#ff0000");
    expect(cube().color).toBe("#5cc4e0");

    get().beginEdit("Change colour");
    get().previewNodeColor("initial-cube", "not a colour");
    expect(cube().color).toBe("#5cc4e0");
    get().endEdit(true);

    get().setNodesLocked(["initial-cube"], true);
    get().beginEdit("Change colour");
    get().previewNodeColor("initial-cube", "#ff0000");
    get().endEdit(true);
    expect(cube().color).toBe("#5cc4e0");
  });

  it("cancelling restores the old colour", () => {
    get().beginEdit("Change colour");
    get().previewNodeColor("initial-cube", "#ff0000");
    get().endEdit(false);
    expect(cube().color).toBe("#5cc4e0");
    expect(get().history.past).toHaveLength(0);
  });
});

describe("importing a model", () => {
  const info = {
    id: "hash-of-a-car",
    name: "Muscle car",
    type: "model" as const,
    bytes: 2048,
    triangles: 9000,
    boundsMin: [-1, 0.2, -5] as [number, number, number],
    boundsMax: [1, 1.8, 5] as [number, number, number],
    note: "",
  };

  it("adds the file's record and an object that uses it, scaled to fit, and selects it", () => {
    const id = get().importModel(info);
    expect(get().scene.assets[info.id]).toEqual(info);
    const node = get().scene.nodes[id]!;
    expect(node).toMatchObject({
      kind: "model",
      assetId: info.id,
      name: "Muscle car",
    });
    expect(node.transform.scale[0]).toBeCloseTo(0.4); // longest side 10 -> 4 units
    expect(get().selectedIds).toEqual([id]);
  });

  it("is one undo step that takes the object away again", () => {
    const before = Object.keys(get().scene.nodes).length;
    get().importModel(info);
    expect(nextUndoLabel(get().history)).toBe("Import Muscle car");
    get().undo();
    expect(Object.keys(get().scene.nodes)).toHaveLength(before);
    get().redo();
    expect(Object.keys(get().scene.nodes)).toHaveLength(before + 1);
  });

  it("importing the same file twice makes two objects but remembers the file once", () => {
    get().importModel(info);
    get().importModel(info);
    expect(Object.keys(get().scene.assets)).toEqual([info.id]);
    const models = Object.values(get().scene.nodes).filter(
      (n) => n.kind === "model",
    );
    expect(models).toHaveLength(2);
  });

  it("an imported model can be moved, locked and duplicated like any object", () => {
    const id = get().importModel(info);
    const node = get().scene.nodes[id]!;
    get().setNodeTransform(id, { ...node.transform, position: [3, 0, 0] });
    expect(get().scene.nodes[id]?.transform.position).toEqual([3, 0, 0]);
    get().select(id);
    get().duplicateSelected();
    const models = Object.values(get().scene.nodes).filter(
      (n) => n.kind === "model",
    );
    expect(models).toHaveLength(2);
    get().setNodesLocked([id], true);
    get().setNodeTransform(id, { ...node.transform, position: [9, 9, 9] });
    expect(get().scene.nodes[id]?.transform.position).toEqual([3, 0, 0]);
  });
});

describe("loading a whole scene", () => {
  it("replaces the scene and clears the selection and the undo history", () => {
    get().addPrimitive("sphere");
    get().select("initial-cube");
    expect(get().history.past.length).toBeGreaterThan(0);

    const saved = {
      ...get().scene,
      nodes: {
        only: {
          ...get().scene.nodes["initial-cube"]!,
          id: "only",
          name: "Only",
        },
      },
    };
    get().loadScene(saved);
    expect(Object.keys(get().scene.nodes)).toEqual(["only"]);
    expect(get().selectedIds).toEqual([]);
    expect(get().history.past).toHaveLength(0);
    expect(get().history.future).toHaveLength(0);
    expect(get().pendingEdit).toBeNull();
  });
});

describe("copy and paste", () => {
  const names = () =>
    Object.values(get().scene.nodes)
      .map((n) => n.name)
      .sort();

  it("copy changes nothing in the scene and does not add an undo step", () => {
    get().select("initial-cube");
    const scene = get().scene;
    get().copySelected();
    expect(get().scene).toBe(scene);
    expect(get().history.past).toHaveLength(0);
    expect(get().clipboard).toMatchObject({
      mode: "copy",
      rootIds: ["initial-cube"],
    });
  });

  it("pasting a copy adds it beside the original, selects it, and is one undo step", () => {
    get().select("initial-cube");
    get().copySelected();
    get().pasteCopies(null);
    expect(names()).toEqual(["Cube", "Cube (1)"]);
    const copy = Object.values(get().scene.nodes).find(
      (n) => n.name === "Cube (1)",
    )!;
    expect(copy.transform.position).toEqual([1, 0.5, 0]); // one step beside the original
    expect(get().selectedIds).toEqual([copy.id]);
    expect(nextUndoLabel(get().history)).toBe("Paste");
    get().undo();
    expect(names()).toEqual(["Cube"]);
  });

  it("each paste lands a step further along, so copies do not pile up", () => {
    get().select("initial-cube");
    get().copySelected();
    get().pasteCopies(null);
    get().pasteCopies(null);
    get().pasteCopies(null);
    const xs = Object.values(get().scene.nodes)
      .map((n) => n.transform.position[0])
      .sort();
    expect(xs).toEqual([0, 1, 2, 3]);
  });

  it("a copy can be pasted inside another object, and inside the thing it was copied from", () => {
    const other = get().addPrimitive("sphere");
    get().select("initial-cube");
    get().copySelected();
    get().pasteCopies(other);
    const inside = Object.values(get().scene.nodes).find(
      (n) => n.name === "Cube (1)",
    )!;
    expect(inside.parentId).toBe(other);
    get().pasteCopies("initial-cube");
    const inOriginal = Object.values(get().scene.nodes).find(
      (n) => n.parentId === "initial-cube",
    )!;
    expect(inOriginal.kind).toBe("cube");
  });

  it("the given transforms replace the copied ones for the top objects (then the step along)", () => {
    get().select("initial-cube");
    get().copySelected();
    get().pasteCopies(null, {
      "initial-cube": {
        position: [10, 0, 0],
        rotation: [0, 0, 0],
        scale: [3, 3, 3],
      },
    });
    const copy = Object.values(get().scene.nodes).find(
      (n) => n.name === "Cube (1)",
    )!;
    expect(copy.transform.position).toEqual([11, 0, 0]);
    expect(copy.transform.scale).toEqual([3, 3, 3]);
  });

  it("paste with nothing copied does nothing", () => {
    const scene = get().scene;
    get().pasteCopies(null);
    expect(get().scene).toBe(scene);
  });

  it("the clipboard keeps what was copied even after the original is deleted", () => {
    get().select("initial-cube");
    get().copySelected();
    get().deleteSelected();
    expect(names()).toEqual([]);
    get().pasteCopies(null);
    expect(names()).toEqual(["Cube"]);
  });

  it("a locked object can be copied and pasted (the copy is locked too)", () => {
    get().setNodesLocked(["initial-cube"], true);
    get().select("initial-cube");
    get().copySelected();
    get().pasteCopies(null);
    expect(
      Object.values(get().scene.nodes).filter((n) => n.locked),
    ).toHaveLength(2);
  });

  it("copying a parent copies what is inside it, with the structure kept", () => {
    const child = get().addPrimitive("sphere");
    get().reparentNodes(
      [
        {
          id: child,
          parentId: "initial-cube",
          transform: get().scene.nodes[child]!.transform,
        },
      ],
      "Move",
    );
    get().select("initial-cube");
    get().copySelected();
    get().pasteCopies(null);
    expect(Object.keys(get().scene.nodes)).toHaveLength(4);
    const [newRoot] = get().selectedIds;
    const children = Object.values(get().scene.nodes).filter(
      (n) => n.parentId === newRoot,
    );
    expect(children).toHaveLength(1);
    expect(children[0]?.kind).toBe("sphere");
  });

  it("pasting a model works and shares the same file", () => {
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
    const id = get().importModel(info);
    get().select(id);
    get().copySelected();
    get().pasteCopies(null);
    const models = Object.values(get().scene.nodes).filter(
      (n) => n.kind === "model",
    );
    expect(models).toHaveLength(2);
    expect(new Set(models.map((m) => m.assetId))).toEqual(new Set(["f1"]));
    expect(Object.keys(get().scene.assets)).toEqual(["f1"]);
  });
});

describe("cut (marks the objects; pasting moves them)", () => {
  it("cut only MARKS the objects: nothing is deleted or moved, and there is no undo step", () => {
    get().select("initial-cube");
    const scene = get().scene;
    get().cutSelected();
    expect(get().scene).toBe(scene);
    expect(get().history.past).toHaveLength(0);
    expect(get().clipboard).toMatchObject({
      mode: "cut",
      rootIds: ["initial-cube"],
    });
  });

  it("cut skips locked objects, and does nothing if nothing is left to cut", () => {
    get().setNodesLocked(["initial-cube"], true);
    get().select("initial-cube");
    get().cutSelected();
    expect(get().clipboard).toBeNull();
    expect(get().scene.nodes["initial-cube"]).toBeDefined();
  });

  it("cutting something else replaces the mark", () => {
    const b = get().addPrimitive("sphere");
    get().select("initial-cube");
    get().cutSelected();
    get().select(b);
    get().cutSelected();
    expect(get().clipboard?.rootIds).toEqual([b]);
  });

  it("copying after a cut replaces the cut, so the cut object stops being marked", () => {
    get().select("initial-cube");
    get().cutSelected();
    get().copySelected();
    expect(get().clipboard?.mode).toBe("copy");
  });

  it("pasteCopies does nothing when the clipboard holds a cut (a cut is moved, see pasteClipboard)", () => {
    get().select("initial-cube");
    get().cutSelected();
    const scene = get().scene;
    get().pasteCopies(null);
    expect(get().scene).toBe(scene);
  });

  it("clearClipboard forgets a cut, so the object is no longer marked", () => {
    get().select("initial-cube");
    get().cutSelected();
    get().clearClipboard();
    expect(get().clipboard).toBeNull();
  });
});

describe("reset transform and hide / show for the selection", () => {
  it("reset transform puts position, rotation and scale of the selected objects back, in one step", () => {
    const a = get().scene.nodes["initial-cube"]!;
    const b = get().addPrimitive("sphere");
    get().setNodeTransform("initial-cube", {
      ...a.transform,
      position: [5, 5, 5],
      scale: [2, 2, 2],
    });
    get().setSelection(["initial-cube", b]);
    const steps = get().history.past.length;
    get().resetSelectedTransforms();
    expect(get().scene.nodes["initial-cube"]?.transform).toEqual({
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
    expect(get().scene.nodes[b]?.transform.position).toEqual([0, 0, 0]);
    expect(get().history.past).toHaveLength(steps + 1);
    expect(nextUndoLabel(get().history)).toBe("Reset transform");
  });

  it("reset leaves locked objects alone and records nothing if nothing changes", () => {
    get().setNodesLocked(["initial-cube"], true);
    const moved = { ...get().scene.nodes["initial-cube"]!.transform };
    get().select("initial-cube");
    const steps = get().history.past.length;
    get().resetSelectedTransforms();
    expect(get().scene.nodes["initial-cube"]?.transform).toEqual(moved);
    expect(get().history.past).toHaveLength(steps);
  });

  it("hide and show work on several objects as one undo step", () => {
    const b = get().addPrimitive("sphere");
    get().setNodesVisible(["initial-cube", b], false);
    expect(get().scene.nodes["initial-cube"]?.visible).toBe(false);
    expect(get().scene.nodes[b]?.visible).toBe(false);
    expect(nextUndoLabel(get().history)).toBe("Hide");
    get().undo();
    expect(get().scene.nodes[b]?.visible).toBe(true);
    const steps = get().history.past.length;
    get().setNodesVisible(["initial-cube"], true); // already visible: nothing to do
    expect(get().history.past).toHaveLength(steps);
  });
});

describe("order of siblings", () => {
  const order = (parentId: string | null) =>
    Object.values(get().scene.nodes)
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map((n) => n.name);
  const move = (
    id: string,
    parentId: string | null,
    beforeId: string | null | undefined,
    label = "Reorder",
  ) =>
    get().reparentNodes(
      [{ id, parentId, transform: get().scene.nodes[id]!.transform, beforeId }],
      label,
    );

  it("new objects, pastes and imports go after the existing ones", () => {
    get().addPrimitive("sphere");
    get().addPrimitive("cone");
    expect(order(null)).toEqual(["Cube", "Sphere", "Cone"]);
  });

  it("moving an object before another reorders them, as one undo step that undo reverses", () => {
    const sphere = get().addPrimitive("sphere");
    const cone = get().addPrimitive("cone");
    move(cone, null, "initial-cube");
    expect(order(null)).toEqual(["Cone", "Cube", "Sphere"]);
    expect(nextUndoLabel(get().history)).toBe("Reorder");
    get().undo();
    expect(order(null)).toEqual(["Cube", "Sphere", "Cone"]);
    expect(sphere).toBeDefined();
  });

  it("a move that changes nothing records no undo step", () => {
    get().addPrimitive("sphere");
    const steps = get().history.past.length;
    move("initial-cube", null, null); // moving the first object to the end... is a change
    expect(get().history.past).toHaveLength(steps + 1);
    const after = get().history.past.length;
    const first = Object.values(get().scene.nodes).sort(
      (a, b) => a.order - b.order,
    )[0]!;
    move(first.id, null, undefined); // no place given, same parent: nothing to do
    expect(get().history.past).toHaveLength(after);
  });

  it("an object can be put first inside a parent: right under the parent", () => {
    const parent = get().addPrimitive("cube");
    const a = get().addPrimitive("sphere");
    const b = get().addPrimitive("cone");
    move(a, parent, null, "Move");
    move(b, parent, a, "Move"); // before a
    expect(order(parent)).toEqual(["Cone", "Sphere"]);
  });

  it("a copy keeps the order of the objects inside the original", () => {
    const parent = get().addPrimitive("cube");
    const x = get().addPrimitive("sphere");
    const y = get().addPrimitive("cone");
    move(x, parent, null, "Move");
    move(y, parent, x, "Move"); // inside the parent: Cone, Sphere
    get().select(parent);
    get().duplicateSelected();
    const copy = Object.values(get().scene.nodes).find(
      (n) => n.name === "Cube (1)",
    )!;
    const inside = Object.values(get().scene.nodes)
      .filter((n) => n.parentId === copy.id)
      .sort((p, q) => p.order - q.order)
      .map((n) => n.name);
    expect(inside).toEqual(["Cone", "Sphere"]);
  });

  it("the order is saved with the scene and survives loading it again", () => {
    const sphere = get().addPrimitive("sphere");
    move(sphere, null, "initial-cube");
    const saved = JSON.parse(JSON.stringify(get().scene));
    get().loadScene(saved);
    expect(order(null)).toEqual(["Sphere", "Cube"]);
  });
});

describe("the Assets panel actions", () => {
  const info = {
    id: "hash-of-a-car",
    name: "Muscle car",
    type: "model" as const,
    bytes: 2048,
    triangles: 9000,
    boundsMin: [-1, 0.2, -5] as [number, number, number],
    boundsMax: [1, 1.8, 5] as [number, number, number],
    note: "",
  };

  it("places another object that uses the same file, with a free name, and selects it", () => {
    const first = get().importModel(info);
    const second = get().placeAsset(info.id)!;
    expect(second).not.toBe(first);
    expect(get().scene.nodes[second]).toMatchObject({
      kind: "model",
      assetId: info.id,
      name: "Muscle car (1)",
    });
    expect(Object.keys(get().scene.assets)).toEqual([info.id]);
    expect(get().selectedIds).toEqual([second]);
    expect(nextUndoLabel(get().history)).toBe("Place Muscle car");
  });

  it("places the object at the given spot on the ground (a drop on the 3D view)", () => {
    get().importModel(info);
    const id = get().placeAsset(info.id, [3, 0, -2])!;
    expect(get().scene.nodes[id]?.transform.position).toEqual([3, 0, -2]);
    const middle = get().placeAsset(info.id)!;
    expect(get().scene.nodes[middle]?.transform.position).toEqual([0, 0, 0]);
  });

  it("placing an unknown file does nothing", () => {
    const before = get().scene;
    expect(get().placeAsset("nope")).toBeNull();
    expect(get().scene).toBe(before);
  });

  it("renames the file and edits its note, each as one undo step, and ignores no-ops", () => {
    get().importModel(info);
    get().renameAsset(info.id, "Red car");
    expect(get().scene.assets[info.id]?.name).toBe("Red car");
    get().setAssetNote(info.id, "CC-BY, by Jane");
    expect(get().scene.assets[info.id]?.note).toBe("CC-BY, by Jane");
    const steps = get().history.past.length;
    get().renameAsset(info.id, "Red car");
    get().renameAsset(info.id, "   ");
    get().setAssetNote(info.id, "CC-BY, by Jane");
    expect(get().history.past).toHaveLength(steps);
    get().undo();
    expect(get().scene.assets[info.id]?.note).toBe("");
  });

  it("deleting a file removes the objects that use it, in one undo step", () => {
    get().importModel(info);
    get().placeAsset(info.id);
    const others = Object.values(get().scene.nodes).filter(
      (n) => n.assetId !== info.id,
    ).length;
    get().deleteAsset(info.id);
    expect(get().scene.assets).toEqual({});
    expect(Object.keys(get().scene.nodes)).toHaveLength(others);
    expect(get().selectedIds).toEqual([]);
    get().undo();
    expect(Object.keys(get().scene.assets)).toEqual([info.id]);
    expect(Object.keys(get().scene.nodes)).toHaveLength(others + 2);
  });
});
