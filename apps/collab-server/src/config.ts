import { z } from "zod";

/** The settings of the collab server, from environment variables. Checked at start so a mistake fails at once. */
const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(1234),
  HOST: z.string().min(1).default("127.0.0.1"),
  /** Where the SQLite file lives. */
  DB_PATH: z.string().min(1).default("./data/collab.sqlite"),
  /** The secret that link tokens are signed with. At least 32 characters; never commit the real one. */
  COLLAB_SECRET: z.string().min(32),
  /** The biggest single message a client may send, in bytes. Bigger ones close the connection. */
  MAX_MESSAGE_BYTES: z.coerce.number().int().positive().default(1_048_576),
  /** The biggest a saved document may grow to, in bytes. */
  MAX_DOCUMENT_BYTES: z.coerce.number().int().positive().default(20_971_520),
});

export type CollabConfig = {
  port: number;
  host: string;
  dbPath: string;
  secret: string;
  maxMessageBytes: number;
  maxDocumentBytes: number;
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
    secret: e.COLLAB_SECRET,
    maxMessageBytes: e.MAX_MESSAGE_BYTES,
    maxDocumentBytes: e.MAX_DOCUMENT_BYTES,
  };
}
