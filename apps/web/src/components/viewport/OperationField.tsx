"use client";

import { Icon } from "./icons";

const RESET =
  "grid size-6 shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-field hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

/** One setting of an edit operation (Extrude, Loop cut): a slider and a number box that stay together, and a reset button back to the starting value. */
export default function OperationField({
  label,
  hint,
  value,
  min,
  max,
  step,
  unit,
  defaultValue,
  show,
  onPreview,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  defaultValue: number;
  /** The number as shown in the box (for example 0.5 shown as 50 percent). */
  show?: (value: number) => number;
  /** The value is changing (a slider being dragged): show it, do not store it. */
  onPreview: (value: number) => void;
  /** The value is final: store it. A typed number or a reset is final at once, with its value. */
  onCommit: (value?: number) => void;
}) {
  const shown = show ?? ((v: number) => v);
  // Small steps (a bevel on a fine mesh) need more digits, or the box would show 0
  const decimals = Math.min(5, Math.max(2, Math.ceil(-Math.log10(step)) + 1));
  return (
    <label
      className="grid grid-cols-[4.5rem_1fr_4.25rem_auto] items-center gap-2"
      title={hint}
    >
      <span className="text-ed-text-2">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onPreview(Number(event.target.value))}
        // Let go of the slider (mouse, finger or arrow key), or leave it: the value is final
        onPointerUp={() => onCommit()}
        onKeyUp={() => onCommit()}
        onBlur={() => onCommit()}
        className="accent-ed-accent"
      />
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number(shown(value).toFixed(decimals))}
          aria-label={`${label} value`}
          onChange={(event) => {
            const typed = Number(event.target.value);
            if (Number.isFinite(typed)) {
              onPreview(show ? typed / (shown(1) / 1) : typed);
            }
          }}
          onBlur={() => onCommit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCommit();
          }}
          className="h-6 w-14 rounded border border-ed-line-strong bg-ed-field px-1.5 text-right font-mono"
        />
        {unit && <span className="text-ed-text-3">{unit}</span>}
      </span>
      <button
        type="button"
        title={`Reset ${label.toLowerCase()}`}
        aria-label={`Reset ${label.toLowerCase()}`}
        disabled={Math.abs(value - defaultValue) < 1e-9}
        onClick={() => onCommit(defaultValue)}
        className={RESET}
      >
        <Icon name="reset" />
      </button>
    </label>
  );
}
