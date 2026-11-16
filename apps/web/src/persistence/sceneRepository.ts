import {
  createProject,
  parseProject,
  parseSavedScene,
  type Project,
} from "@sceneroom/shared";
import { STORE_SCENES, run } from "./idb";

/** What looking for a saved project found. */
export type LoadResult =
  | { status: "empty" }
  | { status: "loaded"; project: Project; savedAt: number }
  | { status: "invalid"; reason: string };

/** Where the project is saved to and loaded from. */
export interface ProjectRepository {
  load(): Promise<LoadResult>;
  save(project: Project): Promise<void>;
}

/** The key of the one project we keep for now (projects with names and a list come with the backend). */
export const PROJECT_KEY = "project";
/** Where the single scene was saved before projects existed. Still read once, never written. */
export const LEGACY_SCENE_KEY = "current";
/** Where unreadable saved data is copied to before it can be overwritten, so it is not lost for good. */
export const BACKUP_KEY = "unreadable-backup";

export class IndexedDbProjectRepository implements ProjectRepository {
  constructor(private readonly db: IDBDatabase) {}

  async load(): Promise<LoadResult> {
    const record = await this.read(PROJECT_KEY);
    if (record !== undefined) {
      const raw = asRecord(record);
      const parsed = parseProject(raw.project);
      if (!parsed.ok) return this.keepBackup(record, parsed.reason);
      return {
        status: "loaded",
        project: parsed.project,
        savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
      };
    }

    // Saved before projects existed: that scene becomes the one scene of a project
    const legacy = await this.read(LEGACY_SCENE_KEY);
    if (legacy === undefined) return { status: "empty" };
    const raw = asRecord(legacy);
    const parsed = parseSavedScene(raw.scene);
    if (!parsed.ok) return this.keepBackup(legacy, parsed.reason);
    return {
      status: "loaded",
      project: createProject(crypto.randomUUID(), parsed.scene, "Scene 1"),
      savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
    };
  }

  async save(project: Project): Promise<void> {
    await run(this.db, STORE_SCENES, "readwrite", (s) =>
      s.put({ savedAt: Date.now(), project }, PROJECT_KEY),
    );
  }

  private read(key: string): Promise<unknown> {
    return run<unknown>(this.db, STORE_SCENES, "readonly", (s) => s.get(key));
  }

  /** Keep what was there: the next autosave would overwrite it. */
  private async keepBackup(
    record: unknown,
    reason: string,
  ): Promise<LoadResult> {
    await run(this.db, STORE_SCENES, "readwrite", (s) =>
      s.put(record, BACKUP_KEY),
    );
    return { status: "invalid", reason };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
