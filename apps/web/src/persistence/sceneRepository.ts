import { parseSavedScene, type Scene } from "@sceneroom/shared";
import { STORE_SCENES, run } from "./idb";

/** What looking for a saved scene found. */
export type LoadResult =
  | { status: "empty" }
  | { status: "loaded"; scene: Scene; savedAt: number }
  | { status: "invalid"; reason: string };

/** Where the scene is saved to and loaded from. */
export interface SceneRepository {
  load(): Promise<LoadResult>;
  save(scene: Scene): Promise<void>;
}

/** The key of the one scene we keep for now (projects with names come with the backend). */
export const SCENE_KEY = "current";
/** Where unreadable saved data is copied to before it can be overwritten, so it is not lost for good. */
export const BACKUP_KEY = "unreadable-backup";

export class IndexedDbSceneRepository implements SceneRepository {
  constructor(private readonly db: IDBDatabase) {}

  async load(): Promise<LoadResult> {
    const record = await run<unknown>(this.db, STORE_SCENES, "readonly", (s) =>
      s.get(SCENE_KEY),
    );
    if (record === undefined) return { status: "empty" };

    const raw =
      typeof record === "object" && record !== null
        ? (record as { scene?: unknown; savedAt?: unknown })
        : {};
    const parsed = parseSavedScene(raw.scene);
    if (!parsed.ok) {
      // Keep what was there: the next autosave would overwrite it
      await run(this.db, STORE_SCENES, "readwrite", (s) =>
        s.put(record, BACKUP_KEY),
      );
      return { status: "invalid", reason: parsed.reason };
    }
    return {
      status: "loaded",
      scene: parsed.scene,
      savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
    };
  }

  async save(scene: Scene): Promise<void> {
    await run(this.db, STORE_SCENES, "readwrite", (s) =>
      s.put({ savedAt: Date.now(), scene }, SCENE_KEY),
    );
  }
}
