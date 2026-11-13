/**
 * Where the bytes of imported files are kept. A scene object only holds the id of its file; the file
 * itself can be many megabytes, so it never goes inside the scene data or the undo history.
 *
 * Every file is kept under its id (a fingerprint of its contents). The rest of the app only uses this
 * interface. At startup the app swaps the in-memory version for one backed by the browser's
 * IndexedDB (see persistence/), so files survive a reload; if the browser does not allow that, the
 * in-memory version stays and files are lost when the page closes. Later there will be a version
 * backed by online storage.
 */
export interface AssetStorage {
  put(id: string, data: ArrayBuffer): Promise<void>;
  get(id: string): Promise<ArrayBuffer | undefined>;
  has(id: string): Promise<boolean>;
}

export class MemoryAssetStorage implements AssetStorage {
  private readonly files = new Map<string, ArrayBuffer>();

  async put(id: string, data: ArrayBuffer): Promise<void> {
    this.files.set(id, data);
  }

  async get(id: string): Promise<ArrayBuffer | undefined> {
    return this.files.get(id);
  }

  async has(id: string): Promise<boolean> {
    return this.files.has(id);
  }
}

let current: AssetStorage = new MemoryAssetStorage();

/** Switches where files are kept (used once at startup). Files already in the old one are not moved. */
export function setAssetStorage(storage: AssetStorage): void {
  current = storage;
}

/** The storage everything else uses. It always forwards to whichever one is current. */
export const assetStorage: AssetStorage = {
  put: (id, data) => current.put(id, data),
  get: (id) => current.get(id),
  has: (id) => current.has(id),
};
