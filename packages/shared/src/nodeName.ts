import { sceneNodeObjectSchema } from "./scene";

/**
 * Cleans up a name typed by the user: trims spaces and checks it against the scene schema
 * (1 to 100 characters). Returns the clean name, or null if it is not allowed (for example empty).
 */
export function normalizeNodeName(input: string): string | null {
  const result = sceneNodeObjectSchema.shape.name.safeParse(input.trim());
  return result.success ? result.data : null;
}
