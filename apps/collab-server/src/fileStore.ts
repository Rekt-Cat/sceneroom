import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

/** A file id is the SHA-256 of its bytes: exactly 64 lowercase hex characters. Nothing else is ever a file name. */
export const FILE_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Where the big files (imported models, edited meshes, painted pictures) are kept, by project and by id. The id is
 * the fingerprint of the bytes, so a file never changes and storing the same file twice is harmless.
 * (docs/backend/COLLABORATION.md, section 6.) The server only knows this interface: a folder now, Cloudflare R2 later.
 */
export interface FileStore {
  has(projectId: string, id: string): Promise<boolean>;
  /** The bytes, or null if there is no such file. */
  get(projectId: string, id: string): Promise<Uint8Array | null>;
  /** Stores a file. Storing one that is there already does nothing. */
  put(projectId: string, id: string, bytes: Uint8Array): Promise<void>;
  /** How many bytes the project's files take together. */
  projectBytes(projectId: string): Promise<number>;
}

/** Keeps files in memory only. For tests. */
export class MemoryFileStore implements FileStore {
  private readonly files = new Map<string, Uint8Array>();
  async has(projectId: string, id: string) {
    return this.files.has(`${projectId}/${id}`);
  }
  async get(projectId: string, id: string) {
    return this.files.get(`${projectId}/${id}`) ?? null;
  }
  async put(projectId: string, id: string, bytes: Uint8Array) {
    this.files.set(`${projectId}/${id}`, bytes);
  }
  async projectBytes(projectId: string) {
    let total = 0;
    for (const [key, bytes] of this.files) {
      if (key.startsWith(`${projectId}/`)) total += bytes.byteLength;
    }
    return total;
  }
}

/**
 * Keeps files in a folder: `<root>/<projectId>/<id>`. Ids and project ids are checked before they touch a path, so a
 * request can never name a file outside the folder. A file is written under a temporary name and renamed, so a
 * half-written file is never seen.
 */
export class FolderFileStore implements FileStore {
  constructor(private readonly root: string) {}

  private path(projectId: string, id: string): string {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId) || !FILE_ID_PATTERN.test(id)) {
      throw new Error("Not a valid project or file id");
    }
    return join(this.root, projectId, id);
  }

  async has(projectId: string, id: string): Promise<boolean> {
    try {
      await stat(this.path(projectId, id));
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  async get(projectId: string, id: string): Promise<Uint8Array | null> {
    try {
      return await readFile(this.path(projectId, id));
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async put(projectId: string, id: string, bytes: Uint8Array): Promise<void> {
    const target = this.path(projectId, id);
    if (await this.has(projectId, id)) return;
    await mkdir(join(this.root, projectId), { recursive: true });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporary, bytes);
    await rename(temporary, target);
  }

  async projectBytes(projectId: string): Promise<number> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(projectId)) return 0;
    let names: string[];
    try {
      names = await readdir(join(this.root, projectId));
    } catch (error) {
      if (isMissing(error)) return 0;
      throw error;
    }
    let total = 0;
    for (const name of names) {
      if (!FILE_ID_PATTERN.test(name)) continue; // leftovers of an interrupted write are not counted
      total += (await stat(join(this.root, projectId, name))).size;
    }
    return total;
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
