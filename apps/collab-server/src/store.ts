import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MemoryOwners, type OwnerStore } from "./ownerStore";

/**
 * Where documents are kept between server runs. The server only knows this interface, so the place can change: a SQLite
 * file (this file), or Postgres (postgresStore.ts, step M8f). The calls return promises because a database over the
 * network is not instant, even where the local ones happen to be.
 */
export interface DocumentStore {
  /** The saved state of a document (a Yjs update), or null if it was never saved. */
  load(name: string): Promise<Uint8Array | null>;
  save(name: string, state: Uint8Array): Promise<void>;
  /** Writes nothing more; lets the database connection go. */
  close(): Promise<void>;
}

/** Keeps documents in memory only. For tests. */
export class MemoryStore
  extends MemoryOwners
  implements DocumentStore, OwnerStore
{
  readonly documents = new Map<string, Uint8Array>();
  async load(name: string): Promise<Uint8Array | null> {
    return this.documents.get(name) ?? null;
  }
  async save(name: string, state: Uint8Array): Promise<void> {
    this.documents.set(name, state);
  }
  async close(): Promise<void> {}
}

/**
 * Keeps documents in a SQLite file, using the database built into Node (`node:sqlite`, no extra package). One
 * row per document: its name and its whole state.
 */
export class SqliteStore implements DocumentStore, OwnerStore {
  private readonly db: DatabaseSync;

  /** `path` is a file path, or ":memory:" for a throwaway database. */
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode = WAL; " +
        "CREATE TABLE IF NOT EXISTS documents (" +
        "name TEXT PRIMARY KEY, state BLOB NOT NULL, updated_at INTEGER NOT NULL); " +
        "CREATE TABLE IF NOT EXISTS owners (" +
        "project_id TEXT PRIMARY KEY, key_hash TEXT NOT NULL, generation INTEGER NOT NULL DEFAULT 0)",
    );
  }

  async load(name: string): Promise<Uint8Array | null> {
    const row = this.db
      .prepare("SELECT state FROM documents WHERE name = ?")
      .get(name);
    return row && row["state"] instanceof Uint8Array ? row["state"] : null;
  }

  async save(name: string, state: Uint8Array): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO documents (name, state, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
      )
      .run(name, state, Date.now());
  }

  /** Every saved document, for copying them to another store (migrateDocuments.ts). */
  *entries(): Iterable<[name: string, state: Uint8Array]> {
    const rows = this.db.prepare("SELECT name, state FROM documents").all();
    for (const row of rows) {
      if (
        typeof row["name"] === "string" &&
        row["state"] instanceof Uint8Array
      ) {
        yield [row["name"], row["state"]];
      }
    }
  }

  ownerHash(projectId: string): string | null {
    const row = this.db
      .prepare("SELECT key_hash FROM owners WHERE project_id = ?")
      .get(projectId);
    return row && typeof row["key_hash"] === "string" ? row["key_hash"] : null;
  }

  claim(projectId: string, keyHash: string): boolean {
    const result = this.db
      .prepare(
        "INSERT INTO owners (project_id, key_hash, generation) VALUES (?, ?, 0) ON CONFLICT(project_id) DO NOTHING",
      )
      .run(projectId, keyHash);
    return Number(result.changes) === 1;
  }

  generation(projectId: string): number {
    const row = this.db
      .prepare("SELECT generation FROM owners WHERE project_id = ?")
      .get(projectId);
    return row && typeof row["generation"] === "number" ? row["generation"] : 0;
  }

  nextGeneration(projectId: string): number {
    this.db
      .prepare(
        "UPDATE owners SET generation = generation + 1 WHERE project_id = ?",
      )
      .run(projectId);
    return this.generation(projectId);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
