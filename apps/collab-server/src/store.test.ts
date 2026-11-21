import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MemoryStore, SqliteStore, type DocumentStore } from "./store";

function behavesLikeAStore(make: () => DocumentStore) {
  it("returns null for a document never saved", () => {
    const store = make();
    expect(store.load("scene:p:s")).toBeNull();
    store.close();
  });

  it("saves, loads and overwrites", () => {
    const store = make();
    store.save("scene:p:s", new Uint8Array([1, 2, 3]));
    expect(Array.from(store.load("scene:p:s")!)).toEqual([1, 2, 3]);
    store.save("scene:p:s", new Uint8Array([9]));
    expect(Array.from(store.load("scene:p:s")!)).toEqual([9]);
    expect(store.load("scene:p:other")).toBeNull();
    store.close();
  });
}

describe("MemoryStore", () => behavesLikeAStore(() => new MemoryStore()));
describe("SqliteStore (in memory)", () =>
  behavesLikeAStore(() => new SqliteStore(":memory:")));

describe("SqliteStore (file)", () => {
  it("keeps documents after the database is closed and opened again", () => {
    const dir = mkdtempSync(join(tmpdir(), "sceneroom-store-"));
    try {
      const path = join(dir, "nested", "db.sqlite");
      const first = new SqliteStore(path);
      first.save("project:p", new Uint8Array([4, 5, 6]));
      first.close();
      const second = new SqliteStore(path);
      expect(Array.from(second.load("project:p")!)).toEqual([4, 5, 6]);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
