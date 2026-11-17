import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createEmptyScene,
  createProject,
  type Project,
} from "@sceneroom/shared";
import { STORE_SCENES, openDatabase, run } from "./idb";
import {
  INDEX_KEY,
  IndexedDbProjectLibrary,
  LIBRARY_BACKUP_PREFIX,
  projectKey,
} from "./projectLibrary";
import { LEGACY_SCENE_KEY, PROJECT_KEY } from "./sceneRepository";

async function setup() {
  const db = await openDatabase(new IDBFactory());
  let tick = 1_000;
  let n = 0;
  const library = new IndexedDbProjectLibrary(
    db,
    () => (tick += 1000),
    () => `id-${++n}`,
  );
  return { db, library };
}

const project = (name: string): Project => ({
  ...createProject("s1", createEmptyScene(), "Scene 1"),
  name,
});

describe("IndexedDbProjectLibrary", () => {
  it("starts empty with no problem", async () => {
    const { library } = await setup();
    expect(await library.list()).toEqual({ entries: [], problem: null });
  });

  it("creates, lists and loads projects; a save updates the card and keeps the creation time", async () => {
    const { library } = await setup();
    const id = await library.create(project("Town"));
    const first = (await library.list()).entries[0]!;
    expect(first).toMatchObject({ id, name: "Town", scenes: 1 });
    await library.save(id, project("Town 2"));
    const second = (await library.list()).entries[0]!;
    expect(second.name).toBe("Town 2");
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
    const loaded = await library.load(id);
    expect(loaded.status === "loaded" && loaded.project.name).toBe("Town 2");
  });

  it("says empty for a project that does not exist", async () => {
    const { library } = await setup();
    expect(await library.load("nope")).toEqual({ status: "empty" });
  });

  it("duplicates under a free name, and removes a project with its picture", async () => {
    const { library } = await setup();
    const id = await library.create(project("Town"));
    await library.setThumbnail(id, "data:image/jpeg;base64,AAAA");
    expect(await library.thumbnail(id)).toBe("data:image/jpeg;base64,AAAA");
    const copy = await library.duplicate(id);
    const names = (await library.list()).entries.map((e) => e.name).sort();
    expect(names).toEqual(["Town", "Town copy"]);
    await library.remove(id);
    expect((await library.list()).entries.map((e) => e.id)).toEqual([copy]);
    expect(await library.thumbnail(id)).toBeNull();
    expect(await library.duplicate(id)).toBeNull();
  });

  it("the old single project becomes the first card, and the old record stays as a backup", async () => {
    const { db, library } = await setup();
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put({ savedAt: 5000, project: project("Old one") }, PROJECT_KEY),
    );
    const listing = await library.list();
    expect(listing.entries.map((e) => e.name)).toEqual(["Old one"]);
    expect(listing.entries[0]!.updatedAt).toBe(5000);
    // asking again does not add it twice
    expect((await library.list()).entries.length).toBe(1);
    const stillThere = await run(db, STORE_SCENES, "readonly", (s) =>
      s.get(PROJECT_KEY),
    );
    expect(stillThere).toBeDefined();
  });

  it("a scene saved before projects existed also becomes a card", async () => {
    const { db, library } = await setup();
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put({ savedAt: 7, scene: createEmptyScene() }, LEGACY_SCENE_KEY),
    );
    expect((await library.list()).entries.length).toBe(1);
  });

  it("repairs the index: a record without an entry is added, an entry without a record is dropped", async () => {
    const { db, library } = await setup();
    const a = await library.create(project("A"));
    const b = await library.create(project("B"));
    // an interrupted save: B's record exists but the index forgot it
    const onlyA = await keepOnly(db, a);
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put({ version: 1, projects: onlyA }, INDEX_KEY),
    );
    expect((await library.list()).entries.map((e) => e.id).sort()).toEqual([
      a,
      b,
    ]);
    // a record deleted behind the index's back
    await run(db, STORE_SCENES, "readwrite", (s) => s.delete(projectKey(a)));
    expect((await library.list()).entries.map((e) => e.id)).toEqual([b]);
  });

  it("an unreadable project is kept as a backup and reported, not overwritten", async () => {
    const { db, library } = await setup();
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put({ savedAt: 1, project: { broken: true } }, projectKey("bad")),
    );
    const result = await library.load("bad");
    expect(result.status).toBe("invalid");
    const backup = await run(db, STORE_SCENES, "readonly", (s) =>
      s.get(`${LIBRARY_BACKUP_PREFIX}bad`),
    );
    expect(backup).toBeDefined();
  });

  it("an index that cannot be read is rebuilt from the records", async () => {
    const { db, library } = await setup();
    const id = await library.create(project("Keep me"));
    await run(db, STORE_SCENES, "readwrite", (s) =>
      s.put("garbage", INDEX_KEY),
    );
    expect((await library.list()).entries.map((e) => e.id)).toEqual([id]);
  });
});

/** The index with only project `keep` in it (for the repair test). */
async function keepOnly(db: IDBDatabase, keep: string) {
  const index = (await run<unknown>(db, STORE_SCENES, "readonly", (s) =>
    s.get(INDEX_KEY),
  )) as { projects: { id: string }[] };
  return index.projects.filter((p) => p.id === keep);
}
