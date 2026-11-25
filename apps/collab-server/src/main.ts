import { createCollabServer } from "./createServer";
import { loadConfig } from "./config";
import { consoleLogger } from "./logger";
import { FolderFileStore, type FileStore } from "./fileStore";
import { S3FileStore } from "./s3FileStore";
import { PostgresDocumentStore } from "./postgresStore";
import { SqliteStore, type DocumentStore } from "./store";

const config = loadConfig(process.env);
// The SQLite file always holds the owners of stage A (links); documents go to Postgres when DATABASE_URL is set
const store = new SqliteStore(config.dbPath);
let documents: DocumentStore = store;
if (config.databaseUrl) {
  const postgres = new PostgresDocumentStore(config.databaseUrl);
  await postgres.check();
  documents = postgres;
}

// Big files: an S3-compatible bucket when it is set up (a host without a lasting disk), else a folder
const files: FileStore = config.s3
  ? new S3FileStore(config.s3)
  : new FolderFileStore(config.filesDir);

const server = createCollabServer({
  port: config.port,
  host: config.host,
  secret: config.secret,
  store: documents,
  owners: store,
  logger: consoleLogger,
  maxMessageBytes: config.maxMessageBytes,
  maxDocumentBytes: config.maxDocumentBytes,
  files,
  linkSharing: config.linkSharing,
  maxFileBytes: config.maxFileBytes,
  maxProjectFileBytes: config.maxProjectFileBytes,
  allowedOrigins: config.allowedOrigins,
});

await server.listen();
consoleLogger.info(
  `listening on ${server.webSocketURL}, documents in ${config.databaseUrl ? "Postgres" : config.dbPath}, files in ${config.s3 ? `bucket ${config.s3.bucket}` : config.filesDir}, link sharing ${config.linkSharing ? "on" : "off"}`,
);

// Save everything still waiting, then close the database, when asked to stop
async function stop(signal: string): Promise<void> {
  consoleLogger.info(`${signal}: saving and stopping`);
  await server.destroy();
  if (documents !== store) await documents.close();
  await store.close();
  process.exit(0);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
