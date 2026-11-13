"use client";

import { useRef, useState } from "react";
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
  onCommit: (text: string) => boolean;
}) {
  // null = not editing: show the value from the scene
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const invalid = draft !== null && parseNumberInput(draft) === null;

  function finish() {
    if (!cancelled.current && draft !== null && !invalid) onCommit(draft);
    cancelled.current = false;
    setDraft(null);
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
        className={`w-5 shrink-0 text-center text-[11px] font-semibold ${AXIS_COLOR[axis]}`}
      >
        {axis}
      </span>
      <input
        value={draft ?? formatNumber(value, decimals)}
        aria-label={label}
        aria-invalid={invalid}
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
        className="h-full min-w-0 flex-1 bg-transparent pr-2 text-right font-mono text-xs font-medium outline-none"
      />
    </div>
  );
}
