import { z } from "zod";

/** The settings of the collab server, from environment variables. Checked at start so a mistake fails at once. */
const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(1234),
  HOST: z.string().min(1).default("127.0.0.1"),
  /** Where the SQLite file lives. */
  DB_PATH: z.string().min(1).default("./data/collab.sqlite"),
  /**
   * The address of the Postgres database. When set, documents are kept there instead of in the SQLite file (run the
   * migrations in packages/db first). Left out or empty = SQLite.
   */
  DATABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  /** The secret that link tokens are signed with. At least 32 characters; never commit the real one. */
  COLLAB_SECRET: z.string().min(32),
  /** The biggest single message a client may send, in bytes. Bigger ones close the connection. */
  MAX_MESSAGE_BYTES: z.coerce.number().int().positive().default(1_048_576),
  /** The biggest a saved document may grow to, in bytes. */
  MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().default(20_971_520),
  /** The folder the big files (models, meshes, pictures) are kept in. */
  FILES_DIR: z.string().min(1).default("./data/files"),
  /** The biggest single file, in bytes (the editor's own limit for a model is 50 MiB). */
  MAX_FILE_BYTES: z.coerce.number().int().positive().default(52_428_800),
  /** The most bytes all the files of one project may take together. */
  MAX_PROJECT_FILE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(524_288_000),
  /** Web pages from these origins (comma separated) may call the file routes. */
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
});

export type CollabConfig = {
  port: number;
  host: string;
  dbPath: string;
  /** Where documents go when it is set (Postgres); otherwise the SQLite file. */
  databaseUrl: string | undefined;
  secret: string;
  maxMessageBytes: number;
  maxDocumentBytes: number;
  filesDir: string;
  maxFileBytes: number;
  maxProjectFileBytes: number;
  allowedOrigins: string[];
};

/** Reads and checks the environment. Throws one readable error listing everything that is wrong. */
export function loadConfig(env: NodeJS.ProcessEnv): CollabConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid collab server settings: ${problems}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    host: e.HOST,
    dbPath: e.DB_PATH,
    databaseUrl: e.DATABASE_URL,
    secret: e.COLLAB_SECRET,
    maxMessageBytes: e.MAX_MESSAGE_BYTES,
    maxDocumentBytes: e.MAX_DOCUMENT_BYTES,
    filesDir: e.FILES_DIR,
    maxFileBytes: e.MAX_FILE_BYTES,
    maxProjectFileBytes: e.MAX_PROJECT_FILE_BYTES,
    allowedOrigins: e.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ""),
  };
}
