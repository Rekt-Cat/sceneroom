import {
  redoOwnChange,
  resolveSelection,
  undoOwnChange,
  type History,
  type HistoryEntry,
  type Scene,
} from "@sceneroom/shared";
import { useImportStore } from "@/store/importStore";

/** The parts of the scene store that Undo and Redo read and write (kept structural so this file does not import the store). */
type Snapshot = { scene: Scene; selectedIds: string[] };
export type UndoableState = {
  scene: Scene;
  selectedIds: string[];
  history: History<Snapshot>;
};

/**
 * Per-person Undo for a shared scene (docs/backend/COLLABORATION.md, section 8).
 *
 * The editor's history entries hold the scene BEFORE a change. To take back only what a change did, the scene AFTER it
 * is needed as well; it is remembered here, beside the entry, the moment the entry is recorded (`watchHistory`). Undo then
 * puts back only the fields the change set, and only where nobody has changed them since (`undoOwnChange`).
 * The stacks, labels and the rest of the editor's history code stay as they are.
 */
const afterEntry = new WeakMap<HistoryEntry<Snapshot>, Scene>();

/**
 * Starts remembering the scene after each new step. `subscribe` is the store's subscribe function. Steps recorded before
 * this started have no "after" and are dropped when Undo reaches them. Returns a function that stops it.
 */
export function watchHistory(
  subscribe: (
    listener: (state: UndoableState, previous: UndoableState) => void,
  ) => () => void,
): () => void {
  return subscribe((state, previous) => {
    const top = state.history.past.at(-1);
    if (!top || top === previous.history.past.at(-1)) return;
    // A step that was just recorded: the scene now is the scene after it. (An Undo makes an older, already known entry the
    // top, and a Redo puts a known one back, so those are not touched.)
    if (
      state.history.past.length >= previous.history.past.length &&
      !afterEntry.has(top)
    ) {
      afterEntry.set(top, state.scene);
    }
  });
}

function tell(text: string): void {
  useImportStore.getState().setMessage({ tone: "info", text });
}

const OLD_STEPS =
  "Earlier steps from before this project went online cannot be undone while it is online, because that could undo other people's work.";
const PARTIAL =
  "Part of that step was left as it is, because someone else has changed it since.";

/** What Undo changes in the store when the project is online. */
export function undoOnline(state: UndoableState): Partial<UndoableState> {
  const entry = state.history.past.at(-1);
  if (!entry) return state;
  const after = afterEntry.get(entry);
  if (!after) {
    tell(OLD_STEPS);
    return { history: { past: [], future: state.history.future } };
  }
  const result = undoOwnChange(state.scene, {
    before: entry.state.scene,
    after,
  });
  if (result.skipped > 0) tell(PARTIAL);
  return {
    scene: result.scene,
    selectedIds: resolveSelection(result.scene, entry.state.selectedIds),
    history: {
      past: state.history.past.slice(0, -1),
      future: [...state.history.future, entry],
    },
  };
}

/** What Redo changes in the store when the project is online. */
export function redoOnline(state: UndoableState): Partial<UndoableState> {
  const entry = state.history.future.at(-1);
  if (!entry) return state;
  const after = afterEntry.get(entry);
  if (!after) {
    tell(OLD_STEPS);
    return { history: { past: state.history.past, future: [] } };
  }
  const result = redoOwnChange(state.scene, {
    before: entry.state.scene,
    after,
  });
  if (result.skipped > 0) tell(PARTIAL);
  return {
    scene: result.scene,
    selectedIds: resolveSelection(result.scene, state.selectedIds),
    history: {
      past: [...state.history.past, entry],
      future: state.history.future.slice(0, -1),
    },
  };
}
