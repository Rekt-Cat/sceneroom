"use client";

import { useEffect, useRef } from "react";
import {
  DEFAULT_MATERIAL,
  MAX_EMISSIVE_INTENSITY,
  MAX_REFLECTION_STRENGTH,
  type Material,
  type SceneNode,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";
import { MaterialSlider } from "./InspectorFields";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";

const RESET_BUTTON =
  "grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

type Flag = "doubleSided" | "flatShading" | "castShadow" | "receiveShadow";

const FLAGS: { key: Flag; label: string; hint: string }[] = [
  {
    key: "doubleSided",
    label: "Double-sided",
    hint: "Also draw the inside (back) of the surface. A plane needs it to be seen from behind.",
  },
  {
    key: "flatShading",
    label: "Flat shading",
    hint: "Show every flat face separately, like a cut gem, instead of one smooth curve.",
  },
  {
    key: "castShadow",
    label: "Cast shadow",
    hint: "The object throws a shadow.",
  },
  {
    key: "receiveShadow",
    label: "Receive shadow",
    hint: "Shadows from other objects fall on it.",
  },
];

/**
 * The "Surface" section of the Inspector: glow, see-through, which side is drawn, flat or smooth
 * shading, and the shadow switches. Every value has its own reset button. A model brings its own
 * materials, so for a model only the shadow switches are shown.
 */
export default function SurfaceSection({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const isModel = node.kind === "model";
  const flags = isModel
    ? FLAGS.filter(({ key }) => key === "castShadow" || key === "receiveShadow")
    : FLAGS;

  return (
    <section aria-label="Surface" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Surface</h3>
      <div className="space-y-2.5 px-4 pb-4">
        {!isModel && (
          <>
            <GlowColor node={node} disabled={disabled} />
            <MaterialSlider
              node={node}
              property="emissiveIntensity"
              label="Glow"
              max={MAX_EMISSIVE_INTENSITY}
              disabled={disabled}
            />
            <MaterialSlider
              node={node}
              property="opacity"
              label="Opacity"
              disabled={disabled}
            />
            <MaterialSlider
              node={node}
              property="reflectionStrength"
              label="Reflect"
              max={MAX_REFLECTION_STRENGTH}
              disabled={disabled}
            />
          </>
        )}
        {flags.map(({ key, label, hint }) => (
          <FlagRow
            key={key}
            node={node}
            flag={key}
            label={label}
            hint={hint}
            disabled={disabled}
          />
        ))}
      </div>
    </section>
  );
}

/** The colour the object glows with. Black means no glow. */
function GlowColor({ node, disabled }: { node: SceneNode; disabled: boolean }) {
  const setNodeMaterial = useSceneStore((state) => state.setNodeMaterial);
  const previewNodeMaterial = useSceneStore(
    (state) => state.previewNodeMaterial,
  );
  return (
    <ColorRow
      label="Glow colour"
      title="Black means no glow"
      value={node.material.emissiveColor}
      defaultValue={DEFAULT_MATERIAL.emissiveColor}
      resetHint="no glow"
      disabled={disabled}
      editLabel="Glow colour"
      onCommit={(emissiveColor) => setNodeMaterial(node.id, { emissiveColor })}
      onPreview={(emissiveColor) =>
        previewNodeMaterial(node.id, { emissiveColor })
      }
    />
  );
}

/**
 * A colour swatch (opens the browser's colour picker) with the hex code and a reset button. The picker
 * sends a stream of changes while you drag inside it: they change the object live (`onPreview`) but are
 * ONE undo step, ended when the browser says the picker was closed or the choice confirmed.
 */
export function ColorRow({
  label,
  title,
  value,
  defaultValue,
  resetHint,
  disabled,
  editLabel,
  onCommit,
  onPreview,
}: {
  label: string;
  title: string;
  value: string;
  defaultValue: string;
  /** Said in the reset button's label: "Reset to ...". */
  resetHint: string;
  disabled: boolean;
  editLabel: string;
  onCommit: (color: string) => void;
  onPreview: (color: string) => void;
}) {
  const beginEdit = useSceneStore((state) => state.beginEdit);
  const pickerRef = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  useEffect(() => {
    const picker = pickerRef.current;
    function finish() {
      if (!picking.current) return;
      picking.current = false;
      useSceneStore.getState().endEdit(true);
    }
    picker?.addEventListener("change", finish);
    picker?.addEventListener("blur", finish);
    return () => {
      picker?.removeEventListener("change", finish);
      picker?.removeEventListener("blur", finish);
      finish();
    };
  }, []);

  function onPick(next: string) {
    if (!picking.current) {
      picking.current = true;
      beginEdit(editLabel);
    }
    onPreview(next);
  }

  return (
    <div className="grid grid-cols-[58px_1fr_26px] items-center gap-2">
      <span className="text-xs text-ed-text-2">{label}</span>
      <div className="flex items-center gap-2">
        <input
          ref={pickerRef}
          type="color"
          value={value}
          disabled={disabled}
          aria-label={`Pick the ${label.toLowerCase()}`}
          title={title}
          onChange={(event) => onPick(event.target.value)}
          className="size-[26px] shrink-0 cursor-pointer appearance-none rounded-md border-2 border-ed-line-strong bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50 [&::-moz-color-swatch]:rounded-sm [&::-moz-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        />
        <span className="font-mono text-xs text-ed-text-3">
          {value.toUpperCase()}
        </span>
      </div>
      <button
        type="button"
        aria-label={`Reset the ${label.toLowerCase()} (${resetHint})`}
        title={`Reset to ${resetHint}`}
        disabled={disabled || value === defaultValue}
        onClick={() => onCommit(defaultValue)}
        className={RESET_BUTTON}
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}

/** One on/off switch of the surface, with its reset button. */
function FlagRow({
  node,
  flag,
  label,
  hint,
  disabled,
}: {
  node: SceneNode;
  flag: Flag;
  label: string;
  hint: string;
  disabled: boolean;
}) {
  const setNodeMaterial = useSceneStore((state) => state.setNodeMaterial);
  const value = node.material[flag];
  // A new plane is double-sided from the start, so "default" depends on the kind of object
  const defaultValue: Material[Flag] =
    flag === "doubleSided" && node.kind === "plane"
      ? true
      : DEFAULT_MATERIAL[flag];

  return (
    <div className="grid grid-cols-[1fr_26px] items-center gap-2">
      <label
        title={hint}
        className="flex cursor-pointer items-center gap-2 text-xs text-ed-text-2 has-[:disabled]:cursor-not-allowed"
      >
        <input
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(event) =>
            setNodeMaterial(node.id, { [flag]: event.target.checked })
          }
          className="size-4 cursor-pointer accent-ed-accent disabled:cursor-not-allowed"
        />
        {label}
      </label>
      <button
        type="button"
        aria-label={`Reset ${label.toLowerCase()} to ${defaultValue ? "on" : "off"}`}
        title={`Reset to ${defaultValue ? "on" : "off"}`}
        disabled={disabled || value === defaultValue}
        onClick={() => setNodeMaterial(node.id, { [flag]: defaultValue })}
        className={RESET_BUTTON}
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}
