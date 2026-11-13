/**
 * Where the bytes of imported files are kept. A scene object only holds the id of its file; the file
 * itself can be many megabytes, so it never goes inside the scene data or the undo history.
 *
 * Today the files are kept in memory, so they are gone when the page is reloaded (the scene is not
 * saved yet either). When saving arrives (Phase 5) there will be a version backed by the browser's
 * IndexedDB, and later one backed by online storage; the rest of the app uses only this interface.
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

export const assetStorage: AssetStorage = new MemoryAssetStorage();
