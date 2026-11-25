import { z } from "zod";

/** The settings of the collab server, from environment variables. Checked at start so a mistake fails at once. */
/** An empty value in an environment file means "not set". */
function emptyAsMissing<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === "" ? undefined : value), schema);
}

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
  /**
   * Keep the big files in an S3-compatible bucket (Cloudflare R2, Backblaze B2, AWS S3) instead of the folder: needed on a
   * host whose disk does not survive a restart. All four of endpoint, bucket and the two keys go together; none = the folder.
   */
  S3_ENDPOINT: emptyAsMissing(z.string().url().optional()),
  S3_BUCKET: emptyAsMissing(z.string().min(1).optional()),
  S3_REGION: z.string().min(1).default("auto"),
  S3_ACCESS_KEY_ID: emptyAsMissing(z.string().min(1).optional()),
  S3_SECRET_ACCESS_KEY: emptyAsMissing(z.string().min(1).optional()),
  /**
   * Whether the share-link routes of stage A (`/share/...`, the owner key in a browser) are available. They keep their owners
   * in the SQLite file, which a host without a lasting disk loses at every restart (a cancelled link would work again), so
   * such a deployment sets this to "false" and uses accounts only.
   */
  LINK_SHARING: z.enum(["true", "false"]).default("true"),
});

const S3_GROUP = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

export type S3Settings = {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

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
  /** Where the big files go when it is set (an S3-compatible bucket); otherwise the folder. */
  s3: S3Settings | undefined;
  /** False = the share-link routes answer 404. */
  linkSharing: boolean;
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
  const given = S3_GROUP.filter((name) => e[name] !== undefined);
  if (given.length > 0 && given.length < S3_GROUP.length) {
    const missing = S3_GROUP.filter((name) => e[name] === undefined);
    throw new Error(
      `Invalid collab server settings: the S3 settings go together; missing: ${missing.join(", ")}`,
    );
  }
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
    s3:
      e.S3_ENDPOINT &&
      e.S3_BUCKET &&
      e.S3_ACCESS_KEY_ID &&
      e.S3_SECRET_ACCESS_KEY
        ? {
            endpoint: e.S3_ENDPOINT,
            bucket: e.S3_BUCKET,
            region: e.S3_REGION,
            accessKeyId: e.S3_ACCESS_KEY_ID,
            secretAccessKey: e.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    linkSharing: e.LINK_SHARING === "true",
    allowedOrigins: e.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== ""),
  };
}
