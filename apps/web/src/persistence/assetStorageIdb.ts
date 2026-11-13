import type { AssetStorage } from "@/assets/assetStorage";
import { STORE_ASSETS, run } from "./idb";

/** Keeps imported files in the browser's IndexedDB, so they survive a reload. Keyed by the file's fingerprint. */
export class IndexedDbAssetStorage implements AssetStorage {
  constructor(private readonly db: IDBDatabase) {}

  async put(id: string, data: ArrayBuffer): Promise<void> {
    await run(this.db, STORE_ASSETS, "readwrite", (store) =>
      store.put(data, id),
    );
  }

  async get(id: string): Promise<ArrayBuffer | undefined> {
    const value = await run<unknown>(
      this.db,
      STORE_ASSETS,
      "readonly",
      (store) => store.get(id),
    );
    return value instanceof ArrayBuffer ? value : undefined;
  }

  async has(id: string): Promise<boolean> {
    const count = await run(this.db, STORE_ASSETS, "readonly", (store) =>
      store.count(id),
    );
    return count > 0;
  }
}
