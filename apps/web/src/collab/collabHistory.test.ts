import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createEmptyScene,
  nextRedoLabel,
  nextUndoLabel,
} from "@sceneroom/shared";
import { useImportStore } from "@/store/importStore";
import { useSceneStore } from "@/store/sceneStore";
import { watchHistory } from "./collabHistory";
import { useCollabStore } from "./collabStore";

const get = () => useSceneStore.getState();
let stopWatching: () => void;

/** The editor goes online, as startCollab does it. */
function goOnline() {
  useCollabStore.getState().setStatus("online");
  stopWatching = watchHistory((listener) => useSceneStore.subscribe(listener));
}

/** What another person's change looks like to this editor: a new scene, no history step. */
function someoneElse(
  change: (
    scene: ReturnType<typeof get>["scene"],
  ) => ReturnType<typeof get>["scene"],
) {
  get().applyRemoteScene(change(get().scene));
}

beforeEach(() => {
  useSceneStore.setState(useSceneStore.getInitialState(), true);
  get().loadScene(createEmptyScene());
  useImportStore.getState().setMessage(null);
});
afterEach(() => {
  stopWatching?.();
  useCollabStore.getState().setStatus("off");
});

describe("Undo and Redo while online", () => {
  it("undo takes back my change, and my change only", () => {
    goOnline();
    const mine = get().addPrimitive("cube");
    // someone else adds a sphere
    someoneElse((scene) => ({
      ...scene,
      nodes: {
        ...scene.nodes,
        theirs: { ...scene.nodes[mine]!, id: "theirs", name: "Their sphere" },
      },
    }));
    expect(Object.keys(get().scene.nodes).sort()).toEqual(
      [mine, "theirs"].sort(),
    );

    get().undo();
    expect(Object.keys(get().scene.nodes)).toEqual(["theirs"]);
    expect(nextRedoLabel(get().history)).toBe("Add cube");

    get().redo();
    expect(Object.keys(get().scene.nodes).sort()).toEqual(
      [mine, "theirs"].sort(),
    );
    expect(nextUndoLabel(get().history)).toBe("Add cube");
  });

  it("another person's change to the same object is kept when I undo a different field", () => {
    goOnline();
    const id = get().addPrimitive("cube");
    get().setNodeTransform(id, {
      ...get().scene.nodes[id]!.transform,
      position: [4, 0, 0],
    });
    // they recolour the same object
    someoneElse((scene) => ({
      ...scene,
      nodes: {
        ...scene.nodes,
        [id]: { ...scene.nodes[id]!, color: "#ff0000" },
      },
    }));
    get().undo(); // takes back my move
    expect(get().scene.nodes[id]!.transform.position).toEqual([0, 0.5, 0]);
    expect(get().scene.nodes[id]!.color).toBe("#ff0000");
  });

  it("a field someone else changed after me is left, and the person is told", () => {
    goOnline();
    const id = get().addPrimitive("cube");
    get().setNodeTransform(id, {
      ...get().scene.nodes[id]!.transform,
      position: [4, 0, 0],
    });
    someoneElse((scene) => ({
      ...scene,
      nodes: {
        ...scene.nodes,
        [id]: {
          ...scene.nodes[id]!,
          transform: { ...scene.nodes[id]!.transform, position: [8, 8, 8] },
        },
      },
    }));
    get().undo();
    expect(get().scene.nodes[id]!.transform.position).toEqual([8, 8, 8]);
    expect(useImportStore.getState().message?.text).toMatch(/someone else/);
  });

  it("the step labels and counts work as before", () => {
    goOnline();
    get().addPrimitive("cube");
    get().addPrimitive("sphere");
    expect(nextUndoLabel(get().history)).toBe("Add sphere");
    expect(get().history.past).toHaveLength(2);
    get().undo();
    expect(nextUndoLabel(get().history)).toBe("Add cube");
    expect(get().history.future).toHaveLength(1);
    get().undo();
    get().undo(); // nothing left: harmless
    expect(Object.keys(get().scene.nodes)).toHaveLength(0);
    get().redo();
    get().redo();
    expect(Object.keys(get().scene.nodes)).toHaveLength(2);
  });

  it("a drag is one step, and its undo takes back the whole drag", () => {
    goOnline();
    const id = get().addPrimitive("cube");
    get().beginEdit("Move");
    for (let x = 1; x <= 5; x++) {
      get().previewNodeTransform(id, {
        ...get().scene.nodes[id]!.transform,
        position: [x, 0, 0],
      });
    }
    get().endEdit(true);
    expect(get().scene.nodes[id]!.transform.position).toEqual([5, 0, 0]);
    get().undo();
    expect(get().scene.nodes[id]!.transform.position).toEqual([0, 0.5, 0]);
    get().redo();
    expect(get().scene.nodes[id]!.transform.position).toEqual([5, 0, 0]);
  });

  it("steps from before going online cannot be undone (they could undo other people's work), and it says so", () => {
    get().addPrimitive("cube"); // made offline
    goOnline();
    const second = get().addPrimitive("sphere");
    get().undo(); // my online step: fine
    expect(get().scene.nodes[second]).toBeUndefined();
    get().undo(); // the offline step: refused
    expect(Object.keys(get().scene.nodes)).toHaveLength(1);
    expect(useImportStore.getState().message?.text).toMatch(
      /before this project went online/,
    );
    expect(get().history.past).toHaveLength(0);
  });

  it("offline, Undo is the editor's normal Undo as before", () => {
    const id = get().addPrimitive("cube");
    get().undo();
    expect(get().scene.nodes[id]).toBeUndefined();
  });

  it("the selection after Undo only holds objects that still exist", () => {
    goOnline();
    const a = get().addPrimitive("cube");
    get().addPrimitive("sphere"); // selects the sphere
    someoneElse((scene) => {
      const rest = Object.fromEntries(
        Object.entries(scene.nodes).filter(([id]) => id !== a),
      );
      return { ...scene, nodes: rest };
    });
    get().undo(); // undo adding the sphere; before it, the cube was selected but is gone now
    expect(get().selectedIds).toEqual([]);
  });
});
