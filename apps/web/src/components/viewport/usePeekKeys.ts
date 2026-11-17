import { useEffect } from "react";
import { PEEK_SHOW_DELAY_MS, peekOutcome } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { useViewStore } from "@/store/viewStore";
import { lastPointer } from "./peekPointer";

/** True when the key press is going into a text box or a drop-down (a space must be typed there, not used here). */
function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
  } | null;
  if (!element || typeof element.tagName !== "string") return false;
  return (
    element.isContentEditable === true ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)
  );
}

/** What the handlers need from the page, so they can be tested without one. */
export type PeekKeyDeps = {
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
};

/** The parts of a keyboard event the handlers read. */
export type KeyLike = {
  code: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
  preventDefault: () => void;
};

/**
 * The Space key of the four-view peek. With an object selected, holding Space for a moment shows the four
 * views; letting go opens the one under the pointer as the big view. A quick tap does nothing (and nothing
 * appears), so a stray tap is harmless. Escape while holding cancels. Space is only taken when something is
 * selected, and never from a text box or drop-down.
 */
export function createPeekKeys(deps: PeekKeyDeps) {
  let pressedAt: number | null = null;
  let timer: unknown = null;

  function cancel() {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    pressedAt = null;
    useViewStore.getState().setPeekActive(false);
  }

  function keyDown(event: KeyLike) {
    if (event.code === "Escape" && pressedAt !== null) {
      cancel();
      return;
    }
    if (
      event.code !== "Space" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }
    if (isTypingTarget(event.target ?? null)) return;
    if (useSceneStore.getState().selectedIds.length === 0) return;
    // Space would also press a focused button or scroll the page
    event.preventDefault();
    if (event.repeat || pressedAt !== null) return;
    pressedAt = deps.now();
    timer = deps.setTimer(() => {
      timer = null;
      if (pressedAt !== null) useViewStore.getState().setPeekActive(true);
    }, PEEK_SHOW_DELAY_MS);
  }

  function keyUp(event: KeyLike) {
    if (event.code !== "Space" || pressedAt === null) return;
    event.preventDefault();
    const held = deps.now() - pressedAt;
    const view = useViewStore.getState();
    const shown = view.peekActive;
    const tile = view.peekHover;
    const tiles = view.peekTiles;
    cancel();
    if (!shown) return; // a tap
    const opened = peekOutcome(held, tile);
    if (opened !== null) useViewStore.getState().setBigView(tiles[opened]!);
  }

  return { keyDown, keyUp, cancel };
}

/** Wires the Space key of the four-view peek to the page. */
export function usePeekKeys(): void {
  useEffect(() => {
    const keys = createPeekKeys({
      now: () => performance.now(),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (timer) =>
        clearTimeout(timer as ReturnType<typeof setTimeout>),
    });
    const onPointerMove = (event: PointerEvent) => {
      lastPointer.x = event.clientX;
      lastPointer.y = event.clientY;
    };
    window.addEventListener("keydown", keys.keyDown, true);
    window.addEventListener("keyup", keys.keyUp, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("blur", keys.cancel);
    return () => {
      window.removeEventListener("keydown", keys.keyDown, true);
      window.removeEventListener("keyup", keys.keyUp, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("blur", keys.cancel);
      keys.cancel();
    };
  }, []);
}
