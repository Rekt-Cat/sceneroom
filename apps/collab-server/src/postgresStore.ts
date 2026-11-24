import { Pool } from "pg";
import type { DocumentStore } from "./store";

/**
 * Keeps documents in Postgres (step M8f): one row per document in the table `collab_document`, which is created by the
 * migrations in packages/db (`pnpm --filter @sceneroom/db migrate:deploy`). It uses plain SQL through `pg`, so the collab
 * server does not need the Prisma client.
 *
 * A save replaces the whole row (the document's whole state), in one statement, so a crash cannot leave half a document.
 */
export class PostgresDocumentStore implements DocumentStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5 });
    // An idle connection that breaks must not take the whole server down; the pool makes a new one when it is needed
    this.pool.on("error", (error) => {
      console.error(
        "Postgres connection error (the pool will reconnect):",
        error,
      );
    });
  }

  /** Fails at start, with a clear message, when the database is unreachable or the migration has not been run. */
  async check(): Promise<void> {
    try {
      await this.pool.query("SELECT 1 FROM collab_document LIMIT 0");
    } catch (error) {
      throw new Error(
        "Cannot use Postgres for documents: is the database running, and has `pnpm --filter @sceneroom/db migrate:deploy` been run? " +
          `(${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  async load(name: string): Promise<Uint8Array | null> {
    const result = await this.pool.query<{ state: Buffer }>(
      "SELECT state FROM collab_document WHERE name = $1",
      [name],
    );
    const row = result.rows[0];
    return row ? new Uint8Array(row.state) : null;
  }

  async save(name: string, state: Uint8Array): Promise<void> {
    await this.pool.query(
      `INSERT INTO collab_document (name, state, "updatedAt") VALUES ($1, $2, now())
       ON CONFLICT (name) DO UPDATE SET state = EXCLUDED.state, "updatedAt" = now()`,
      [name, Buffer.from(state)],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
