import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PEEK_SHOW_DELAY_MS } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useViewStore } from "@/store/viewStore";
import { createPeekKeys, type KeyLike } from "./usePeekKeys";

let clock = 0;
let prevented = 0;
const key = (code: string, extra: Partial<KeyLike> = {}): KeyLike => ({
  code,
  preventDefault: () => {
    prevented++;
  },
  ...extra,
});

function setup() {
  return createPeekKeys({
    now: () => clock,
    setTimer: (run, ms) => setTimeout(run, ms),
    clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
  prevented = 0;
  useSceneStore.setState(useSceneStore.getInitialState(), true);
  useViewStore.setState(useViewStore.getInitialState(), true);
  useSceneStore.getState().select("initial-cube");
});

afterEach(() => {
  vi.useRealTimers();
});

/** Holds Space for `ms` and lets go (the clock and the timers move together). */
function hold(keys: ReturnType<typeof setup>, ms: number) {
  keys.keyDown(key("Space"));
  clock += ms;
  vi.advanceTimersByTime(ms);
}

describe("the Space key of the four views", () => {
  it("a quick tap does nothing: no views appear and the big view does not change", () => {
    const keys = setup();
    hold(keys, PEEK_SHOW_DELAY_MS - 50);
    expect(useViewStore.getState().peekActive).toBe(false);
    keys.keyUp(key("Space"));
    expect(useViewStore.getState().peekActive).toBe(false);
    expect(useViewStore.getState().bigView).toBe("perspective");
  });

  it("holding shows the four views, and letting go over a tile opens it big", () => {
    const keys = setup();
    hold(keys, PEEK_SHOW_DELAY_MS + 10);
    expect(useViewStore.getState().peekActive).toBe(true);
    useViewStore.getState().setPeekHover(1); // the pointer is over the top right tile: Front
    keys.keyUp(key("Space"));
    expect(useViewStore.getState().peekActive).toBe(false);
    expect(useViewStore.getState().bigView).toBe("front");
    // the next time, the bottom left tile (Right)
    hold(keys, 300);
    useViewStore.getState().setPeekHover(2);
    keys.keyUp(key("Space"));
    expect(useViewStore.getState().bigView).toBe("right");
  });

  it("opens whatever the tile shows now, also after its drop-down was changed", () => {
    const keys = setup();
    hold(keys, 300);
    useViewStore.getState().setPeekTile(2, "left");
    useViewStore.getState().setPeekHover(2);
    keys.keyUp(key("Space"));
    expect(useViewStore.getState().bigView).toBe("left");
  });

  it("the normal view tile opens the normal view, which is the way back", () => {
    useViewStore.getState().setBigView("top");
    const keys = setup();
    hold(keys, 300);
    useViewStore.getState().setPeekHover(3);
    keys.keyUp(key("Space"));
    expect(useViewStore.getState().bigView).toBe("perspective");
  });

  it("letting go with the pointer over no tile changes nothing", () => {
    const keys = setup();
    hold(keys, 300);
    useViewStore.getState().setPeekHover(-1);
    keys.keyUp(key("Space"));
    expect(useViewStore.getState().bigView).toBe("perspective");
    expect(useViewStore.getState().peekActive).toBe(false);
  });

  it("does nothing with nothing selected, and does not take the key", () => {
    useSceneStore.getState().select(null);
    const keys = setup();
    hold(keys, 300);
    expect(useViewStore.getState().peekActive).toBe(false);
    expect(prevented).toBe(0);
  });

  it("takes the key from the page when it is used (no scrolling, no pressing a focused button)", () => {
    const keys = setup();
    keys.keyDown(key("Space"));
    expect(prevented).toBe(1);
    clock += 300;
    vi.advanceTimersByTime(300);
    keys.keyUp(key("Space"));
    expect(prevented).toBe(2);
  });

  it("ignores Space with Ctrl, Cmd or Alt, key repeats, and other keys", () => {
    const keys = setup();
    keys.keyDown(key("Space", { ctrlKey: true }));
    keys.keyDown(key("Space", { metaKey: true }));
    keys.keyDown(key("Space", { altKey: true }));
    keys.keyDown(key("KeyA"));
    vi.advanceTimersByTime(500);
    expect(useViewStore.getState().peekActive).toBe(false);
    // a repeat while held does not restart anything
    keys.keyDown(key("Space"));
    keys.keyDown(key("Space", { repeat: true }));
    clock += 300;
    vi.advanceTimersByTime(300);
    expect(useViewStore.getState().peekActive).toBe(true);
  });

  it("Escape while holding cancels, and letting go after that does nothing", () => {
    const keys = setup();
    hold(keys, 300);
    expect(useViewStore.getState().peekActive).toBe(true);
    keys.keyDown(key("Escape"));
    expect(useViewStore.getState().peekActive).toBe(false);
    useViewStore.getState().setPeekHover(1);
    keys.keyUp(key("Space"));
    expect(useViewStore.getState().bigView).toBe("perspective");
  });

  it("losing the window while holding cancels too", () => {
    const keys = setup();
    hold(keys, 300);
    keys.cancel();
    expect(useViewStore.getState().peekActive).toBe(false);
  });

  it("never takes Space from a text box, a number box or a drop-down", () => {
    const keys = setup();
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      keys.keyDown(
        key("Space", { target: { tagName } as unknown as EventTarget }),
      );
    }
    keys.keyDown(
      key("Space", {
        target: {
          tagName: "DIV",
          isContentEditable: true,
        } as unknown as EventTarget,
      }),
    );
    vi.advanceTimersByTime(500);
    expect(useViewStore.getState().peekActive).toBe(false);
    expect(prevented).toBe(0);
    // but a button or the 3D view is fine
    keys.keyDown(
      key("Space", { target: { tagName: "BUTTON" } as unknown as EventTarget }),
    );
    expect(prevented).toBe(1);
  });
});
