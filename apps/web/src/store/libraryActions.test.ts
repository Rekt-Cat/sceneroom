import { beforeEach, describe, expect, it } from "vitest";
import {
  addAsset,
  addNode,
  createEmptyScene,
  createModelNode,
  createNode,
  prefabInstanceIds,
  prefabRootId,
  type AssetInfo,
  type Scene,
} from "@sceneroom/shared";
import {
  allScenes,
  deleteModel,
  deletePrefab,
  makePrefab,
  placeLibraryItem,
  projectModels,
  renameModel,
  renamePrefab,
  setModelNote,
  applyPrefabScene,
  closePrefabScene,
  editPrefab,
} from "./libraryActions";
import { getProject, useProjectStore } from "./projectStore";
import { useSceneStore } from "./sceneStore";

const info = (id: string, name = "Car"): AssetInfo => ({
  id,
  name,
  type: "model",
  bytes: 10,
  triangles: 3,
  boundsMin: [0, 0, 0],
  boundsMax: [1, 1, 1],
  note: "",
});

const project = () => useProjectStore.getState();
const scene = () => useSceneStore.getState();

/** The scene that is open, as a plain scene. */
const open = (): Scene => scene().scene;
/** Another scene of the project, by its tab number. */
const sceneAt = (index: number): Scene => {
  const tab = project().scenes[index]!;
  return tab.id === project().activeSceneId
    ? open()
    : project().parked[tab.id]!.scene;
};

beforeEach(() => {
  useSceneStore.setState(useSceneStore.getInitialState(), true);
  useProjectStore.setState(useProjectStore.getInitialState(), true);
});

/** Scene 1 has a car model (one object); scene 2 is empty and open. */
function twoScenesWithCarInFirst() {
  let first = addAsset(createEmptyScene(), info("car"));
  first = addNode(first, createModelNode("car-1", "Car", "car", 1));
  scene().loadScene(first);
  project().addScene("blank");
}

describe("imported models belong to the whole project", () => {
  it("scene 2 lists the model that only scene 1 has", () => {
    twoScenesWithCarInFirst();
    expect(Object.keys(open().assets)).toEqual([]); // the open scene has no record...
    expect(projectModels().map((m) => m.id)).toEqual(["car"]); // ...but the project does
    expect(allScenes()).toHaveLength(2);
  });

  it("placing it in scene 2 adds its record to scene 2 and puts an object there, as one undo step", () => {
    twoScenesWithCarInFirst();
    const id = placeLibraryItem("car")!;
    expect(open().nodes[id]?.assetId).toBe("car");
    expect(open().assets["car"]).toBeDefined();
    expect(scene().selectedIds).toEqual([id]);
    scene().undo();
    expect(Object.keys(open().nodes)).toEqual([]);
  });

  it("an unknown id places nothing", () => {
    expect(placeLibraryItem("nope")).toBeNull();
  });

  it("renaming and noting a model changes it in every scene", () => {
    twoScenesWithCarInFirst();
    placeLibraryItem("car");
    renameModel("car", "Sports car");
    setModelNote("car", "CC-BY, from a friend");
    for (const index of [0, 1]) {
      expect(sceneAt(index).assets["car"]?.name).toBe("Sports car");
      expect(sceneAt(index).assets["car"]?.note).toBe("CC-BY, from a friend");
    }
  });

  it("deleting a model deletes the objects that show it in every scene", () => {
    twoScenesWithCarInFirst();
    placeLibraryItem("car");
    expect(deleteModel("car")).toBeNull();
    expect(projectModels()).toEqual([]);
    for (const index of [0, 1]) {
      expect(Object.keys(sceneAt(index).nodes)).toEqual([]);
    }
  });
});

/** A "house" (a cube with a cone inside) in the open scene. */
function houseInOpenScene() {
  let house = addNode(createEmptyScene(), {
    ...createNode("house", "cube"),
    name: "House",
  });
  house = addNode(house, {
    ...createNode("roof", "cone"),
    name: "Roof",
    parentId: "house",
  });
  scene().loadScene(house);
}

/** Changes the roof's colour in the open scene (as the Inspector would). */
function paintRoof(color: string) {
  const roof = Object.values(open().nodes).find((n) => n.name === "Roof")!;
  useSceneStore.setState((state) => ({
    scene: {
      ...state.scene,
      nodes: { ...state.scene.nodes, [roof.id]: { ...roof, color } },
    },
  }));
}

const roofColours = (s: Scene) =>
  Object.values(s.nodes)
    .filter((n) => n.name === "Roof")
    .map((n) => n.color);

describe("prefabs", () => {
  it("making a prefab keeps it in the project, and the object becomes a linked copy where it stands", () => {
    houseInOpenScene();
    expect(makePrefab("house")).toBeNull();
    const [prefab] = Object.values(project().prefabs);
    expect(prefab?.name).toBe("House");
    expect(prefab?.nodes.map((n) => n.id)).toEqual(["house", "roof"]);
    expect(open().nodes["house"]?.prefab).toEqual({ id: prefab!.id });
    // the inside was rebuilt as managed (locked) objects
    const inside = Object.values(open().nodes).filter((n) => n.id !== "house");
    expect(inside).toHaveLength(1);
    expect(inside[0]!.locked).toBe(true);
    scene().undo(); // one undo step brings the plain object back (the library entry stays)
    expect(open().nodes["house"]?.prefab).toBeNull();
    expect(open().nodes["roof"]).toBeDefined();
  });

  it("refuses with a reason, and changes nothing", () => {
    houseInOpenScene();
    makePrefab("house");
    expect(makePrefab("house")).toContain("copy of a prefab");
    expect(Object.keys(project().prefabs)).toHaveLength(1);
    expect(makePrefab("missing")).toContain("no longer exists");
  });

  it("a prefab made in scene 1 can be placed in scene 2 as a linked copy", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    project().addScene("blank");
    const copy = placeLibraryItem(prefabId, [4, 0, 6])!;
    expect(open().nodes[copy]?.prefab).toEqual({ id: prefabId });
    expect(open().nodes[copy]?.transform.position[0]).toBe(4);
    expect(open().nodes[copy]?.transform.position[2]).toBe(6);
    // the cube's own height is kept, not the ground's
    expect(open().nodes[copy]?.transform.position[1]).toBe(0.5);
    expect(Object.keys(open().nodes)).toHaveLength(2);
  });

  it("opening a prefab makes a scene of its own, once, holding exactly the prefab", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    const home = project().activeSceneId;
    expect(editPrefab(prefabId)).toBeNull();
    const tab = project().scenes.find((s) => s.prefabId === prefabId)!;
    expect(project().activeSceneId).toBe(tab.id);
    expect(tab.name).toBe("Prefab: House");
    expect(Object.keys(open().nodes)).toEqual(["house", "roof"]);
    expect(open().nodes["house"]?.prefab).toBeNull();
    expect(open().nodes["roof"]?.locked).toBe(false);
    expect(scene().selectedIds).toEqual(["house"]);
    // opening it again goes to the same tab
    project().switchScene(home);
    expect(editPrefab(prefabId)).toBeNull();
    expect(project().scenes.filter((s) => s.prefabId)).toHaveLength(1);
    expect(project().activeSceneId).toBe(tab.id);
    expect(editPrefab("nope")).toContain("no longer exists");
  });

  it("changing the prefab's scene changes the copies in every scene (the scene it was made in too)", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    placeLibraryItem(prefabId); // a second copy in the same scene
    project().addScene("blank");
    placeLibraryItem(prefabId, [5, 0, 5]); // a copy in scene 2

    editPrefab(prefabId);
    paintRoof("#ff0000");
    expect(applyPrefabScene(project().activeSceneId)).toEqual({
      problem: null,
      extra: 0,
    });
    expect(project().prefabs[prefabId]?.revision).toBe(2);
    expect(roofColours(sceneAt(0))).toEqual(["#ff0000", "#ff0000"]);
    expect(roofColours(sceneAt(1))).toEqual(["#ff0000"]);
    // the copies are still linked
    expect(prefabInstanceIds(sceneAt(1), prefabId)).toHaveLength(1);
    // applying again with no change does nothing
    applyPrefabScene(project().activeSceneId);
    expect(project().prefabs[prefabId]?.revision).toBe(2);
  });

  it("finishing leaves the scene the prefab was edited from showing the new look, as one undo step", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    const home = project().activeSceneId;
    editPrefab(prefabId);
    const editing = project().activeSceneId;
    paintRoof("#00ff00");
    // closing applies the last change, removes the editing tab, and opens a neighbour
    expect(closePrefabScene(editing)).toBeNull();
    expect(project().scenes.some((s) => s.prefabId)).toBe(false);
    expect(project().activeSceneId).toBe(home);
    expect(roofColours(open())).toEqual(["#00ff00"]);
  });

  it("reading the prefab back: a deleted top object is refused with a reason, and nothing changes", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    editPrefab(prefabId);
    scene().select("house");
    scene().deleteSelected();
    const result = applyPrefabScene(project().activeSceneId);
    expect(result.problem).toContain("not in this scene any more");
    expect(project().prefabs[prefabId]?.revision).toBe(1);
    expect(prefabRootId(project().prefabs[prefabId]!)).toBe("house");
    // and closing says so instead of silently dropping the work
    expect(closePrefabScene(project().activeSceneId)).toContain(
      "not in this scene",
    );
  });

  it("other top-level objects in the prefab scene are not part of the prefab, and are counted", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    editPrefab(prefabId);
    scene().addPrimitive("sphere");
    const result = applyPrefabScene(project().activeSceneId);
    expect(result).toEqual({ problem: null, extra: 1 });
    expect(project().prefabs[prefabId]?.nodes.map((n) => n.id)).toEqual([
      "house",
      "roof",
    ]);
  });

  it("deleting a prefab leaves its copies as ordinary, editable objects, and closes its scene", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    placeLibraryItem(prefabId);
    project().addScene("blank");
    placeLibraryItem(prefabId);
    editPrefab(prefabId);
    deletePrefab(prefabId);
    expect(project().prefabs).toEqual({});
    expect(project().scenes.some((s) => s.prefabId)).toBe(false);
    for (let index = 0; index < project().scenes.length; index++) {
      const nodes = Object.values(sceneAt(index).nodes);
      expect(nodes.length).toBeGreaterThan(0);
      expect(nodes.every((n) => n.prefab === null && !n.locked)).toBe(true);
    }
  });

  it("renames a prefab, refusing an empty or used name", () => {
    houseInOpenScene();
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    expect(renamePrefab(prefabId, "Cottage")).toBeNull();
    expect(project().prefabs[prefabId]?.name).toBe("Cottage");
    expect(renamePrefab(prefabId, "  ")).toContain("needs a name");
    // a second prefab with the same name gets a numbered name when it is made
    scene().loadScene(
      addNode(createEmptyScene(), {
        ...createNode("c", "cube"),
        name: "Cottage",
      }),
    );
    makePrefab("c");
    const second = Object.values(project().prefabs).find(
      (p) => p.id !== prefabId,
    )!;
    expect(second.name).toBe("Cottage (2)");
    expect(renamePrefab(second.id, "Cottage")).toContain("already");
  });

  it("a prefab with a model blocks deleting that model until the prefab is deleted", () => {
    let withCar = addAsset(createEmptyScene(), info("car"));
    withCar = addNode(withCar, createModelNode("car-1", "Car", "car", 1));
    scene().loadScene(withCar);
    makePrefab("car-1");
    expect(deleteModel("car")).toContain("prefab");
    expect(Object.values(open().nodes).some((n) => n.assetId === "car")).toBe(
      true,
    );
    deletePrefab(Object.keys(project().prefabs)[0]!);
    expect(deleteModel("car")).toBeNull();
  });

  it("prefabs and prefab scenes are part of the project that is saved", () => {
    houseInOpenScene();
    makePrefab("house");
    editPrefab(Object.keys(project().prefabs)[0]!);
    const saved = getProject();
    expect(Object.keys(saved.prefabs)).toHaveLength(1);
    expect(saved.scenes.filter((s) => s.prefabId)).toHaveLength(1);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useSceneStore.setState(useSceneStore.getInitialState(), true);
    project().loadProject(saved);
    expect(getProject()).toEqual(saved);
    expect(project().scenes.filter((s) => s.prefabId)).toHaveLength(1);
  });

  it("scenes added from a file bring their prefabs, and keep the ones already there", () => {
    houseInOpenScene();
    makePrefab("house");
    const filePrefabs = project().prefabs;
    const fileScenes = getProject().scenes;
    // a different project
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useSceneStore.setState(useSceneStore.getInitialState(), true);
    expect(project().addScenes(fileScenes, filePrefabs)).toBeNull();
    expect(Object.keys(project().prefabs)).toEqual(Object.keys(filePrefabs));
    // adding again keeps the project's own version of the prefab
    const own = project().prefabs;
    project().addScenes(fileScenes, filePrefabs);
    expect(project().prefabs).toEqual(own);
  });
});
