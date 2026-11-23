import { z } from "zod";
import { isWebSocketUrl } from "./serverAddress";

/**
 * What the address says about going online: `?collab=ws://server:1234&token=...` (and `&scene=<id>` to open a
 * shared scene in a browser that does not have the project yet). The Share button makes these links.
 * The values come from outside, so they are checked.
 */
const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const paramsSchema = z.object({
  collab: z
    .string()
    .max(500)
    .refine(isWebSocketUrl, "must be a ws:// or wss:// address"),
  token: z.string().min(1).max(2000),
  scene: idSchema.optional(),
});

export type CollabParams = {
  url: string;
  token: string;
  /** The scene to create when the project is not in this browser yet. */
  sceneId?: string;
};

/** Reads the address's query string. null if it does not ask for going online, or asks wrongly. */
export function parseCollabParams(search: string): CollabParams | null {
  const query = new URLSearchParams(search);
  if (!query.has("collab")) return null;
  const parsed = paramsSchema.safeParse({
    collab: query.get("collab"),
    token: query.get("token"),
    scene: query.get("scene") ?? undefined,
  });
  if (!parsed.success) {
    console.warn(
      "Not going online: the address has invalid collab settings:",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
    return null;
  }
  return {
    url: parsed.data.collab,
    token: parsed.data.token,
    ...(parsed.data.scene ? { sceneId: parsed.data.scene } : {}),
  };
}
