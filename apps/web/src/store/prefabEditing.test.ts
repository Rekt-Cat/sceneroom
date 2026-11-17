import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addNode, createEmptyScene, createNode } from "@sceneroom/shared";
import { useImportStore } from "./importStore";
import { editPrefab, makePrefab, placeLibraryItem } from "./libraryActions";
import { PREFAB_APPLY_DEBOUNCE_MS, startPrefabEditing } from "./prefabEditing";
import { useProjectStore } from "./projectStore";
import { useSceneStore } from "./sceneStore";

const project = () => useProjectStore.getState();
const scene = () => useSceneStore.getState();

let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  useSceneStore.setState(useSceneStore.getInitialState(), true);
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  useImportStore.setState({ busy: false, message: null });
  stop = startPrefabEditing();
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
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

const paintRoof = (color: string) =>
  useSceneStore.setState((state) => ({
    scene: {
      ...state.scene,
      nodes: {
        ...state.scene.nodes,
        roof: { ...state.scene.nodes["roof"]!, color },
      },
    },
  }));

const parkedRoofColours = () =>
  Object.values(project().parked).flatMap((p) =>
    Object.values(p.scene.nodes)
      .filter((n) => n.name === "Roof")
      .map((n) => n.color),
  );

describe("editing a prefab keeps its copies in step", () => {
  it("a moment after a change in the prefab's scene, the copies in other scenes follow (one rebuild, not one per change)", () => {
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    project().addScene("blank");
    placeLibraryItem(prefabId, [3, 0, 3]);
    editPrefab(prefabId);

    paintRoof("#111111");
    paintRoof("#222222");
    paintRoof("#333333");
    // not yet: the rebuild waits for the changes to stop
    expect(project().prefabs[prefabId]?.revision).toBe(1);
    vi.advanceTimersByTime(PREFAB_APPLY_DEBOUNCE_MS + 1);
    expect(project().prefabs[prefabId]?.revision).toBe(2);
    expect(parkedRoofColours()).toContain("#333333");
  });

  it("leaving the prefab's scene applies the last change at once", () => {
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    const home = project().activeSceneId;
    editPrefab(prefabId);
    paintRoof("#abcdef");
    project().switchScene(home);
    // no waiting: the scene that was opened already shows the new look
    expect(project().prefabs[prefabId]?.revision).toBe(2);
    const roof = Object.values(scene().scene.nodes).find(
      (n) => n.name === "Roof",
    );
    expect(roof?.color).toBe("#abcdef");
  });

  it("changes in an ordinary scene do not touch any prefab", () => {
    makePrefab("house");
    const prefabId = Object.keys(project().prefabs)[0]!;
    scene().addPrimitive("sphere");
    vi.advanceTimersByTime(PREFAB_APPLY_DEBOUNCE_MS * 3);
    expect(project().prefabs[prefabId]?.revision).toBe(1);
  });

  it("warns once when another top-level object is added to the prefab's scene", () => {
    makePrefab("house");
    editPrefab(Object.keys(project().prefabs)[0]!);
    scene().addPrimitive("sphere");
    vi.advanceTimersByTime(PREFAB_APPLY_DEBOUNCE_MS + 1);
    expect(useImportStore.getState().message?.text).toContain(
      "1 other top-level object is ignored",
    );
    useImportStore.setState({ message: null });
    scene().addPrimitive("cone");
    vi.advanceTimersByTime(PREFAB_APPLY_DEBOUNCE_MS + 1);
    // a different warning (2 objects now) is shown
    expect(useImportStore.getState().message?.text).toContain(
      "2 other top-level objects are ignored",
    );
    useImportStore.setState({ message: null });
    scene().addPrimitive("cube");
    // (the count changed again, so it is shown again; an unchanged count would not be repeated)
    vi.advanceTimersByTime(PREFAB_APPLY_DEBOUNCE_MS + 1);
    expect(useImportStore.getState().message?.text).toContain("3 other");
  });
});
