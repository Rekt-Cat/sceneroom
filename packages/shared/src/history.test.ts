import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  createHistory,
  nextRedoLabel,
  nextUndoLabel,
  recordChange,
  redoStep,
  undoStep,
} from "./history";

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const h = createHistory<number>();
    expect(nextUndoLabel(h)).toBeNull();
    expect(nextRedoLabel(h)).toBeNull();
    expect(undoStep(h, 1)).toBeNull();
    expect(redoStep(h, 1)).toBeNull();
  });

  it("undo returns the state from before the change and enables redo", () => {
    // value was 1, a change "double" made it 2
    const h = recordChange(createHistory<number>(), {
      state: 1,
      label: "double",
    });
    expect(nextUndoLabel(h)).toBe("double");

    const undone = undoStep(h, 2);
    expect(undone?.state).toBe(1);
    expect(undone?.label).toBe("double");
    expect(nextUndoLabel(undone!.history)).toBeNull();
    expect(nextRedoLabel(undone!.history)).toBe("double");

    const redone = redoStep(undone!.history, 1);
    expect(redone?.state).toBe(2);
    expect(nextUndoLabel(redone!.history)).toBe("double");
    expect(nextRedoLabel(redone!.history)).toBeNull();
  });

  it("undoes several changes in reverse order", () => {
    let h = createHistory<number>();
    h = recordChange(h, { state: 1, label: "a" }); // 1 -> 2
    h = recordChange(h, { state: 2, label: "b" }); // 2 -> 3
    const first = undoStep(h, 3)!;
    expect([first.state, first.label]).toEqual([2, "b"]);
    const second = undoStep(first.history, first.state)!;
    expect([second.state, second.label]).toEqual([1, "a"]);
    expect(undoStep(second.history, second.state)).toBeNull();
  });

  it("a new change after an undo ends the redo chain", () => {
    let h = recordChange(createHistory<number>(), { state: 1, label: "a" });
    h = undoStep(h, 2)!.history;
    expect(nextRedoLabel(h)).toBe("a");
    h = recordChange(h, { state: 1, label: "c" });
    expect(nextRedoLabel(h)).toBeNull();
  });

  it("forgets the oldest steps beyond the limit", () => {
    let h = createHistory<number>();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      h = recordChange(h, { state: i, label: `step ${i}` });
    }
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]?.state).toBe(5);
    expect(nextUndoLabel(h)).toBe(`step ${HISTORY_LIMIT + 4}`);
  });

  it("does not change the history it was given", () => {
    const h = recordChange(createHistory<number>(), { state: 1, label: "a" });
    undoStep(h, 2);
    expect(h.past).toHaveLength(1);
    expect(h.future).toHaveLength(0);
  });
});
