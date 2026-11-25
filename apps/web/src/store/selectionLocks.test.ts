import { beforeEach, describe, expect, it } from "vitest";
import {
  addNode,
  createEmptyScene,
  createNode,
  type Scene,
} from "@sceneroom/shared";
import { forgetLastBlockedMessage } from "@/collab/blockedByOthers";
import { useCollabStore } from "@/collab/collabStore";
import type { Holder } from "@/collab/objectHolds";
import { useImportStore } from "./importStore";
import { useSceneStore } from "./sceneStore";

const get = () => useSceneStore.getState();
const ada: Holder = { clientId: 7, name: "Ada", color: "#ff6b6b" };

/** house (roof, door), tree, lamp */
function village(): Scene {
  let scene = createEmptyScene();
  const add = (id: string, name: string, parentId: string | null = null) => {
    scene = addNode(scene, { ...createNode(id, "cube"), name, parentId });
  };
  add("house", "House");
  add("roof", "Roof", "house");
  add("door", "Door", "house");
  add("tree", "Tree");
  add("lamp", "Lamp");
  return scene;
}

/** Ada holds the house: the house, roof and door are out of bounds for me. */
function adaHoldsTheHouse(
  extra: Partial<ReturnType<typeof useCollabStore.getState>> = {},
) {
  useCollabStore.setState({
    active: true,
    status: "online",
    readOnly: false,
    holds: { house: ada },
    blocked: { house: ada, roof: ada, door: ada },
    ...extra,
  });
}

beforeEach(() => {
  useSceneStore.setState(useSceneStore.getInitialState(), true);
  get().loadScene(village());
  useCollabStore.setState(useCollabStore.getInitialState(), true);
  useImportStore.setState({ message: null });
  forgetLastBlockedMessage();
});

/** One object moving under a new parent, keeping its transform (the tests do not care where it lands). */
const move = (id: string, parentId: string | null) => ({
  id,
  parentId,
  transform: get().scene.nodes[id]!.transform,
});

const message = () => useImportStore.getState().message?.text ?? null;

describe("selecting what someone else holds", () => {
  it("is refused with a message that names them; a free object is selected as usual", () => {
    adaHoldsTheHouse();
    get().select("house");
    expect(get().selectedIds).toEqual([]);
    expect(message()).toBe(
      'Ada is working on "House" right now. Try again when they are done.',
    );
    get().select("tree");
    expect(get().selectedIds).toEqual(["tree"]);
  });

  it("what is inside a held object, and what it is inside of, is refused too", () => {
    adaHoldsTheHouse();
    get().select("roof");
    expect(get().selectedIds).toEqual([]);
    // Ada holds the roof only: the house around it is refused, the door beside it is free
    adaHoldsTheHouse({
      holds: { roof: ada },
      blocked: { roof: ada, house: ada },
    });
    get().select("house");
    expect(get().selectedIds).toEqual([]);
    get().select("door");
    expect(get().selectedIds).toEqual(["door"]);
  });

  it("adding to a selection and selecting a list leave the held ones out", () => {
    adaHoldsTheHouse();
    get().select("lamp");
    get().toggleSelect("house");
    get().toggleSelect("tree");
    expect(get().selectedIds).toEqual(["lamp", "tree"]);
    get().setSelection(["house", "door", "lamp", "tree"]);
    expect(get().selectedIds).toEqual(["lamp", "tree"]);
  });

  it("deselecting something still works when it became held meanwhile", () => {
    get().setSelection(["house", "lamp"]);
    adaHoldsTheHouse();
    get().toggleSelect("house");
    expect(get().selectedIds).toEqual(["lamp"]);
  });

  it("is free again once the hold is gone", () => {
    adaHoldsTheHouse();
    get().select("house");
    useCollabStore.getState().setHolds({}, {});
    get().select("house");
    expect(get().selectedIds).toEqual(["house"]);
  });

  it("the same refusal is not announced again at once", () => {
    adaHoldsTheHouse();
    let announced = 0;
    const stop = useImportStore.subscribe((state, previous) => {
      if (state.message !== previous.message && state.message) announced += 1;
    });
    get().select("house");
    get().select("house");
    get().select("house");
    stop();
    expect(announced).toBe(1);
  });
});

describe("when the holds do not apply", () => {
  it("not online at all, with no connection, and for a viewer, nothing is refused", () => {
    for (const state of [
      { active: false, status: "off" as const },
      { status: "offline" as const },
      { status: "connecting" as const },
      { readOnly: true },
    ]) {
      useSceneStore.setState({ selectedIds: [] });
      adaHoldsTheHouse(state);
      get().select("house");
      expect(get().selectedIds).toEqual(["house"]);
    }
    expect(message()).toBeNull();
  });
});

describe("changing what someone else holds", () => {
  it("an edit by id is refused like a locked object, and the others are not", () => {
    adaHoldsTheHouse();
    const before = get().scene;
    const house = before.nodes["house"]!;
    get().setNodeTransform("house", {
      ...house.transform,
      position: [9, 0, 9],
    });
    expect(get().scene).toBe(before);
    expect(get().renameNode("house", "Mine now")).toBeNull();
    expect(get().setNodeColor("door", "#ff0000")).toBeNull();
    expect(get().scene).toBe(before);
    expect(get().renameNode("tree", "Oak")).toBe("Oak");
    expect(get().scene.nodes["tree"]!.name).toBe("Oak");
  });

  it("hiding and showing is refused, and says who has it", () => {
    adaHoldsTheHouse();
    get().setNodeVisible("roof", false);
    expect(get().scene.nodes["roof"]!.visible).toBe(true);
    expect(message()).toContain("Ada is working on");
    get().setNodesVisible(["roof", "tree"], false);
    expect(get().scene.nodes["roof"]!.visible).toBe(true);
    expect(get().scene.nodes["tree"]!.visible).toBe(false);
  });

  it("padlocking is refused for held objects", () => {
    adaHoldsTheHouse();
    get().setNodesLocked(["house", "tree"], true);
    expect(get().scene.nodes["house"]!.locked).toBe(false);
    expect(get().scene.nodes["tree"]!.locked).toBe(true);
  });

  it("moving an object under a held one, or a held one anywhere, is refused", () => {
    adaHoldsTheHouse();
    const before = get().scene;
    get().reparentNodes([move("lamp", "house")], "Move");
    get().reparentNodes([move("door", null)], "Move");
    get().reparentNodes([move("house", "tree")], "Move");
    expect(get().scene).toBe(before);
    expect(message()).toContain("Ada is working on");
    get().reparentNodes([move("lamp", "tree")], "Move");
    expect(get().scene.nodes["lamp"]!.parentId).toBe("tree");
  });

  it("delete skips a held object that was still in the selection (a clash resolved too late)", () => {
    get().setSelection(["house", "lamp"]);
    adaHoldsTheHouse();
    get().deleteSelected();
    expect(Object.keys(get().scene.nodes).sort()).toEqual([
      "door",
      "house",
      "roof",
      "tree",
    ]);
  });

  it("nothing is refused when the holds do not apply", () => {
    adaHoldsTheHouse({ readOnly: true });
    get().setNodeVisible("roof", false);
    get().setNodesLocked(["house"], true);
    expect(get().scene.nodes["roof"]!.visible).toBe(false);
    expect(get().scene.nodes["house"]!.locked).toBe(true);
  });
});
