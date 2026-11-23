import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { OwnerStore } from "./ownerStore";
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

function behavesLikeAnOwnerStore(make: () => OwnerStore) {
  it("the first claim wins; later claims do not change the owner", () => {
    const owners = make();
    expect(owners.ownerHash("p")).toBeNull();
    expect(owners.claim("p", "aa")).toBe(true);
    expect(owners.claim("p", "bb")).toBe(false);
    expect(owners.ownerHash("p")).toBe("aa");
    expect(owners.ownerHash("q")).toBeNull();
  });

  it("the generation starts at 0, goes up when links are cancelled, and is per project", () => {
    const owners = make();
    expect(owners.generation("p")).toBe(0);
    owners.claim("p", "aa");
    owners.claim("q", "bb");
    expect(owners.nextGeneration("p")).toBe(1);
    expect(owners.nextGeneration("p")).toBe(2);
    expect(owners.generation("p")).toBe(2);
    expect(owners.generation("q")).toBe(0);
    expect(owners.nextGeneration("nobody")).toBe(0);
  });
}

describe("owners (memory)", () =>
  behavesLikeAnOwnerStore(() => new MemoryStore()));
describe("owners (SQLite)", () =>
  behavesLikeAnOwnerStore(() => new SqliteStore(":memory:")));

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
      second.claim("p", "aa");
      second.nextGeneration("p");
      second.close();
      const third = new SqliteStore(path);
      expect(third.ownerHash("p")).toBe("aa");
      expect(third.generation("p")).toBe(1);
      third.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
