import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  addAsset,
  addNode,
  createEmptyScene,
  createModelNode,
  createNode,
} from "@sceneroom/shared";
import { IndexedDbAssetStorage } from "./assetStorageIdb";
import { describeStorageError, openDatabase, run, STORE_SCENES } from "./idb";
import {
  BACKUP_KEY,
  IndexedDbSceneRepository,
  SCENE_KEY,
} from "./sceneRepository";

/** A new, empty browser database for each test. */
async function freshDb() {
  return openDatabase(new IDBFactory());
}

describe("IndexedDbSceneRepository", () => {
  it("finds nothing the first time", async () => {
    const repo = new IndexedDbSceneRepository(await freshDb());
    expect(await repo.load()).toEqual({ status: "empty" });
  });

  it("saves a scene and loads the same scene back", async () => {
    const repo = new IndexedDbSceneRepository(await freshDb());
    let scene = createEmptyScene();
    scene = addNode(scene, createNode("a", "cube"));
    scene = addNode(scene, {
      ...createNode("b", "sphere"),
      parentId: "a",
      locked: true,
      name: "Ball",
    });
    await repo.save(scene);

    const result = await repo.load();
    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.scene).toEqual(scene);
      expect(result.savedAt).toBeGreaterThan(0);
    }
  });

  it("keeps an imported model and its file record", async () => {
    const repo = new IndexedDbSceneRepository(await freshDb());
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
    await repo.save(scene);
    const result = await repo.load();
    expect(result.status === "loaded" && result.scene).toEqual(scene);
  });

  it("an empty scene (everything deleted) is saved as empty, not as 'nothing saved'", async () => {
    const repo = new IndexedDbSceneRepository(await freshDb());
    await repo.save(createEmptyScene());
    const result = await repo.load();
    expect(result.status).toBe("loaded");
  });

  it("the latest save wins", async () => {
    const repo = new IndexedDbSceneRepository(await freshDb());
    await repo.save(addNode(createEmptyScene(), createNode("a", "cube")));
    await repo.save(addNode(createEmptyScene(), createNode("b", "cone")));
    const result = await repo.load();
    expect(
      result.status === "loaded" && Object.keys(result.scene.nodes),
    ).toEqual(["b"]);
  });

  it("unreadable saved data is reported, and copied to a backup before anything can overwrite it", async () => {
    const db = await freshDb();
    const repo = new IndexedDbSceneRepository(db);
    const damaged = {
      savedAt: 1,
      scene: { version: 1, nodes: { a: { id: "a" } } },
    };
    await run(db, STORE_SCENES, "readwrite", (s) => s.put(damaged, SCENE_KEY));

    const result = await repo.load();
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
      s.put("garbage", SCENE_KEY),
    );
    const result = await new IndexedDbSceneRepository(db).load();
    expect(result.status).toBe("invalid");
  });

  it("the saved data is validated when read: a scene from an older version gets the new fields", async () => {
    const db = await freshDb();
    const { locked, roughness, metalness, assetId, ...old } = createNode(
      "a",
      "cube",
    );
    void locked;
    void roughness;
    void metalness;
    void assetId;
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put(
        { savedAt: 5, scene: { version: 1, nodes: { a: old } } },
        SCENE_KEY,
      ),
    );
    const result = await new IndexedDbSceneRepository(db).load();
    expect(result.status === "loaded" && result.scene.nodes["a"]?.locked).toBe(
      false,
    );
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
    await new IndexedDbSceneRepository(first).save(
      addNode(createEmptyScene(), createNode("a", "cube")),
    );
    first.close();

    const second = await openDatabase(factory);
    expect(await new IndexedDbAssetStorage(second).has("keep")).toBe(true);
    const result = await new IndexedDbSceneRepository(second).load();
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
