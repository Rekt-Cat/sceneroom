import { createCollabServer } from "./createServer";
import { loadConfig } from "./config";
import { consoleLogger } from "./logger";
import { FolderFileStore } from "./fileStore";
import { SqliteStore } from "./store";

const config = loadConfig(process.env);
const store = new SqliteStore(config.dbPath);

const server = createCollabServer({
  port: config.port,
  host: config.host,
  secret: config.secret,
  store,
  logger: consoleLogger,
  maxMessageBytes: config.maxMessageBytes,
  maxDocumentBytes: config.maxDocumentBytes,
  files: new FolderFileStore(config.filesDir),
  maxFileBytes: config.maxFileBytes,
  maxProjectFileBytes: config.maxProjectFileBytes,
  allowedOrigins: config.allowedOrigins,
});

await server.listen();
consoleLogger.info(
  `listening on ${server.webSocketURL}, database ${config.dbPath}`,
);

// Save everything still waiting, then close the database, when asked to stop
async function stop(signal: string): Promise<void> {
  consoleLogger.info(`${signal}: saving and stopping`);
  await server.destroy();
  store.close();
  process.exit(0);
}
process.on("SIGINT", () => void stop("SIGINT"));
process.on("SIGTERM", () => void stop("SIGTERM"));
