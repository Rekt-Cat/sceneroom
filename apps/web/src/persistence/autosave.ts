import type { Scene } from "@sceneroom/shared";

/** How long to wait after the last change before writing (a drag makes many changes; this makes them one write). */
export const AUTOSAVE_DEBOUNCE_MS = 500;

export type SaveStatus = "saving" | "saved" | "error";

export type Autosave = {
  /** Call after every change to the scene. */
  markChanged: () => void;
  /** Writes right now if anything is waiting, and resolves when done (for when the page is being left). */
  flush: () => Promise<void>;
  /** True if there is a change that is not safely written yet (waiting, being written, or failed). */
  hasUnsavedChanges: () => boolean;
  /** Stops for good (pending writes are dropped; call flush first to keep them). */
  stop: () => void;
};

/**
 * Saves the scene a moment after it changes. Many quick changes become one write; if more changes
 * arrive while a write is running, another write follows. A failed write is reported and retried on
 * the next change (the unsaved state is remembered, so the page can warn before closing).
 */
export function createAutosave(options: {
  save: (scene: Scene) => Promise<void>;
  getScene: () => Scene;
  onStatus: (status: SaveStatus, error?: unknown) => void;
  debounceMs?: number;
}): Autosave {
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;
  let writing: Promise<void> | null = null;
  let stopped = false;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  async function writeLoop(): Promise<void> {
    let failure: unknown = null;
    while (dirty && !stopped) {
      clearTimer();
      dirty = false;
      try {
        await options.save(options.getScene());
      } catch (error) {
        failure = error;
        dirty = true; // still unsaved
        break;
      }
    }
    writing = null;
    if (stopped) return;
    if (failure !== null) options.onStatus("error", failure);
    else if (!dirty) options.onStatus("saved");
  }

  function startWrite(): Promise<void> {
    if (!writing) writing = writeLoop();
    return writing;
  }

  return {
    markChanged() {
      if (stopped) return;
      dirty = true;
      options.onStatus("saving");
      clearTimer();
      // While a write is running it will notice `dirty` and write again; no timer needed then
      if (!writing) timer = setTimeout(() => void startWrite(), debounceMs);
    },
    async flush() {
      if (stopped) return;
      if (dirty) await startWrite();
      else if (writing) await writing;
    },
    hasUnsavedChanges: () => dirty || writing !== null,
    stop() {
      stopped = true;
      clearTimer();
    },
  };
}
