import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyScene, type Scene } from "@sceneroom/shared";
import {
  AUTOSAVE_DEBOUNCE_MS,
  createAutosave,
  type SaveStatus,
} from "./autosave";

/** A scene that can be told apart from another by its version of "name" in assets (just an id). */
const sceneWith = (n: number): Scene => ({
  ...createEmptyScene(),
  assets: {
    [`s${n}`]: {
      id: `s${n}`,
      name: "x",
      type: "model",
      bytes: 1,
      triangles: 1,
      boundsMin: [0, 0, 0],
      boundsMax: [1, 1, 1],
      note: "",
    },
  },
});

function setup(options: { failNext?: () => boolean } = {}) {
  const saved: Scene[] = [];
  const statuses: SaveStatus[] = [];
  let current = sceneWith(0);
  let resolveSave: (() => void) | null = null;
  let holdSaves = false;
  const autosave = createAutosave({
    getScene: () => current,
    save: async (scene) => {
      if (options.failNext?.()) throw new Error("disk full");
      if (holdSaves)
        await new Promise<void>((resolve) => (resolveSave = resolve));
      saved.push(scene);
    },
    onStatus: (status) => statuses.push(status),
  });
  return {
    autosave,
    saved,
    statuses,
    change: (n: number) => {
      current = sceneWith(n);
      autosave.markChanged();
    },
    hold: () => {
      holdSaves = true;
    },
    release: () => {
      holdSaves = false;
      resolveSave?.();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createAutosave", () => {
  it("saves once, a moment after the last of several quick changes", async () => {
    const t = setup();
    t.change(1);
    t.change(2);
    t.change(3);
    expect(t.saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(t.saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(t.saved).toHaveLength(1);
    expect(Object.keys(t.saved[0]!.assets)).toEqual(["s3"]); // the latest scene
  });

  it("reports saving, then saved", async () => {
    const t = setup();
    t.change(1);
    expect(t.statuses).toEqual(["saving"]);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 1);
    expect(t.statuses.at(-1)).toBe("saved");
    expect(t.autosave.hasUnsavedChanges()).toBe(false);
  });

  it("knows there are unsaved changes from the change until the write finishes", async () => {
    const t = setup();
    expect(t.autosave.hasUnsavedChanges()).toBe(false);
    t.change(1);
    expect(t.autosave.hasUnsavedChanges()).toBe(true);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 1);
    expect(t.autosave.hasUnsavedChanges()).toBe(false);
  });

  it("flush writes immediately and waits for it", async () => {
    const t = setup();
    t.change(1);
    await t.autosave.flush();
    expect(t.saved).toHaveLength(1);
    expect(t.statuses.at(-1)).toBe("saved");
    // the timer must not write a second time
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(t.saved).toHaveLength(1);
  });

  it("flush with nothing waiting does nothing", async () => {
    const t = setup();
    await t.autosave.flush();
    expect(t.saved).toHaveLength(0);
  });

  it("a change made while a write is running is written right after it", async () => {
    const t = setup();
    t.hold();
    t.change(1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 1); // write starts, is held
    expect(t.saved).toHaveLength(0);
    t.change(2); // arrives mid-write
    t.release();
    await vi.advanceTimersByTimeAsync(10);
    t.release();
    await vi.advanceTimersByTimeAsync(10);
    expect(t.saved.map((s) => Object.keys(s.assets)[0])).toEqual(["s1", "s2"]);
    expect(t.statuses.at(-1)).toBe("saved");
  });

  it("a failed write is reported, stays unsaved, and the next change tries again", async () => {
    let fail = true;
    const t = setup({ failNext: () => fail });
    t.change(1);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 1);
    expect(t.statuses.at(-1)).toBe("error");
    expect(t.autosave.hasUnsavedChanges()).toBe(true);

    fail = false;
    t.change(2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS + 1);
    expect(t.statuses.at(-1)).toBe("saved");
    expect(t.autosave.hasUnsavedChanges()).toBe(false);
    expect(Object.keys(t.saved.at(-1)!.assets)).toEqual(["s2"]);
  });

  it("after stop, nothing more is written", async () => {
    const t = setup();
    t.change(1);
    t.autosave.stop();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(t.saved).toHaveLength(0);
    t.change(2);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 3);
    expect(t.saved).toHaveLength(0);
  });
});
