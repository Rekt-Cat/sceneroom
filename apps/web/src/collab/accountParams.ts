import { z } from "zod";

/**
 * `?online=account` in the address opens the project online with the signed-in person's account (no token in the
 * address: the editor asks the web app for one). `&scene=<id>` names the scene to create when the project is not in this
 * browser yet, like the link addresses. The dashboard links here (step M8e).
 */
const paramsSchema = z.object({
  online: z.literal("account"),
  scene: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
});

export type AccountParams = { sceneId?: string };

export function parseAccountParams(search: string): AccountParams | null {
  const query = new URLSearchParams(search);
  if (!query.has("online")) return null;
  const parsed = paramsSchema.safeParse({
    online: query.get("online"),
    scene: query.get("scene") ?? undefined,
  });
  if (!parsed.success) {
    console.warn("Not going online: the address has invalid settings.");
    return null;
  }
  return parsed.data.scene ? { sceneId: parsed.data.scene } : {};
}
