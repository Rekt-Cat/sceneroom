import type { AssetStorage } from "@/assets/assetStorage";
import type { FileClient } from "./fileClient";

export type FileUploaderOptions = {
  client: Pick<FileClient, "has" | "upload">;
  /** Your own storage: where the bytes of files you made are. */
  storage: AssetStorage;
  /** Turns the stored bytes into the bytes to send (a mesh kept as a patch is sent as the whole mesh, so the id still matches). */
  prepare: (id: string, bytes: Uint8Array) => Promise<Uint8Array>;
  /** Wait this long after a request before working, so a burst of changes becomes one pass. Default 300. */
  delayMs?: number;
  /** Try again this long after a failure. Default 10 000. */
  retryMs?: number;
  /** How many files go up at once. Default 2. */
  concurrency?: number;
};

export type FileUploader = {
  /** The files the scene refers to right now. Ones the server does not have yet, and that you have, are sent. */
  request: (ids: readonly string[]) => void;
  /** Resolves when nothing is waiting or running (for tests). */
  idle: () => Promise<void>;
  destroy: () => void;
};

/**
 * Sends the files of a shared scene to the server. It is driven by what the scene refers to, not by every file ever
 * stored: a picture that was painted over before it was sent is skipped, and a file that is already on the server
 * (checked first) is not sent again. Files that are not in your own storage (they came from someone else) are skipped.
 * A failure is logged and tried again later; nothing here blocks editing.
 */
export function createFileUploader(options: FileUploaderOptions): FileUploader {
  const delayMs = options.delayMs ?? 300;
  const retryMs = options.retryMs ?? 10_000;
  const concurrency = options.concurrency ?? 2;

  let wanted = new Set<string>();
  /** Files known to be on the server. */
  const onServer = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let destroyed = false;

  function schedule(after: number): void {
    if (destroyed || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      running = run().finally(() => {
        running = null;
      });
    }, after);
  }

  async function sendOne(id: string): Promise<boolean> {
    const stored = await options.storage.get(id);
    if (!stored) return true; // not ours: it came from someone else, who sent it
    if (await options.client.has(id)) {
      onServer.add(id);
      return true;
    }
    await options.client.upload(
      id,
      await options.prepare(id, new Uint8Array(stored)),
    );
    onServer.add(id);
    return true;
  }

  async function run(): Promise<void> {
    let failed = false;
    const queue = [...wanted].filter((id) => !onServer.has(id));
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
          if (destroyed) return;
          // A file painted over while it waited is no longer wanted
          if (!wanted.has(id)) continue;
          try {
            await sendOne(id);
          } catch (error) {
            failed = true;
            console.warn(
              `Could not send file ${id.slice(0, 8)}… to the server (will try again):`,
              error,
            );
          }
        }
      },
    );
    await Promise.all(workers);
    if (failed) schedule(retryMs);
  }

  return {
    request(ids) {
      wanted = new Set(ids);
      if ([...wanted].some((id) => !onServer.has(id))) schedule(delayMs);
    },
    async idle() {
      while (timer !== null || running) {
        if (running) await running;
        else await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    destroy() {
      destroyed = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
