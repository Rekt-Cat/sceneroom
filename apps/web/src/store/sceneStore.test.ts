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
