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
