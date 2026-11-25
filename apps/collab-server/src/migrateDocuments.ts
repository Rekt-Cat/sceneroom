import { loadConfig } from "./config";
import { PostgresDocumentStore } from "./postgresStore";
import { SqliteStore } from "./store";

/**
 * Copies the documents of the SQLite file (DB_PATH) into Postgres (DATABASE_URL), once, when moving a collab server to
 * Postgres: `pnpm --filter @sceneroom/collab-server migrate-documents`. A document that is already in Postgres is left as
 * it is unless `--overwrite` is given. The SQLite file is not changed.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.databaseUrl) {
    throw new Error(
      "Set DATABASE_URL (the Postgres address) to say where the documents go.",
    );
  }
  const overwrite = process.argv.includes("--overwrite");
  const from = new SqliteStore(config.dbPath);
  const to = new PostgresDocumentStore(config.databaseUrl);
  try {
    await to.check();
    let copied = 0;
    let skipped = 0;
    for (const [name, state] of from.entries()) {
      if (!overwrite && (await to.load(name)) !== null) {
        skipped += 1;
        continue;
      }
      await to.save(name, state);
      copied += 1;
    }
    console.log(
      `Copied ${copied} document(s) from ${config.dbPath} to Postgres; ${skipped} already there${skipped > 0 && !overwrite ? " (use --overwrite to replace them)" : ""}.`,
    );
  } finally {
    await to.close();
    await from.close();
  }
}

main().catch((error: unknown) => {
  console.error("Could not move the documents:", error);
  process.exitCode = 1;
});
