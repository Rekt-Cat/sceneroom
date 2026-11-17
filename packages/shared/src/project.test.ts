import { describe, expect, it } from "vitest";
import {
  MAX_PROJECT_SCENES,
  SCENE_TEMPLATES,
  addProjectScene,
  availableSceneName,
  createProject,
  createTemplateScene,
  deleteProjectScene,
  moveProjectScene,
  normalizeSceneName,
  parseProject,
  renameProjectScene,
  sceneSchema,
  type Project,
} from "./index";
import { createEmptyScene } from "./scene";

function counter() {
  let n = 0;
  return () => `id-${++n}`;
}

function projectWith(...names: string[]): Project {
  const [first, ...rest] = names;
  let project = createProject("s0", createEmptyScene(), first);
  rest.forEach((name, i) => {
    project = addProjectScene(project, {
      id: `s${i + 1}`,
      name,
      scene: createEmptyScene(),
    });
  });
  return project;
}

describe("project", () => {
  it("a new project has one scene, which is open", () => {
    const project = createProject("a", createEmptyScene());
    expect(project.scenes).toHaveLength(1);
    expect(project.activeSceneId).toBe("a");
    expect(parseProject(project).ok).toBe(true);
  });

  it("gives an added scene a unique name", () => {
    const project = projectWith("Town", "Town", "Town");
    expect(project.scenes.map((s) => s.name)).toEqual([
      "Town",
      "Town (2)",
      "Town (3)",
    ]);
  });

  it("numbers copies from the name without a number", () => {
    expect(
      availableSceneName([{ name: "Town" }, { name: "Town (2)" }], "Town (2)"),
    ).toBe("Town (3)");
  });

  it("refuses more than the limit", () => {
    let project = projectWith("A");
    for (let i = 1; i < MAX_PROJECT_SCENES; i++) {
      project = addProjectScene(project, {
        id: `x${i}`,
        name: `S${i}`,
        scene: createEmptyScene(),
      });
    }
    expect(() =>
      addProjectScene(project, {
        id: "over",
        name: "Over",
        scene: createEmptyScene(),
      }),
    ).toThrow(/at most/);
  });

  it("refuses a repeated id", () => {
    const project = projectWith("A");
    expect(() =>
      addProjectScene(project, {
        id: "s0",
        name: "B",
        scene: createEmptyScene(),
      }),
    ).toThrow(/already exists/);
  });

  it("renames, trims, and refuses an empty or used name", () => {
    const project = projectWith("A", "B");
    expect(
      renameProjectScene(project, "s1", "  New   name ")?.scenes[1]?.name,
    ).toBe("New name");
    expect(renameProjectScene(project, "s1", "   ")).toBeNull();
    expect(renameProjectScene(project, "s1", "A")).toBeNull();
    // keeping its own name is fine
    expect(renameProjectScene(project, "s1", "B")).not.toBeNull();
    expect(normalizeSceneName("x".repeat(100))).toHaveLength(60);
  });

  it("deletes a scene and opens a neighbour if it was open", () => {
    const project = { ...projectWith("A", "B", "C"), activeSceneId: "s1" };
    const next = deleteProjectScene(project, "s1");
    expect(next.scenes.map((s) => s.id)).toEqual(["s0", "s2"]);
    expect(next.activeSceneId).toBe("s2");
    const last = deleteProjectScene(
      { ...projectWith("A", "B"), activeSceneId: "s1" },
      "s1",
    );
    expect(last.activeSceneId).toBe("s0");
  });

  it("keeps the open scene when another is deleted, and never deletes the last", () => {
    const project = projectWith("A", "B");
    expect(deleteProjectScene(project, "s1").activeSceneId).toBe("s0");
    const one = projectWith("A");
    expect(deleteProjectScene(one, "s0")).toBe(one);
  });

  it("moves a scene and clamps to the ends", () => {
    const project = projectWith("A", "B", "C");
    expect(
      moveProjectScene(project, "s0", 2).scenes.map((s) => s.name),
    ).toEqual(["B", "C", "A"]);
    expect(
      moveProjectScene(project, "s2", -5).scenes.map((s) => s.name),
    ).toEqual(["C", "A", "B"]);
    expect(moveProjectScene(project, "s1", 1)).toBe(project);
  });

  it("rejects damaged projects with a reason", () => {
    const project = projectWith("A");
    expect(parseProject({ ...project, activeSceneId: "nope" })).toMatchObject({
      ok: false,
    });
    expect(parseProject({ ...project, scenes: [] })).toMatchObject({
      ok: false,
    });
    const twin = { ...project, scenes: [project.scenes[0], project.scenes[0]] };
    expect(parseProject(twin)).toMatchObject({ ok: false });
    expect(parseProject(null)).toMatchObject({ ok: false });
  });

  it("every template makes a valid scene with unique object ids", () => {
    for (const name of SCENE_TEMPLATES) {
      const scene = createTemplateScene(name, counter());
      expect(sceneSchema.safeParse(scene).success).toBe(true);
    }
    expect(
      Object.keys(createTemplateScene("blank", counter()).nodes),
    ).toHaveLength(0);
    const kinds = Object.values(
      createTemplateScene("characters", counter()).nodes,
    ).map((n) => n.kind);
    expect(kinds).toContain("character");
    expect(
      createTemplateScene("environment", counter()).environment.fogEnabled,
    ).toBe(true);
  });
});
