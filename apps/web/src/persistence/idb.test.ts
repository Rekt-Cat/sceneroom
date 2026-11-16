import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  addAsset,
  addNode,
  addProjectScene,
  createEmptyScene,
  createProject,
  createModelNode,
  createNode,
} from "@sceneroom/shared";
import { IndexedDbAssetStorage } from "./assetStorageIdb";
import { describeStorageError, openDatabase, run, STORE_SCENES } from "./idb";
import {
  BACKUP_KEY,
  IndexedDbProjectRepository,
  LEGACY_SCENE_KEY,
  PROJECT_KEY,
} from "./sceneRepository";

/** A new, empty browser database for each test. */
async function freshDb() {
  return openDatabase(new IDBFactory());
}

describe("IndexedDbProjectRepository", () => {
  const oneSceneProject = (scene = createEmptyScene()) =>
    createProject("s1", scene, "Scene 1");

  it("finds nothing the first time", async () => {
    const repo = new IndexedDbProjectRepository(await freshDb());
    expect(await repo.load()).toEqual({ status: "empty" });
  });

  it("saves a project with several scenes and loads the same project back", async () => {
    const repo = new IndexedDbProjectRepository(await freshDb());
    const withCube = addNode(createEmptyScene(), createNode("a", "cube"));
    const project = addProjectScene(oneSceneProject(withCube), {
      id: "s2",
      name: "Town",
      scene: addNode(createEmptyScene(), createNode("b", "sphere")),
    });
    await repo.save(project);
    const result = await repo.load();
    expect(result.status).toBe("loaded");
    if (result.status === "loaded") expect(result.project).toEqual(project);
  });

  it("keeps imported-model records of every scene", async () => {
    const repo = new IndexedDbProjectRepository(await freshDb());
    let scene = addAsset(createEmptyScene(), {
      id: "f1",
      name: "Car",
      type: "model",
      bytes: 5,
      triangles: 2,
      boundsMin: [0, 0, 0],
      boundsMax: [1, 1, 1],
      note: "",
    });
    scene = addNode(scene, createModelNode("m", "Car", "f1", 2));
    await repo.save(oneSceneProject(scene));
    const result = await repo.load();
    expect(
      result.status === "loaded" && result.project.scenes[0]?.scene,
    ).toEqual(scene);
  });

  it("an empty scene (everything deleted) is saved as empty, not as 'nothing saved'", async () => {
    const repo = new IndexedDbProjectRepository(await freshDb());
    await repo.save(
      oneSceneProject(addNode(createEmptyScene(), createNode("a", "cube"))),
    );
    await repo.save(oneSceneProject());
    const result = await repo.load();
    expect(
      result.status === "loaded" &&
        Object.keys(result.project.scenes[0]!.scene.nodes),
    ).toEqual([]);
  });

  it("a scene saved before projects existed opens as a project with one scene", async () => {
    const db = await freshDb();
    const scene = addNode(createEmptyScene(), createNode("a", "cube"));
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put({ savedAt: 7, scene }, LEGACY_SCENE_KEY),
    );
    const result = await new IndexedDbProjectRepository(db).load();
    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.project.scenes).toHaveLength(1);
      expect(result.project.scenes[0]?.scene).toEqual(scene);
      expect(result.savedAt).toBe(7);
    }
  });

  it("a saved project wins over an old single scene", async () => {
    const db = await freshDb();
    const repo = new IndexedDbProjectRepository(db);
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put({ savedAt: 1, scene: createEmptyScene() }, LEGACY_SCENE_KEY),
    );
    await repo.save(
      addProjectScene(oneSceneProject(), {
        id: "s2",
        name: "Two",
        scene: createEmptyScene(),
      }),
    );
    const result = await repo.load();
    expect(result.status === "loaded" && result.project.scenes).toHaveLength(2);
  });

  it("unreadable saved data is reported, and copied to a backup before anything can overwrite it", async () => {
    const db = await freshDb();
    const repo = new IndexedDbProjectRepository(db);
    const damaged = {
      savedAt: 1,
      project: { version: 1, name: "x", activeSceneId: "s1", scenes: [] },
    };
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put(damaged, PROJECT_KEY),
    );

    const result = await repo.load();
    expect(result.status).toBe("invalid");

    const backup = await run<unknown>(db, STORE_SCENES, "readonly", (s) =>
      s.get(BACKUP_KEY),
    );
    expect(backup).toEqual(damaged);
  });

  it("a damaged old scene is reported and backed up too", async () => {
    const db = await freshDb();
    const damaged = {
      savedAt: 1,
      scene: { version: 1, nodes: { a: { id: "a" } } },
    };
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put(damaged, LEGACY_SCENE_KEY),
    );
    const result = await new IndexedDbProjectRepository(db).load();
    expect(result.status).toBe("invalid");
    if (result.status === "invalid") expect(result.reason).toContain("nodes.a");
    const backup = await run<unknown>(db, STORE_SCENES, "readonly", (s) =>
      s.get(BACKUP_KEY),
    );
    expect(backup).toEqual(damaged);
  });

  it("a record that is not even an object is treated as unreadable", async () => {
    const db = await freshDb();
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put("garbage", PROJECT_KEY),
    );
    const result = await new IndexedDbProjectRepository(db).load();
    expect(result.status).toBe("invalid");
  });

  it("the saved data is validated when read: a scene from an older version gets the new fields", async () => {
    const db = await freshDb();
    const { locked, material, assetId, ...old } = createNode("a", "cube");
    void locked;
    void material;
    void assetId;
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put(
        { savedAt: 5, scene: { version: 1, nodes: { a: old } } },
        LEGACY_SCENE_KEY,
      ),
    );
    const result = await new IndexedDbProjectRepository(db).load();
    expect(
      result.status === "loaded" &&
        result.project.scenes[0]?.scene.nodes["a"]?.locked,
    ).toBe(false);
  });
});

describe("IndexedDbAssetStorage", () => {
  it("stores a file and gives back exactly the same bytes", async () => {
    const storage = new IndexedDbAssetStorage(await freshDb());
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 255]).buffer;
    await storage.put("abc", bytes);
    expect(await storage.has("abc")).toBe(true);
    const back = await storage.get("abc");
    expect(back).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(back!))).toEqual([0, 1, 2, 250, 251, 255]);
  });

  it("says no for a file it does not have", async () => {
    const storage = new IndexedDbAssetStorage(await freshDb());
    expect(await storage.has("nope")).toBe(false);
    expect(await storage.get("nope")).toBeUndefined();
  });

  it("storing the same id again replaces it", async () => {
    const storage = new IndexedDbAssetStorage(await freshDb());
    await storage.put("x", Uint8Array.from([1]).buffer);
    await storage.put("x", Uint8Array.from([2, 3]).buffer);
    expect(Array.from(new Uint8Array((await storage.get("x"))!))).toEqual([
      2, 3,
    ]);
  });

  it("files stay after the database is closed and opened again (that is what a reload does)", async () => {
    const factory = new IDBFactory();
    const first = await openDatabase(factory);
    await new IndexedDbAssetStorage(first).put(
      "keep",
      Uint8Array.from([9, 9]).buffer,
    );
    await new IndexedDbProjectRepository(first).save(
      createProject("s1", addNode(createEmptyScene(), createNode("a", "cube"))),
    );
    first.close();

    const second = await openDatabase(factory);
    expect(await new IndexedDbAssetStorage(second).has("keep")).toBe(true);
    const result = await new IndexedDbProjectRepository(second).load();
    expect(result.status).toBe("loaded");
  });
});

describe("describeStorageError", () => {
  it("explains a full store and a blocked store", () => {
    const full = new Error("x");
    full.name = "QuotaExceededError";
    expect(describeStorageError(full)).toContain("full");
    const blocked = new Error("x");
    blocked.name = "SecurityError";
    expect(describeStorageError(blocked)).toContain("blocking");
    expect(describeStorageError("whatever")).toContain("could not save");
  });
});
