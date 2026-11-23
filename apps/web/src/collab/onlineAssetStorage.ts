import type { AssetStorage } from "@/assets/assetStorage";
import type { FileClient } from "./fileClient";

/** How long to wait between tries while a file is not on the server yet (the sender may still be uploading it). */
export const DEFAULT_RETRY_DELAYS_MS = [
  500, 1_000, 2_000, 4_000, 8_000, 16_000,
];

/** After a file could not be fetched at all, asking again within this time answers "missing" at once. */
const GIVE_UP_FOR_MS = 30_000;

/**
 * The editor's file storage for a shared project: your own storage, plus the server as a second place to look. A file
 * that is not in your own storage (it came with someone else's change) is downloaded when something asks for it, checked
 * against its id, and kept in your own storage from then on. Everything else is exactly as before: the rest of the app
 * only sees the `AssetStorage` interface (apps/web/src/assets/assetStorage.ts).
 *
 * Sending files is not done here (see fileUploader.ts): it follows which files the scene refers to.
 */
export class OnlineAssetStorage implements AssetStorage {
  private readonly downloads = new Map<
    string,
    Promise<ArrayBuffer | undefined>
  >();
  private readonly gaveUp = new Map<string, number>();

  constructor(
    private readonly inner: AssetStorage,
    private readonly client: Pick<FileClient, "download">,
    private readonly options: {
      retryDelaysMs?: readonly number[];
      sleep?: (ms: number) => Promise<void>;
      now?: () => number;
    } = {},
  ) {}

  put(id: string, data: ArrayBuffer): Promise<void> {
    return this.inner.put(id, data);
  }

  has(id: string): Promise<boolean> {
    return this.inner.has(id);
  }

  async get(id: string): Promise<ArrayBuffer | undefined> {
    const own = await this.inner.get(id);
    if (own) return own;
    const now = this.options.now ?? Date.now;
    const failedAt = this.gaveUp.get(id);
    if (failedAt !== undefined && now() - failedAt < GIVE_UP_FOR_MS)
      return undefined;
    let download = this.downloads.get(id);
    if (!download) {
      download = this.fetchWithRetry(id).finally(() =>
        this.downloads.delete(id),
      );
      this.downloads.set(id, download);
    }
    return download;
  }

  private async fetchWithRetry(id: string): Promise<ArrayBuffer | undefined> {
    const delays = this.options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    const sleep =
      this.options.sleep ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        const bytes = await this.client.download(id);
        if (bytes) {
          await this.inner.put(id, bytes);
          this.gaveUp.delete(id);
          return bytes;
        }
      } catch (error) {
        // A network problem, or bytes that did not match: try again, the next answer may be good
        console.warn(`Could not download file ${id.slice(0, 8)}…:`, error);
      }
      const delay = delays[attempt];
      if (delay !== undefined) await sleep(delay);
    }
    this.gaveUp.set(id, (this.options.now ?? Date.now)());
    return undefined;
  }
}
