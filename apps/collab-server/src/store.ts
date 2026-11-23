import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { MemoryOwners, type OwnerStore } from "./ownerStore";

/**
 * Where documents are kept between server runs. The server only knows this interface, so the SQLite file used
 * now can be replaced by Postgres (step M8) by writing one more class.
 */
export interface DocumentStore {
  /** The saved state of a document (a Yjs update), or null if it was never saved. */
  load(name: string): Uint8Array | null;
  save(name: string, state: Uint8Array): void;
  close(): void;
}

/** Keeps documents in memory only. For tests. */
export class MemoryStore
  extends MemoryOwners
  implements DocumentStore, OwnerStore
{
  readonly documents = new Map<string, Uint8Array>();
  load(name: string): Uint8Array | null {
    return this.documents.get(name) ?? null;
  }
  save(name: string, state: Uint8Array): void {
    this.documents.set(name, state);
  }
  close(): void {}
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

  load(name: string): Uint8Array | null {
    const row = this.db
      .prepare("SELECT state FROM documents WHERE name = ?")
      .get(name);
    return row && row["state"] instanceof Uint8Array ? row["state"] : null;
  }

  save(name: string, state: Uint8Array): void {
    this.db
      .prepare(
        "INSERT INTO documents (name, state, updated_at) VALUES (?, ?, ?) " +
          "ON CONFLICT(name) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
      )
      .run(name, state, Date.now());
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

  close(): void {
    this.db.close();
  }
}
