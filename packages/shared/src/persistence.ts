import { sceneSchema, type Scene } from "./scene";

/** What reading a saved scene gave back. */
export type SavedSceneResult =
  { ok: true; scene: Scene } | { ok: false; reason: string };

/**
 * Checks data that was read back from storage and turns it into a scene. Anything stored in the
 * browser could have been changed, damaged, or written by an older or newer version of the app, so
 * it is checked like any other outside data. Fields added since it was saved get their defaults.
 */
export function parseSavedScene(raw: unknown): SavedSceneResult {
  const result = sceneSchema.safeParse(raw);
  if (result.success) return { ok: true, scene: result.data };
  const first = result.error.issues[0];
  const where = first?.path.length ? ` (at ${first.path.join(".")})` : "";
  return {
    ok: false,
    reason: `${first?.message ?? "the data has the wrong shape"}${where}`,
  };
}
