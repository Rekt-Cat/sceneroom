import {
  EMPTY_PROJECT_INDEX,
  availableSceneName,
  entryFor,
  parseProject,
  projectIndexSchema,
  withEntry,
  withoutEntry,
  type Project,
  type ProjectEntry,
  type ProjectIndex,
} from "@sceneroom/shared";
import { STORE_SCENES, run } from "./idb";
import { IndexedDbProjectRepository, type LoadResult } from "./sceneRepository";

/** The list of projects (what the home screen shows). */
export const INDEX_KEY = "project-index";
/** Where unreadable saved projects are copied to before anything can overwrite them. */
export const LIBRARY_BACKUP_PREFIX = "unreadable-project:";
const RECORD_PREFIX = "project:";
const THUMBNAIL_PREFIX = "thumb:";

export const projectKey = (id: string) => `${RECORD_PREFIX}${id}`;
export const thumbnailKey = (id: string) => `${THUMBNAIL_PREFIX}${id}`;

/** What the home screen gets: the cards, and a sentence if something saved could not be read. */
export type LibraryListing = {
  entries: ProjectEntry[];
  problem: string | null;
};

/**
 * Many projects in the browser: a small index (what the home screen lists), one record per project, and one
 * small picture per project. Imported model files are not here: they are kept once by fingerprint (see
 * `IndexedDbAssetStorage`), so a model used by two projects is stored once.
 *
 * The first time it runs, the one project the app used to keep becomes the first entry (the old record stays
 * where it was, untouched, as a backup). The index is only a convenience: `list` checks it against the records
 * and repairs it, so a save that was interrupted between the two writes loses nothing.
 */
export class IndexedDbProjectLibrary {
  constructor(
    private readonly db: IDBDatabase,
    private readonly now: () => number = Date.now,
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  /** The projects, after the first-run move of the old single project and a check of the index. */
  async list(): Promise<LibraryListing> {
    let problem: string | null = null;
    let index = await this.readIndex();
    if (index === null) {
      const moved = await this.moveOldProject();
      problem = moved.problem;
      index = moved.index;
    }
    const repaired = await this.reconcile(index);
    if (repaired !== index) await this.writeIndex(repaired);
    return { entries: repaired.projects, problem };
  }

  /** A project to open. `empty` means there is no such project (a wrong or deleted link). */
  async load(id: string): Promise<LoadResult> {
    const record = await this.read(projectKey(id));
    if (record === undefined) return { status: "empty" };
    const raw = asRecord(record);
    const parsed = parseProject(raw.project);
    if (!parsed.ok) {
      await this.write(`${LIBRARY_BACKUP_PREFIX}${id}`, record);
      return { status: "invalid", reason: parsed.reason };
    }
    return {
      status: "loaded",
      project: parsed.project,
      savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
    };
  }

  /** Saves a project and updates its card (name, scene count, last edit). */
  async save(id: string, project: Project): Promise<void> {
    const now = this.now();
    await this.write(projectKey(id), { savedAt: now, project });
    const index = (await this.readIndex()) ?? EMPTY_PROJECT_INDEX;
    const before = index.projects.find((p) => p.id === id);
    await this.writeIndex(
      withEntry(index, entryFor(id, project, before?.createdAt ?? now, now)),
    );
  }

  /** Stores a new project and returns its id. */
  async create(project: Project): Promise<string> {
    const id = this.newId();
    await this.save(id, project);
    return id;
  }

  /** Copies a project under a new name that no other project has. Returns the copy's id, or null if the project is gone. */
  async duplicate(id: string): Promise<string | null> {
    const loaded = await this.load(id);
    if (loaded.status !== "loaded") return null;
    const index = (await this.readIndex()) ?? EMPTY_PROJECT_INDEX;
    const name = availableSceneName(
      index.projects,
      `${loaded.project.name} copy`,
    );
    return this.create({ ...loaded.project, name });
  }

  async remove(id: string): Promise<void> {
    await this.delete(projectKey(id));
    await this.delete(thumbnailKey(id));
    const index = await this.readIndex();
    if (index) await this.writeIndex(withoutEntry(index, id));
  }

  /** Keeps the picture of a project (a small JPEG as a data URL). */
  async setThumbnail(id: string, dataUrl: string): Promise<void> {
    await this.write(thumbnailKey(id), dataUrl);
  }

  /** The picture of a project, or null if it has none yet. */
  async thumbnail(id: string): Promise<string | null> {
    const value = await this.read(thumbnailKey(id));
    return typeof value === "string" ? value : null;
  }

  // ---- inside ----

  private async moveOldProject(): Promise<{
    index: ProjectIndex;
    problem: string | null;
  }> {
    const old = await new IndexedDbProjectRepository(this.db).load();
    if (old.status === "loaded") {
      const created = old.savedAt > 0 ? old.savedAt : this.now();
      const id = this.newId();
      await this.write(projectKey(id), {
        savedAt: created,
        project: old.project,
      });
      const index = withEntry(
        EMPTY_PROJECT_INDEX,
        entryFor(id, old.project, created, created),
      );
      await this.writeIndex(index);
      return { index, problem: null };
    }
    await this.writeIndex(EMPTY_PROJECT_INDEX);
    return {
      index: EMPTY_PROJECT_INDEX,
      problem:
        old.status === "invalid"
          ? `Your earlier saved project could not be read (${old.reason}). It is kept as a backup in this browser.`
          : null,
    };
  }

  /** The index checked against the records: entries without a record are dropped, records without an entry are added. */
  private async reconcile(index: ProjectIndex): Promise<ProjectIndex> {
    const keys = await run<IDBValidKey[]>(
      this.db,
      STORE_SCENES,
      "readonly",
      (s) => s.getAllKeys(),
    );
    const ids = new Set(
      keys
        .filter(
          (k): k is string =>
            typeof k === "string" && k.startsWith(RECORD_PREFIX),
        )
        .map((k) => k.slice(RECORD_PREFIX.length)),
    );
    let result = index;
    for (const entry of index.projects) {
      if (!ids.has(entry.id)) result = withoutEntry(result, entry.id);
    }
    for (const id of ids) {
      if (result.projects.some((p) => p.id === id)) continue;
      const loaded = await this.load(id);
      if (loaded.status !== "loaded") continue;
      result = withEntry(
        result,
        entryFor(id, loaded.project, loaded.savedAt, loaded.savedAt),
      );
    }
    return result;
  }

  private async readIndex(): Promise<ProjectIndex | null> {
    const value = await this.read(INDEX_KEY);
    if (value === undefined) return null;
    const parsed = projectIndexSchema.safeParse(value);
    // An index that cannot be read is rebuilt from the records (see `reconcile`)
    return parsed.success ? parsed.data : EMPTY_PROJECT_INDEX;
  }

  private writeIndex(index: ProjectIndex): Promise<void> {
    return this.write(INDEX_KEY, index);
  }

  private read(key: string): Promise<unknown> {
    return run<unknown>(this.db, STORE_SCENES, "readonly", (s) => s.get(key));
  }

  private async write(key: string, value: unknown): Promise<void> {
    await run(this.db, STORE_SCENES, "readwrite", (s) => s.put(value, key));
  }

  private async delete(key: string): Promise<void> {
    await run(this.db, STORE_SCENES, "readwrite", (s) => s.delete(key));
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}
