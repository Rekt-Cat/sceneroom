"use client";

import {
  MAX_ARRAY_COUNT,
  MAX_ARRAY_SPACING,
  MAX_MIRROR_OFFSET,
  MAX_MODIFIERS,
  MAX_SEGMENTS,
  MAX_STRETCH,
  MODIFIER_AXES,
  MODIFIER_INFO,
  MIN_ARRAY_COUNT,
  MIN_STRETCH,
  MODIFIER_TYPES,
  createModifier,
  describeModifier,
  usesAxis,
  type Modifier,
  type ModifierAxis,
  type ModifierChange,
  type ModifierType,
  type SceneNode,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";
import { ValueSlider } from "./InspectorFields";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";

const SMALL_BUTTON =
  "grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

/**
 * The colours of the three directions, the same as the axis handles of the move gizmo in the 3D view
 * (red X, green Y, blue Z). Written out in full so Tailwind can find the class names.
 */
const AXIS_STYLE: Record<ModifierAxis, { text: string; active: string }> = {
  x: { text: "text-ed-x", active: "bg-ed-x/25 text-ed-x" },
  y: { text: "text-ed-y", active: "bg-ed-y/25 text-ed-y" },
  z: { text: "text-ed-z", active: "bg-ed-z/25 text-ed-z" },
};

/** One slider of a modifier card. The range must match what `sanitizeModifierChange` allows. */
type SliderSpec = {
  key:
    | "offset"
    | "angle"
    | "amount"
    | "factor"
    | "strength"
    | "scale"
    | "seed"
    | "count"
    | "spacing";
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
};

/** The sliders each kind of modifier shows (the axis choice and any switch are added separately). */
const SLIDERS: Record<ModifierType, readonly SliderSpec[]> = {
  bend: [
    { key: "angle", label: "Angle", min: -360, max: 360, step: 1, decimals: 0 },
  ],
  twist: [
    { key: "angle", label: "Angle", min: -720, max: 720, step: 1, decimals: 0 },
  ],
  taper: [
    {
      key: "amount",
      label: "Amount",
      min: -1,
      max: 1,
      step: 0.01,
      decimals: 2,
    },
  ],
  stretch: [
    {
      key: "factor",
      label: "Factor",
      min: MIN_STRETCH,
      max: MAX_STRETCH,
      step: 0.01,
      decimals: 2,
    },
  ],
  noise: [
    {
      key: "strength",
      label: "Strength",
      min: 0,
      max: 1,
      step: 0.01,
      decimals: 2,
    },
    { key: "scale", label: "Scale", min: 0.1, max: 10, step: 0.1, decimals: 1 },
    { key: "seed", label: "Seed", min: 0, max: 9999, step: 1, decimals: 0 },
  ],
  mirror: [
    {
      key: "offset",
      label: "Offset",
      min: -MAX_MIRROR_OFFSET,
      max: MAX_MIRROR_OFFSET,
      step: 0.01,
      decimals: 2,
    },
  ],
  array: [
    {
      key: "count",
      label: "Count",
      min: MIN_ARRAY_COUNT,
      max: MAX_ARRAY_COUNT,
      step: 1,
      decimals: 0,
    },
    {
      key: "spacing",
      label: "Spacing",
      min: 0,
      max: MAX_ARRAY_SPACING,
      step: 0.01,
      decimals: 2,
    },
  ],
};

/**
 * The "Shape" section of the Inspector, for the built-in shapes: how finely the shape is cut up, and a
 * list of modifiers (bend, twist, taper, stretch, noise, mirror, array) that change its form without touching the shape itself. They
 * work from the top of the list down, so the order matters. Every value has its own reset button.
 */
export default function ModifiersSection({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const addModifier = useSceneStore((state) => state.addModifier);
  const setNodeSegments = useSceneStore((state) => state.setNodeSegments);
  const previewNodeSegments = useSceneStore(
    (state) => state.previewNodeSegments,
  );
  const full = node.modifiers.length >= MAX_MODIFIERS;

  return (
    <section aria-label="Shape" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Shape</h3>
      <div className="space-y-2.5 px-4 pb-4">
        <ValueSlider
          label="Segments"
          value={node.segments}
          defaultValue={1}
          min={1}
          max={MAX_SEGMENTS}
          step={1}
          decimals={0}
          disabled={disabled}
          editLabel="Segments"
          onCommit={(value) => setNodeSegments(node.id, value)}
          onPreview={(value) => previewNodeSegments(node.id, value)}
        />
        <p className="text-[11px] leading-relaxed text-ed-text-3">
          More segments let a bend or twist curve smoothly. A sphere is always
          finely cut.
        </p>

        {node.modifiers.map((modifier, index) => (
          <ModifierCard
            key={modifier.id}
            nodeId={node.id}
            modifier={modifier}
            first={index === 0}
            last={index === node.modifiers.length - 1}
            disabled={disabled}
          />
        ))}

        <div
          role="group"
          aria-label="Add a modifier"
          className="flex flex-wrap gap-1.5 pt-1"
        >
          {MODIFIER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              disabled={disabled || full}
              title={
                full
                  ? `At most ${MAX_MODIFIERS} modifiers`
                  : MODIFIER_INFO[type].hint
              }
              onClick={() => addModifier(node.id, type)}
              className="flex h-7 items-center gap-1 rounded-md border border-ed-line-strong bg-ed-raised px-2.5 text-xs font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon name="plus" className="size-3" />
              {MODIFIER_INFO[type].label}
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-ed-text-3">
          Each modifier works along one axis. To deform a second way, add
          another or duplicate one and pick a different axis.
        </p>
      </div>
    </section>
  );
}

function ModifierCard({
  nodeId,
  modifier,
  first,
  last,
  disabled,
}: {
  nodeId: string;
  modifier: Modifier;
  first: boolean;
  last: boolean;
  disabled: boolean;
}) {
  const setModifier = useSceneStore((state) => state.setModifier);
  const previewModifier = useSceneStore((state) => state.previewModifier);
  const removeModifier = useSceneStore((state) => state.removeModifier);
  const moveModifier = useSceneStore((state) => state.moveModifier);
  const duplicateModifier = useSceneStore((state) => state.duplicateModifier);

  const info = MODIFIER_INFO[modifier.type];
  const defaults = createModifier(modifier.id, modifier.type);
  const read = (m: Modifier, key: SliderSpec["key"]) =>
    (m as unknown as Record<string, number>)[key]!;
  const change = (c: ModifierChange) => setModifier(nodeId, modifier.id, c);

  return (
    <div
      className={`rounded-lg border border-ed-line bg-ed-field p-2.5 ${
        modifier.enabled ? "" : "opacity-60"
      }`}
    >
      <div className="mb-2 flex items-center gap-1">
        <label
          title={`Switch ${info.label.toLowerCase()} on or off`}
          className="flex flex-1 cursor-pointer items-center gap-2 text-sm font-medium has-[:disabled]:cursor-not-allowed"
        >
          <input
            type="checkbox"
            checked={modifier.enabled}
            disabled={disabled}
            onChange={(event) => change({ enabled: event.target.checked })}
            className="size-4 cursor-pointer accent-ed-accent"
          />
          {info.label}
          {usesAxis(modifier.type) && (
            <span
              className={`font-mono text-xs uppercase ${AXIS_STYLE[modifier.axis].text}`}
            >
              · {modifier.axis}
            </span>
          )}
        </label>
        <button
          type="button"
          title="Duplicate: a copy right after this one, for another axis"
          aria-label={`Duplicate ${info.label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => duplicateModifier(nodeId, modifier.id)}
          className={SMALL_BUTTON}
        >
          <Icon name="copy" />
        </button>
        <button
          type="button"
          title="Move up (applied earlier)"
          aria-label={`Move ${info.label.toLowerCase()} up`}
          disabled={disabled || first}
          onClick={() => moveModifier(nodeId, modifier.id, "up")}
          className={SMALL_BUTTON}
        >
          <Icon name="chevronDown" className="size-3 rotate-180" />
        </button>
        <button
          type="button"
          title="Move down (applied later)"
          aria-label={`Move ${info.label.toLowerCase()} down`}
          disabled={disabled || last}
          onClick={() => moveModifier(nodeId, modifier.id, "down")}
          className={SMALL_BUTTON}
        >
          <Icon name="chevronDown" className="size-3" />
        </button>
        <button
          type="button"
          title="Remove"
          aria-label={`Remove ${info.label.toLowerCase()}`}
          disabled={disabled}
          onClick={() => removeModifier(nodeId, modifier.id)}
          className={SMALL_BUTTON}
        >
          <Icon name="trash" />
        </button>
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-ed-text-3">
        {describeModifier(modifier)}
      </p>

      <div className="space-y-2.5">
        {usesAxis(modifier.type) && (
          <AxisChoice
            axis={modifier.axis}
            defaultAxis={defaults.axis}
            disabled={disabled}
            onChange={(axis) => change({ axis })}
          />
        )}
        {SLIDERS[modifier.type].map((spec) => (
          <ValueSlider
            key={spec.key}
            label={spec.label}
            value={read(modifier, spec.key)}
            defaultValue={read(defaults, spec.key)}
            min={spec.min}
            max={spec.max}
            step={spec.step}
            decimals={spec.decimals}
            disabled={disabled}
            editLabel={info.label}
            onCommit={(value) => change({ [spec.key]: value })}
            onPreview={(value) =>
              previewModifier(nodeId, modifier.id, { [spec.key]: value })
            }
          />
        ))}
        {modifier.type === "stretch" && (
          <label
            title="Longer means thinner and shorter means fatter, so the volume stays about the same"
            className="flex cursor-pointer items-center gap-2 text-xs text-ed-text-2 has-[:disabled]:cursor-not-allowed"
          >
            <input
              type="checkbox"
              checked={modifier.keepVolume}
              disabled={disabled}
              onChange={(event) => change({ keepVolume: event.target.checked })}
              className="size-4 cursor-pointer accent-ed-accent disabled:cursor-not-allowed"
            />
            Keep volume
          </label>
        )}
      </div>
    </div>
  );
}

/** Which direction of the object the modifier works along. */
function AxisChoice({
  axis,
  defaultAxis,
  disabled,
  onChange,
}: {
  axis: ModifierAxis;
  defaultAxis: ModifierAxis;
  disabled: boolean;
  onChange: (axis: ModifierAxis) => void;
}) {
  return (
    <div className="grid grid-cols-[58px_1fr_26px] items-center gap-2">
      <span className="text-xs text-ed-text-2">Along</span>
      <div
        role="radiogroup"
        aria-label="Axis (red X, green Y, blue Z, as on the move handles)"
        className="flex gap-1 rounded-lg bg-ed-panel p-1"
      >
        {MODIFIER_AXES.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={axis === value}
            disabled={disabled}
            onClick={() => onChange(value)}
            className={`h-6 flex-1 rounded-md text-xs font-semibold uppercase focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed ${
              axis === value
                ? AXIS_STYLE[value].active
                : `${AXIS_STYLE[value].text} opacity-60 hover:opacity-100`
            }`}
          >
            {value}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={`Reset axis to ${defaultAxis.toUpperCase()}`}
        title={`Reset to ${defaultAxis.toUpperCase()}`}
        disabled={disabled || axis === defaultAxis}
        onClick={() => onChange(defaultAxis)}
        className={SMALL_BUTTON}
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}
