"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DEFAULT_COLOR,
  DEFAULT_MATERIAL,
  buildSceneTree,
  canReparent,
  flattenTree,
  modelSize,
  displayValue,
  editScaleProportionally,
  editTransform,
  formatNumber,
  normalizeHexColor,
  parseNumberInput,
  resetTransformGroup,
  transformsEqual,
  type Axis,
  type SceneNode,
  type TransformGroup,
} from "@sceneroom/shared";
import { useLayoutStore } from "@/store/layoutStore";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";
import { moveToParent } from "./reparent";
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

/**
 * Chooses which object this one sits inside. The object keeps its place in the 3D view when moved.
 * Options that would make a loop (the object itself and everything inside it) are shown greyed out.
 */
export function ParentSection({
  node,
  disabled = false,
}: {
  node: SceneNode;
  disabled?: boolean;
}) {
  const scene = useSceneStore((state) => state.scene);
  const expandNode = useLayoutStore((state) => state.expandNode);

  const options = flattenTree(buildSceneTree(scene), new Set());

  return (
    <section aria-label="Parent" className="border-b border-ed-line px-4 py-3">
      <label className="grid grid-cols-[58px_1fr] items-center gap-2">
        <span className="text-xs text-ed-text-2">Parent</span>
        <select
          value={node.parentId ?? ""}
          disabled={disabled}
          onChange={(event) => {
            const parentId = event.target.value || null;
            if (moveToParent([node.id], parentId) && parentId) {
              expandNode(parentId);
            }
          }}
          className="h-[30px] min-w-0 rounded-md border border-ed-line bg-ed-field px-2 text-sm hover:border-ed-line-strong focus-visible:border-ed-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ed-text-3"
        >
          <option value="">None (top level)</option>
          {options.map(({ node: option, depth }) => (
            <option
              key={option.id}
              value={option.id}
              disabled={!canReparent(scene, node.id, option.id)}
            >
              {"\u00A0\u00A0".repeat(depth)}
              {option.name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}

export function TransformSection({
  node,
  disabled = false,
}: {
  node: SceneNode;
  disabled?: boolean;
}) {
  const setNodeTransform = useSceneStore((state) => state.setNodeTransform);
  const beginEdit = useSceneStore((state) => state.beginEdit);
  const previewNodeTransform = useSceneStore(
    (state) => state.previewNodeTransform,
  );
  const endEdit = useSceneStore((state) => state.endEdit);

  const scaleLinked = useLayoutStore((state) => state.scaleLinked);
  const toggleScaleLinked = useLayoutStore((state) => state.toggleScaleLinked);

  /** The transform after typing `text` in one box. With linked scale, the other two scale values follow. */
  function edited(group: TransformGroup, axis: Axis, text: string) {
    return group === "scale" && scaleLinked
      ? editScaleProportionally(node.transform, axis, text)
      : editTransform(node.transform, group, axis, text);
  }

  function commit(group: TransformGroup, axis: Axis, text: string): boolean {
    const next = edited(group, axis, text);
    if (!next) return false;
    setNodeTransform(node.id, next);
    return true;
  }

  return (
    <section aria-label="Transform">
      <h3 className={sectionTitle}>Transform</h3>
      <div className="space-y-2 px-4 pb-3">
        {ROWS.map(({ group, label, decimals, step, perPixel }) => (
          <div
            key={group}
            className="grid grid-cols-[76px_1fr] items-center gap-2"
          >
            <span className="flex items-center gap-0.5 text-xs text-ed-text-2">
              {label}
              <button
                type="button"
                aria-label={`Reset ${label.toLowerCase()}`}
                title={`Reset ${label.toLowerCase()}`}
                disabled={
                  disabled ||
                  transformsEqual(
                    node.transform,
                    resetTransformGroup(node.transform, group),
                  )
                }
                onClick={() =>
                  setNodeTransform(
                    node.id,
                    resetTransformGroup(node.transform, group),
                  )
                }
                className="grid size-[18px] place-items-center rounded text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Icon name="reset" className="size-3" />
              </button>
              {group === "scale" && (
                <button
                  type="button"
                  aria-pressed={scaleLinked}
                  aria-label={
                    scaleLinked
                      ? "Scale linked: changing one value scales all three. Click to unlink."
                      : "Scale unlinked: each value changes on its own. Click to link."
                  }
                  title={
                    scaleLinked
                      ? "Linked: X, Y and Z scale together. Click to change one at a time."
                      : "Unlinked: only the value you change moves. Click to link them."
                  }
                  onClick={toggleScaleLinked}
                  className={`grid size-[18px] place-items-center rounded hover:bg-ed-raised focus-visible:outline-2 focus-visible:outline-ed-accent ${
                    scaleLinked
                      ? "text-ed-accent hover:text-ed-text"
                      : "text-ed-text-3 hover:text-ed-text"
                  }`}
                >
                  <Icon
                    name={scaleLinked ? "link" : "unlink"}
                    className="size-3"
                  />
                </button>
              )}
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {AXES.map(({ axis, index }) => (
                <NumberField
                  key={axis}
                  axis={axis}
                  label={`${label} ${axis}`}
                  value={displayValue(node.transform, group, index)}
                  decimals={decimals}
                  step={step}
                  disabled={disabled}
                  scrub={{
                    perPixel,
                    onStart: () => beginEdit("Transform"),
                    onMove: (value) => {
                      const next = edited(
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

export function AppearanceSection({
  node,
  disabled = false,
}: {
  node: SceneNode;
  disabled?: boolean;
}) {
  const setNodeColor = useSceneStore((state) => state.setNodeColor);
  const [draft, setDraft] = useState<string | null>(null);

  const invalid = draft !== null && normalizeHexColor(draft) === null;

  // The colour picker sends a stream of changes while you drag inside it. They change the object
  // live but must be ONE undo step: start an edit on the first change, end it when the picker closes.
  const pickerRef = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  const beginEdit = useSceneStore((state) => state.beginEdit);
  const previewNodeColor = useSceneStore((state) => state.previewNodeColor);

  function onPick(color: string) {
    if (!picking.current) {
      picking.current = true;
      beginEdit("Change colour");
    }
    previewNodeColor(node.id, color);
  }

  useEffect(() => {
    const picker = pickerRef.current;
    function finishPicking() {
      if (!picking.current) return;
      picking.current = false;
      useSceneStore.getState().endEdit(true);
    }
    // The browser's own "change" event fires when the picker is closed or the choice is confirmed
    picker?.addEventListener("change", finishPicking);
    picker?.addEventListener("blur", finishPicking);
    return () => {
      picker?.removeEventListener("change", finishPicking);
      picker?.removeEventListener("blur", finishPicking);
      finishPicking(); // the panel went away (another object selected) in the middle of picking
    };
  }, []);

  function finish() {
    if (draft !== null && !invalid) setNodeColor(node.id, draft);
    setDraft(null);
  }

  return (
    <section aria-label="Appearance" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Appearance</h3>
      <div className="px-4 pb-4">
        <div className="mb-2.5 flex items-center gap-2.5">
          <input
            ref={pickerRef}
            type="color"
            value={node.color}
            disabled={disabled}
            aria-label="Pick a colour"
            title="Pick a colour"
            onChange={(event) => onPick(event.target.value)}
            className="size-[30px] shrink-0 cursor-pointer appearance-none rounded-lg border-2 border-ed-line-strong bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-color-swatch]:rounded-md [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
          <input
            value={draft ?? node.color.toUpperCase()}
            aria-label="Colour, as a hex code"
            aria-invalid={invalid}
            disabled={disabled}
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
                : "border-ed-line hover:border-ed-line-strong focus:border-ed-accent focus:shadow-[0_0_0_3px_rgba(86,103,232,0.28)] disabled:cursor-not-allowed disabled:text-ed-text-3"
            }`}
          />
          <button
            type="button"
            aria-label={`Reset colour to ${DEFAULT_COLOR.toUpperCase()}`}
            title={`Reset to ${DEFAULT_COLOR.toUpperCase()}`}
            disabled={disabled || node.color === DEFAULT_COLOR}
            onClick={() => setNodeColor(node.id, DEFAULT_COLOR)}
            className="grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Icon name="reset" />
          </button>
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
              disabled={disabled}
              title={name}
              onClick={() => setNodeColor(node.id, hex)}
              style={{ backgroundColor: hex }}
              className={`size-6 rounded-full border-2 border-ed-panel disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent ${
                node.color === hex
                  ? "shadow-[0_0_0_2px_var(--color-ed-text)]"
                  : "shadow-[0_0_0_1px_var(--color-ed-line-strong)]"
              }`}
            />
          ))}
        </div>
        <div className="mt-3.5 space-y-2.5">
          <MaterialSlider
            node={node}
            property="roughness"
            label="Roughness"
            disabled={disabled}
          />
          <MaterialSlider
            node={node}
            property="metalness"
            label="Metalness"
            disabled={disabled}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * A slider with a number box and a reset button, for a value from 0 up to `max`. Dragging the slider
 * changes the object live (`onPreview`) but is ONE undo step; typing a number or using the arrow keys
 * is one step per change (`onCommit`). `editLabel` names that undo step.
 */
export function ValueSlider({
  label,
  value,
  defaultValue,
  max = 1,
  step = 0.01,
  decimals = 2,
  disabled,
  editLabel,
  onCommit,
  onPreview,
}: {
  label: string;
  value: number;
  defaultValue: number;
  /** The largest value (the smallest is 0). */
  max?: number;
  step?: number;
  /** How many decimals the number box shows. */
  decimals?: number;
  disabled: boolean;
  editLabel: string;
  onCommit: (value: number) => void;
  onPreview: (value: number) => void;
}) {
  const beginEdit = useSceneStore((state) => state.beginEdit);
  const endEdit = useSceneStore((state) => state.endEdit);
  const id = useId();
  const dragging = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);

  const parse = (text: string) => {
    const typed = parseNumberInput(text);
    return typed !== null && typed >= 0 && typed <= max ? typed : null;
  };
  const invalid = draft !== null && parse(draft) === null;
  const shown = (number: number) => number.toFixed(decimals);

  function onPointerDown() {
    if (disabled) return;
    dragging.current = true;
    beginEdit(editLabel);
    // The release can happen anywhere on the page, so listen on the window
    const stop = () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      dragging.current = false;
      endEdit(true);
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function onSliderChange(next: number) {
    if (dragging.current) onPreview(next);
    else onCommit(next);
  }

  function finishTyping() {
    const typed = draft === null ? null : parse(draft);
    if (typed !== null) onCommit(typed);
    setDraft(null);
  }

  return (
    <div className="grid grid-cols-[58px_1fr_48px_26px] items-center gap-2">
      <label htmlFor={id} className="text-xs text-ed-text-2">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={onPointerDown}
        onChange={(event) => onSliderChange(Number(event.target.value))}
        className="h-4 min-w-0 cursor-pointer accent-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
      />
      <input
        aria-label={`${label}, number from 0 to ${max}`}
        aria-invalid={invalid}
        value={draft ?? shown(value)}
        disabled={disabled}
        spellCheck={false}
        inputMode="decimal"
        onFocus={(event) => {
          setDraft(shown(value));
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finishTyping}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
        className={`h-[26px] min-w-0 rounded-md border bg-ed-field px-1.5 text-right font-mono text-xs font-medium outline-none disabled:cursor-not-allowed disabled:text-ed-text-3 ${
          invalid
            ? "border-[#e5545f]"
            : "border-ed-line hover:border-ed-line-strong focus:border-ed-accent"
        }`}
      />
      <button
        type="button"
        aria-label={`Reset ${label.toLowerCase()} to ${shown(defaultValue)}`}
        title={`Reset to ${shown(defaultValue)}`}
        disabled={disabled || value === defaultValue}
        onClick={() => onCommit(defaultValue)}
        className="grid size-[26px] place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}

/** A slider for one of the surface values of an object (roughness, metalness, opacity, glow strength). */
export function MaterialSlider({
  node,
  property,
  label,
  disabled,
  max = 1,
}: {
  node: SceneNode;
  property: "roughness" | "metalness" | "opacity" | "emissiveIntensity";
  label: string;
  disabled: boolean;
  max?: number;
}) {
  const setNodeMaterial = useSceneStore((state) => state.setNodeMaterial);
  const previewNodeMaterial = useSceneStore(
    (state) => state.previewNodeMaterial,
  );
  return (
    <ValueSlider
      label={label}
      value={node.material[property]}
      defaultValue={DEFAULT_MATERIAL[property]}
      max={max}
      disabled={disabled}
      editLabel="Material"
      onCommit={(value) => setNodeMaterial(node.id, { [property]: value })}
      onPreview={(value) => previewNodeMaterial(node.id, { [property]: value })}
    />
  );
}

/** Details of the imported file behind a "model" object. Models bring their own materials, so no colour or material controls. */
export function ModelSection({ node }: { node: SceneNode }) {
  const info = useSceneStore((state) =>
    node.assetId ? state.scene.assets[node.assetId] : undefined,
  );
  const [x, y, z] = info ? modelSize(info) : [0, 0, 0];

  return (
    <section aria-label="Imported model" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Imported model</h3>
      {info ? (
        <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1.5 px-4 pb-4 text-xs">
          <dt className="text-ed-text-3">File</dt>
          <dd className="truncate text-ed-text-2" title={info.name}>
            {info.name}
          </dd>
          <dt className="text-ed-text-3">Size on disk</dt>
          <dd className="text-ed-text-2">
            {(info.bytes / (1024 * 1024)).toFixed(2)} MB
          </dd>
          <dt className="text-ed-text-3">Triangles</dt>
          <dd className="text-ed-text-2">
            {info.triangles.toLocaleString("en-US")}
          </dd>
          <dt className="text-ed-text-3">Original size</dt>
          <dd className="font-mono text-ed-text-2">
            {x.toFixed(2)} × {y.toFixed(2)} × {z.toFixed(2)}
          </dd>
          <dd className="col-span-2 pt-1 text-ed-text-3">
            It was scaled to fit when imported. It keeps its own colours and
            materials. Use Scale above to change its size.
          </dd>
        </dl>
      ) : (
        <p className="px-4 pb-4 text-xs text-ed-danger">
          The details of the file behind this model are missing, so it cannot be
          shown.
        </p>
      )}
    </section>
  );
}
