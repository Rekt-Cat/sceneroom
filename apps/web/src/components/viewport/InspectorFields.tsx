"use client";

import { useState } from "react";
import {
  IDENTITY_TRANSFORM,
  displayValue,
  editTransform,
  formatNumber,
  normalizeHexColor,
  type Axis,
  type SceneNode,
  type TransformGroup,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";
import NumberField from "./NumberField";

/** The three rows of the Transform section. `step` is one arrow-key press, in the unit shown. */
const ROWS: {
  group: TransformGroup;
  label: string;
  decimals: number;
  step: number;
  /** How much dragging an axis letter changes the value per pixel of mouse movement. */
  perPixel: number;
}[] = [
  {
    group: "position",
    label: "Position",
    decimals: 2,
    step: 0.1,
    perPixel: 0.02,
  },
  { group: "rotation", label: "Rotation", decimals: 1, step: 5, perPixel: 0.5 },
  { group: "scale", label: "Scale", decimals: 2, step: 0.1, perPixel: 0.01 },
];

const AXES: { axis: "X" | "Y" | "Z"; index: Axis }[] = [
  { axis: "X", index: 0 },
  { axis: "Y", index: 1 },
  { axis: "Z", index: 2 },
];

/** Colours offered as one-click choices under the colour box. */
const QUICK_COLORS: { name: string; hex: string }[] = [
  { name: "Sky", hex: "#5cc4e0" },
  { name: "Rose", hex: "#e07a8a" },
  { name: "Sun", hex: "#e9c15a" },
  { name: "Mint", hex: "#62d394" },
  { name: "Violet", hex: "#9a8cff" },
  { name: "Stone", hex: "#aab6c4" },
  { name: "Chalk", hex: "#f2f4f6" },
];

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";

export function TransformSection({ node }: { node: SceneNode }) {
  const setNodeTransform = useSceneStore((state) => state.setNodeTransform);
  const beginEdit = useSceneStore((state) => state.beginEdit);
  const previewNodeTransform = useSceneStore(
    (state) => state.previewNodeTransform,
  );
  const endEdit = useSceneStore((state) => state.endEdit);

  function commit(group: TransformGroup, axis: Axis, text: string): boolean {
    const next = editTransform(node.transform, group, axis, text);
    if (!next) return false;
    setNodeTransform(node.id, next);
    return true;
  }

  return (
    <section aria-label="Transform">
      <div className="flex items-center justify-between pr-3">
        <h3 className={sectionTitle}>Transform</h3>
        <button
          type="button"
          aria-label="Reset position, rotation and scale"
          title="Reset position, rotation and scale"
          onClick={() => setNodeTransform(node.id, IDENTITY_TRANSFORM)}
          className="grid size-[26px] place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
        >
          <Icon name="reset" />
        </button>
      </div>
      <div className="space-y-2 px-4 pb-3">
        {ROWS.map(({ group, label, decimals, step, perPixel }) => (
          <div
            key={group}
            className="grid grid-cols-[58px_1fr] items-center gap-2"
          >
            <span className="text-xs text-ed-text-2">{label}</span>
            <div className="grid grid-cols-3 gap-1.5">
              {AXES.map(({ axis, index }) => (
                <NumberField
                  key={axis}
                  axis={axis}
                  label={`${label} ${axis}`}
                  value={displayValue(node.transform, group, index)}
                  decimals={decimals}
                  step={step}
                  scrub={{
                    perPixel,
                    onStart: () => beginEdit("Transform"),
                    onMove: (value) => {
                      const next = editTransform(
                        node.transform,
                        group,
                        index,
                        formatNumber(value, decimals),
                      );
                      if (next) previewNodeTransform(node.id, next);
                    },
                    onEnd: (cancelled) => endEdit(!cancelled),
                  }}
                  onCommit={(text) => commit(group, index, text)}
                />
              ))}
            </div>
          </div>
        ))}
        <p className="pt-0.5 text-[11px] text-ed-text-3">
          Rotation is in degrees. Arrow keys nudge a value; hold Shift for
          bigger steps.
        </p>
      </div>
    </section>
  );
}

export function AppearanceSection({ node }: { node: SceneNode }) {
  const setNodeColor = useSceneStore((state) => state.setNodeColor);
  const [draft, setDraft] = useState<string | null>(null);

  const invalid = draft !== null && normalizeHexColor(draft) === null;

  function finish() {
    if (draft !== null && !invalid) setNodeColor(node.id, draft);
    setDraft(null);
  }

  return (
    <section aria-label="Appearance" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Appearance</h3>
      <div className="px-4 pb-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-[30px] shrink-0 rounded-lg border-2 border-ed-line-strong"
            style={{ backgroundColor: node.color }}
          />
          <input
            value={draft ?? node.color.toUpperCase()}
            aria-label="Colour, as a hex code"
            aria-invalid={invalid}
            spellCheck={false}
            maxLength={9}
            onFocus={(event) => {
              setDraft(node.color.toUpperCase());
              event.currentTarget.select();
            }}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(null);
                event.currentTarget.blur();
              }
            }}
            className={`h-[30px] min-w-0 flex-1 rounded-md border bg-ed-field px-2.5 font-mono text-xs font-medium outline-none ${
              invalid
                ? "border-[#e5545f] shadow-[0_0_0_3px_rgba(229,84,95,0.2)]"
                : "border-ed-line hover:border-ed-line-strong focus:border-ed-accent focus:shadow-[0_0_0_3px_rgba(86,103,232,0.28)]"
            }`}
          />
        </div>
        {invalid && (
          <p className="mb-2 text-[11px] text-ed-danger">
            Use a hex colour such as #5CC4E0.
          </p>
        )}
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Quick colours"
        >
          {QUICK_COLORS.map(({ name, hex }) => (
            <button
              key={hex}
              type="button"
              aria-label={name}
              aria-pressed={node.color === hex}
              title={name}
              onClick={() => setNodeColor(node.id, hex)}
              style={{ backgroundColor: hex }}
              className={`size-6 rounded-full border-2 border-ed-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent ${
                node.color === hex
                  ? "shadow-[0_0_0_2px_var(--color-ed-text)]"
                  : "shadow-[0_0_0_1px_var(--color-ed-line-strong)]"
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
