import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { OwnerStore } from "./ownerStore";
import { PostgresDocumentStore } from "./postgresStore";
import { MemoryStore, SqliteStore, type DocumentStore } from "./store";

/** `name` is where the documents of this run live: the Postgres test needs names of its own (the database is shared). */
function behavesLikeAStore(make: () => DocumentStore, prefix = "scene:p") {
  it("returns null for a document never saved", async () => {
    const store = make();
    expect(await store.load(`${prefix}:s`)).toBeNull();
    await store.close();
  });

  it("saves, loads and overwrites", async () => {
    const store = make();
    await store.save(`${prefix}:s`, new Uint8Array([1, 2, 3]));
    expect(Array.from((await store.load(`${prefix}:s`))!)).toEqual([1, 2, 3]);
    await store.save(`${prefix}:s`, new Uint8Array([9]));
    expect(Array.from((await store.load(`${prefix}:s`))!)).toEqual([9]);
    expect(await store.load(`${prefix}:other`)).toBeNull();
    await store.close();
  });

  it("keeps every byte value, an empty document and a big one", async () => {
    const store = make();
    const everyByte = Uint8Array.from({ length: 256 }, (_, i) => i);
    const big = Uint8Array.from(
      { length: 5_000_000 },
      (_, i) => (i * 31) % 251,
    );
    await store.save(`${prefix}:bytes`, everyByte);
    await store.save(`${prefix}:empty`, new Uint8Array());
    await store.save(`${prefix}:big`, big);
    expect(Array.from((await store.load(`${prefix}:bytes`))!)).toEqual(
      Array.from(everyByte),
    );
    expect((await store.load(`${prefix}:empty`))!.byteLength).toBe(0);
    const back = (await store.load(`${prefix}:big`))!;
    expect(back.byteLength).toBe(big.byteLength);
    expect(back.every((value, i) => value === big[i])).toBe(true);
    await store.close();
  });

  it("many saves at once end with the last one written for each name", async () => {
    const store = make();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.save(`${prefix}:race`, new Uint8Array([i])),
      ),
    );
    expect((await store.load(`${prefix}:race`))!.byteLength).toBe(1);
    await store.close();
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

// The real Postgres of docker-compose.yml (docker compose up -d, with the migrations of packages/db applied). The tests of
// this file only touch rows whose name starts with "pgstore-test:".
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom";
const PG_PREFIX = "pgstore-test";

describe("PostgresDocumentStore", () => {
  const cleanup = async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    await pool.query("DELETE FROM collab_document WHERE name LIKE $1", [
      `${PG_PREFIX}:%`,
    ]);
    await pool.end();
  };
  beforeEach(cleanup);
  afterAll(cleanup);

  behavesLikeAStore(() => new PostgresDocumentStore(DATABASE_URL), PG_PREFIX);

  it("keeps documents after the store is closed and opened again (a server restart)", async () => {
    const first = new PostgresDocumentStore(DATABASE_URL);
    await first.save(`${PG_PREFIX}:restart`, new Uint8Array([4, 5, 6]));
    await first.close();
    const second = new PostgresDocumentStore(DATABASE_URL);
    expect(Array.from((await second.load(`${PG_PREFIX}:restart`))!)).toEqual([
      4, 5, 6,
    ]);
    await second.close();
  });

  it("says plainly what is wrong when the database cannot be used", async () => {
    const broken = new PostgresDocumentStore(
      "postgresql://nobody:nothing@127.0.0.1:1/none",
    );
    await expect(broken.check()).rejects.toThrow(
      /Cannot use Postgres for documents/,
    );
    await broken.close();
    const ok = new PostgresDocumentStore(DATABASE_URL);
    await expect(ok.check()).resolves.toBeUndefined();
    await ok.close();
  });
});

describe("SqliteStore (file)", () => {
  it("keeps documents after the database is closed and opened again", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sceneroom-store-"));
    try {
      const path = join(dir, "nested", "db.sqlite");
      const first = new SqliteStore(path);
      await first.save("project:p", new Uint8Array([4, 5, 6]));
      await first.close();
      const second = new SqliteStore(path);
      expect(Array.from((await second.load("project:p"))!)).toEqual([4, 5, 6]);
      second.claim("p", "aa");
      second.nextGeneration("p");
      await second.close();
      const third = new SqliteStore(path);
      expect(third.ownerHash("p")).toBe("aa");
      expect(third.generation("p")).toBe(1);
      await third.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
