import { z } from "zod";
import { isWebSocketUrl } from "./serverAddress";

const PREFIX = "sceneroom-collab-link:";

const connectionSchema = z.object({
  url: z.string().max(500).refine(isWebSocketUrl),
  token: z.string().min(1).max(2000),
});

/** How a project goes online: the server and the link token. Kept in this browser so reopening the project reconnects. */
export type SavedConnection = z.infer<typeof connectionSchema>;

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
