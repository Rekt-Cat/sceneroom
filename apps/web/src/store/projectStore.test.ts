import { beforeEach, describe, expect, it } from "vitest";
import { nextUndoLabel } from "@sceneroom/shared";
import { useEditStore } from "./editStore";
import { getProject, useProjectStore } from "./projectStore";
import { useSceneStore } from "./sceneStore";

const project = () => useProjectStore.getState();
const scene = () => useSceneStore.getState();
const nodeCount = () => Object.keys(scene().scene.nodes).length;
const names = () => project().scenes.map((s) => s.name);

beforeEach(() => {
  useSceneStore.setState(useSceneStore.getInitialState(), true);
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  useEditStore.getState().exit();
});

describe("scenes in a project", () => {
  it("starts with one scene, which is the open one", () => {
    expect(names()).toEqual(["Scene 1"]);
    expect(project().activeSceneId).toBe(project().scenes[0]!.id);
    expect(getProject().scenes).toHaveLength(1);
  });

  it("adds a scene from a template and opens it", () => {
    const first = project().activeSceneId;
    expect(project().addScene("characters")).toBeNull();
    expect(names()).toEqual(["Scene 1", "Characters"]);
    expect(project().activeSceneId).not.toBe(first);
    const kinds = Object.values(scene().scene.nodes).map((n) => n.kind);
    expect(kinds).toContain("character");
    // the first scene is kept, untouched
    expect(Object.keys(project().parked[first]!.scene.nodes)).toEqual([
      "initial-cube",
    ]);
  });

  it("each scene keeps its own contents, selection and undo history", () => {
    const first = project().activeSceneId;
    const cube = scene().addPrimitive("sphere"); // scene 1: cube + sphere, sphere selected
    expect(nodeCount()).toBe(2);

    project().addScene("blank");
    expect(nodeCount()).toBe(0);
    expect(scene().selectedIds).toEqual([]);
    expect(nextUndoLabel(scene().history)).toBeNull(); // a new scene has a clean history
    scene().addPrimitive("cone");
    scene().undo();
    expect(nodeCount()).toBe(0); // undo only touches this scene

    project().switchScene(first);
    expect(nodeCount()).toBe(2);
    expect(scene().selectedIds).toEqual([cube]);
    expect(nextUndoLabel(scene().history)).toBe("Add sphere");
    scene().undo();
    expect(nodeCount()).toBe(1);
  });

  it("switching to the open scene or to an unknown one does nothing", () => {
    const before = scene().scene;
    project().switchScene(project().activeSceneId);
    project().switchScene("nope");
    expect(scene().scene).toBe(before);
  });

  it("leaves edit mode and finishes a drag when switching", () => {
    const first = project().activeSceneId;
    project().addScene("blank");
    useEditStore.getState().enter("x");
    scene().addPrimitive("cube");
    scene().beginEdit("Move");
    project().switchScene(first);
    expect(useEditStore.getState().nodeId).toBeNull();
    expect(scene().pendingEdit).toBeNull();
  });

  it("a cut waiting in the clipboard becomes a copy in another scene (the object stays where it was)", () => {
    const id = scene().addPrimitive("cube");
    scene().select(id);
    scene().cutSelected();
    expect(scene().clipboard?.mode).toBe("cut");
    project().addScene("blank");
    expect(scene().clipboard?.mode).toBe("copy");
    scene().pasteCopies(null);
    expect(nodeCount()).toBe(1);
  });

  it("duplicates a scene under a new name, and the copy changes on its own", () => {
    project().duplicateScene(project().activeSceneId);
    expect(names()).toEqual(["Scene 1", "Scene 1 (2)"]);
    scene().addPrimitive("cube");
    const original = project().scenes[0]!.id;
    expect(Object.keys(project().parked[original]!.scene.nodes)).toHaveLength(
      1,
    );
    expect(nodeCount()).toBe(2);
  });

  it("renames, refusing an empty or used name with a reason", () => {
    project().addScene("blank");
    const [a, b] = project().scenes;
    expect(project().renameScene(b!.id, "Town")).toBeNull();
    expect(names()).toEqual(["Scene 1", "Town"]);
    expect(project().renameScene(b!.id, "  ")).toMatch(/needs a name/);
    expect(project().renameScene(b!.id, a!.name)).toMatch(/already/);
  });

  it("deletes a scene; the open one is replaced by a neighbour; the last cannot go", () => {
    const first = project().activeSceneId;
    project().addScene("blank");
    const second = project().activeSceneId;
    expect(project().deleteScene(second)).toBeNull();
    expect(project().activeSceneId).toBe(first);
    expect(nodeCount()).toBe(1);
    expect(project().deleteScene(first)).toMatch(/at least one/);
    expect(project().scenes).toHaveLength(1);
  });

  it("deleting a scene that is not open leaves the open one alone", () => {
    const first = project().activeSceneId;
    project().addScene("blank");
    scene().addPrimitive("cube");
    const second = project().activeSceneId;
    project().deleteScene(first);
    expect(project().activeSceneId).toBe(second);
    expect(nodeCount()).toBe(1);
    expect(Object.keys(project().parked)).toEqual([]);
  });

  it("moves a scene in the tab order without changing which is open", () => {
    project().addScene("blank");
    const open = project().activeSceneId;
    project().moveScene(open, 0);
    expect(names()).toEqual(["Blank", "Scene 1"]);
    expect(project().activeSceneId).toBe(open);
  });

  it("getProject reads the open scene from the editor and the others from parking", () => {
    const first = project().activeSceneId;
    project().addScene("blank");
    scene().addPrimitive("cube");
    const saved = getProject();
    expect(saved.scenes.map((s) => Object.keys(s.scene.nodes).length)).toEqual([
      1, 1,
    ]);
    expect(saved.activeSceneId).not.toBe(first);
  });

  it("loadProject replaces everything and clears undo", () => {
    project().addScene("environment");
    scene().addPrimitive("cube");
    const saved = getProject();

    useSceneStore.setState(useSceneStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    project().loadProject(saved);
    expect(names()).toEqual(["Scene 1", "Environment"]);
    expect(project().activeSceneId).toBe(saved.activeSceneId);
    expect(nodeCount()).toBe(Object.keys(saved.scenes[1]!.scene.nodes).length);
    expect(nextUndoLabel(scene().history)).toBeNull();
    expect(getProject()).toEqual(saved);
  });

  it("refuses a new scene past the limit with a reason", () => {
    for (let i = 1; i < 50; i++) project().addScene("blank");
    expect(project().scenes).toHaveLength(50);
    expect(project().addScene("blank")).toMatch(/at most 50/);
    expect(project().duplicateScene(project().activeSceneId)).toMatch(
      /at most/,
    );
  });
});
