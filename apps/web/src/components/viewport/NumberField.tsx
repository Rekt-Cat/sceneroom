"use client";

import { useRef, useState, type PointerEvent } from "react";
import { formatNumber, parseNumberInput } from "@sceneroom/shared";

/** Colour of the axis letter. Written out in full so Tailwind can find the class names. */
const AXIS_COLOR = {
  X: "text-ed-x",
  Y: "text-ed-y",
  Z: "text-ed-z",
} as const;

/**
 * One number box with its axis letter. Shows the value from the scene until you start typing;
 * Enter or clicking away saves it, Escape cancels. Text that is not a number turns the box red and
 * is dropped when you leave it. Up and Down arrows nudge the value (hold Shift for 10 times more).
 *
 * `onCommit` gets the typed text and returns true if the scene accepted it.
 */
export default function NumberField({
  axis,
  label,
  value,
  decimals,
  step,
  scrub,
  disabled = false,
  onCommit,
}: {
  axis: keyof typeof AXIS_COLOR;
  /** Name for screen readers, e.g. "Position X". */
  label: string;
  /** The value to show, in the unit of the field (degrees for rotation). */
  value: number;
  decimals: number;
  /** How much one arrow-key press changes the value. */
  step: number;
  /**
   * Dragging the axis letter left or right changes the value, like in Unity. `perPixel` is how much
   * the value changes for each pixel the mouse moves (Shift: 10 times more, Alt: 10 times less).
   * `onStart` and `onEnd` bracket the drag so it can become a single undo step.
   */
  scrub?: {
    perPixel: number;
    onStart: () => void;
    onMove: (value: number) => void;
    onEnd: (cancelled: boolean) => void;
  };
  /** Locked objects: the box shows the value but cannot be changed. */
  disabled?: boolean;
  onCommit: (text: string) => boolean;
}) {
  // null = not editing: show the value from the scene
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);
  const scrubbing = useRef<{
    lastX: number;
    value: number;
    stop: (cancelled: boolean) => void;
  } | null>(null);

  const invalid = draft !== null && parseNumberInput(draft) === null;

  function finish() {
    if (!cancelled.current && draft !== null && !invalid) onCommit(draft);
    cancelled.current = false;
    setDraft(null);
  }

  function onScrubStart(event: PointerEvent<HTMLSpanElement>) {
    if (!scrub || disabled || event.button !== 0) return;
    event.preventDefault(); // no text selection, no focus change
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture(pointerId);
    document.body.style.cursor = "ew-resize";
    scrub.onStart();

    function stop(wasCancelled: boolean) {
      if (!scrubbing.current) return;
      scrubbing.current = null;
      document.body.style.cursor = "";
      window.removeEventListener("keydown", onKey, true);
      if (handle.hasPointerCapture(pointerId)) {
        handle.releasePointerCapture(pointerId);
      }
      scrub?.onEnd(wasCancelled);
    }

    // Escape cancels the drag. Handled first, so it does not also clear the selection.
    function onKey(keyEvent: KeyboardEvent) {
      if (keyEvent.key !== "Escape") return;
      keyEvent.preventDefault();
      keyEvent.stopImmediatePropagation();
      stop(true);
    }
    window.addEventListener("keydown", onKey, true);

    scrubbing.current = { lastX: event.clientX, value, stop };
  }

  function onScrubMove(event: PointerEvent<HTMLSpanElement>) {
    const state = scrubbing.current;
    if (!state || !scrub) return;
    // Add up small steps, so pressing Shift or Alt in the middle of a drag does not make the value jump
    const speed = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
    state.value += (event.clientX - state.lastX) * scrub.perPixel * speed;
    state.lastX = event.clientX;
    scrub.onMove(Number(formatNumber(state.value, decimals)));
  }

  function onScrubEnd() {
    scrubbing.current?.stop(false);
  }

  return (
    <div
      className={`flex h-[30px] min-w-0 items-center rounded-md border bg-ed-field ${
        invalid
          ? "border-[#e5545f] shadow-[0_0_0_3px_rgba(229,84,95,0.2)]"
          : "border-ed-line focus-within:border-ed-accent focus-within:shadow-[0_0_0_3px_rgba(86,103,232,0.28)] hover:border-ed-line-strong"
      }`}
    >
      <span
        aria-hidden="true"
        title={
          scrub && !disabled
            ? "Drag left or right to change the value"
            : undefined
        }
        onPointerDown={onScrubStart}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubEnd}
        onPointerCancel={onScrubEnd}
        className={`w-5 shrink-0 touch-none self-stretch rounded-l-md pt-[6px] text-center text-[11px] leading-4 font-semibold select-none ${AXIS_COLOR[axis]} ${
          scrub && !disabled ? "cursor-ew-resize hover:bg-ed-raised" : ""
        }`}
      >
        {axis}
      </span>
      <input
        value={draft ?? formatNumber(value, decimals)}
        aria-label={label}
        aria-invalid={invalid}
        disabled={disabled}
        inputMode="decimal"
        spellCheck={false}
        onFocus={(event) => {
          setDraft(formatNumber(value, decimals));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          else if (event.key === "Escape") {
            cancelled.current = true;
            event.currentTarget.blur();
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const direction = event.key === "ArrowUp" ? 1 : -1;
            const amount = step * (event.shiftKey ? 10 : 1) * direction;
            const current = parseNumberInput(draft ?? "") ?? value;
            const next = formatNumber(current + amount, decimals);
            if (onCommit(next)) setDraft(next);
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent pr-2 text-right font-mono text-xs font-medium outline-none disabled:cursor-not-allowed disabled:text-ed-text-3"
      />
    </div>
  );
}
