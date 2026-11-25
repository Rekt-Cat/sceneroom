import { z } from "zod";
import { isWebSocketUrl } from "./serverAddress";
import { createAccountTokenSource, type TokenSource } from "./tokenSource";

const PREFIX = "sceneroom-collab-link:";

const urlSchema = z.string().max(500).refine(isWebSocketUrl);

const linkSchema = z.object({
  url: urlSchema,
  token: z.string().min(1).max(2000),
});

/** Online with the person's account: no token is kept, a fresh one is asked from the web app at every connect. */
const accountSchema = z.object({ kind: z.literal("account"), url: urlSchema });

const connectionSchema = z.union([accountSchema, linkSchema]);

/**
 * How a project goes online: the server and either a link token or "with my account". Kept in this browser so
 * reopening the project reconnects.
 */
export type SavedConnection = z.infer<typeof connectionSchema>;

export function isAccountConnection(
  connection: SavedConnection,
): connection is z.infer<typeof accountSchema> {
  return "kind" in connection;
}

/** What the connection shows the collab server: the link token, or (for an account) a source of fresh tokens. */
export function connectionToken(
  projectId: string,
  connection: SavedConnection,
): string | TokenSource {
  return isAccountConnection(connection)
    ? createAccountTokenSource(projectId)
    : connection.token;
}

export function loadConnection(projectId: string): SavedConnection | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + projectId);
    if (!raw) return null;
    const parsed = connectionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn("Could not read the saved online link:", error);
    return null;
  }
}

export function saveConnection(
  projectId: string,
  connection: SavedConnection,
): void {
  try {
    window.localStorage.setItem(PREFIX + projectId, JSON.stringify(connection));
  } catch (error) {
    console.warn("Could not save the online link:", error);
  }
}

export function forgetConnection(projectId: string): void {
  try {
    window.localStorage.removeItem(PREFIX + projectId);
  } catch (error) {
    console.warn("Could not forget the online link:", error);
  }
}
