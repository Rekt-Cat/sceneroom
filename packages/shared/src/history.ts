/**
 * Undo and redo as two stacks of earlier states. Pure functions: they never change the history
 * they are given, they return a new one.
 *
 * `T` is whatever one step restores (for SceneRoom: the scene and the selection).
 * Each entry has a short `label` naming the change, for tooltips such as "Undo Add cube".
 */
export type HistoryEntry<T> = {
  /** How things were BEFORE the change with this label (for the past), or AFTER it (for the future). */
  state: T;
  label: string;
};

export type History<T> = {
  /** Oldest first. The last entry is what Undo takes back. */
  past: readonly HistoryEntry<T>[];
  /** The last entry is what Redo puts back. */
  future: readonly HistoryEntry<T>[];
};

/** How many steps are remembered. Older ones are dropped. */
export const HISTORY_LIMIT = 100;

export function createHistory<T>(): History<T> {
  return { past: [], future: [] };
}

/**
 * Call just before applying a change. `before` is the state to return to on Undo and `label` names
 * the change. Making a new change ends any redo chain.
 */
export function recordChange<T>(
  history: History<T>,
  before: HistoryEntry<T>,
  limit: number = HISTORY_LIMIT,
): History<T> {
  const past = [...history.past, before];
  return { past: past.slice(Math.max(0, past.length - limit)), future: [] };
}

export type HistoryStep<T> = {
  history: History<T>;
  /** The state to show now. */
  state: T;
  /** The label of the change that was undone or redone. */
  label: string;
};

/** Takes back the last change. `current` is the state right now (it becomes the redo step). */
export function undoStep<T>(
  history: History<T>,
  current: T,
): HistoryStep<T> | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [...history.future, { state: current, label: entry.label }],
    },
    state: entry.state,
    label: entry.label,
  };
}

/** Puts back the last undone change. `current` is the state right now (it becomes the undo step). */
export function redoStep<T>(
  history: History<T>,
  current: T,
): HistoryStep<T> | null {
  const entry = history.future.at(-1);
  if (!entry) return null;
  return {
    history: {
      past: [...history.past, { state: current, label: entry.label }],
      future: history.future.slice(0, -1),
    },
    state: entry.state,
    label: entry.label,
  };
}

/** Label of the change Undo would take back, or null if there is nothing to undo. */
export function nextUndoLabel<T>(history: History<T>): string | null {
  return history.past.at(-1)?.label ?? null;
}

/** Label of the change Redo would put back, or null if there is nothing to redo. */
export function nextRedoLabel<T>(history: History<T>): string | null {
  return history.future.at(-1)?.label ?? null;
}
