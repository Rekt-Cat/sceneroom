"use client";

import { type ReactNode } from "react";
import { DEFAULT_ENVIRONMENT } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";
import { ValueSlider } from "./InspectorFields";
import { ColorRow } from "./SurfaceSection";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";

const RESET_BUTTON =
  "grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";

const BACKGROUND_CHOICES = [
  { value: "color", label: "Colour" },
  { value: "sky", label: "Sky" },
] as const;

const REFLECTION_CHOICES = [
  { value: "off", label: "Off" },
  { value: "studio", label: "Studio" },
  { value: "sky", label: "Sky" },
] as const;

/**
 * The settings of the world, shown in the right panel when nothing is selected: the background, what
 * shiny surfaces reflect, fog, and the always-on lights. Each value has its own reset button, back to
 * the starting look.
 */
export default function EnvironmentPanel() {
  const environment = useSceneStore((state) => state.scene.environment);
  const set = useSceneStore((state) => state.setEnvironmentSettings);
  const preview = useSceneStore((state) => state.previewEnvironmentSettings);
  const defaults = DEFAULT_ENVIRONMENT;

  const color = (
    key: "backgroundColor" | "skyTop" | "skyHorizon" | "skyGround" | "fogColor",
    label: string,
  ) => (
    <ColorRow
      label={label}
      title={label}
      value={environment[key]}
      defaultValue={defaults[key]}
      resetHint={defaults[key].toUpperCase()}
      disabled={false}
      editLabel="Environment colour"
      onCommit={(value) => set({ [key]: value })}
      onPreview={(value) => preview({ [key]: value })}
    />
  );

  const slider = (
    key:
      | "reflectionStrength"
      | "fogNear"
      | "fogFar"
      | "ambientIntensity"
      | "sunIntensity"
      | "sunAzimuth"
      | "sunElevation",
    label: string,
    max: number,
    whole = false,
  ) => (
    <ValueSlider
      label={label}
      value={environment[key]}
      defaultValue={defaults[key]}
      max={max}
      step={whole ? 1 : 0.01}
      decimals={whole ? 0 : 2}
      disabled={false}
      editLabel="Environment"
      onCommit={(value) => set({ [key]: value })}
      onPreview={(value) => preview({ [key]: value })}
    />
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="border-b border-ed-line px-4 py-3.5">
        <p className="text-[15px] font-semibold">Scene settings</p>
        <p className="text-xs text-ed-text-3">
          Nothing is selected. Click an object to edit it instead.
        </p>
      </div>

      <Section title="Background">
        <Choice
          label="Show"
          choices={BACKGROUND_CHOICES}
          value={environment.backgroundMode}
          defaultValue={defaults.backgroundMode}
          onChange={(backgroundMode) => set({ backgroundMode })}
        />
        {environment.backgroundMode === "color" ? (
          color("backgroundColor", "Colour")
        ) : (
          <>
            {color("skyTop", "Top")}
            {color("skyHorizon", "Horizon")}
            {color("skyGround", "Ground")}
          </>
        )}
      </Section>

      <Section title="Reflections">
        <Choice
          label="Show"
          choices={REFLECTION_CHOICES}
          value={environment.reflections}
          defaultValue={defaults.reflections}
          onChange={(reflections) => set({ reflections })}
        />
        {environment.reflections !== "off" &&
          slider("reflectionStrength", "Strength", 5)}
        {environment.reflections === "sky" && (
          <p className="text-[11px] leading-relaxed text-ed-text-3">
            Reflects the sky colours of the Background section.
          </p>
        )}
      </Section>

      <Section title="Fog">
        <Switch
          label="Fog"
          hint="Things fade into the fog colour with distance"
          checked={environment.fogEnabled}
          defaultValue={defaults.fogEnabled}
          onChange={(fogEnabled) => set({ fogEnabled })}
        />
        {environment.fogEnabled && (
          <>
            {color("fogColor", "Colour")}
            {slider("fogNear", "Starts", 100, true)}
            {slider("fogFar", "Full", 300, true)}
          </>
        )}
      </Section>

      <Section title="Base lighting">
        {slider("ambientIntensity", "Ambient", 3)}
        <Switch
          label="Sun"
          hint="The built-in sun. Switch it off to light the scene only with your own lights and the reflections."
          checked={environment.sunEnabled}
          defaultValue={defaults.sunEnabled}
          onChange={(sunEnabled) => set({ sunEnabled })}
        />
        {environment.sunEnabled && (
          <>
            {slider("sunIntensity", "Strength", 10)}
            {slider("sunAzimuth", "Direction", 360, true)}
            {slider("sunElevation", "Height", 90, true)}
            <p className="text-[11px] leading-relaxed text-ed-text-3">
              The sun stops casting shadows once the scene has a light of its
              own.
            </p>
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="border-b border-ed-line">
      <h3 className={sectionTitle}>{title}</h3>
      <div className="space-y-2.5 px-4 pb-4">{children}</div>
    </section>
  );
}

/** A row of exclusive choices with a reset button. */
export function Choice<T extends string>({
  label,
  choices,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  choices: readonly { value: T; label: string }[];
  value: T;
  defaultValue: T;
  onChange: (value: T) => void;
}) {
  const defaultLabel = choices.find((c) => c.value === defaultValue)?.label;
  return (
    <div className="grid grid-cols-[58px_1fr_26px] items-center gap-2">
      <span className="text-xs text-ed-text-2">{label}</span>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-1 rounded-lg bg-ed-field p-1"
      >
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={value === choice.value}
            onClick={() => onChange(choice.value)}
            className={`h-6 flex-1 rounded-md text-xs font-medium focus-visible:outline-2 focus-visible:outline-ed-accent ${
              value === choice.value
                ? "bg-ed-raised text-ed-text"
                : "text-ed-text-3 hover:text-ed-text"
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label={`Reset ${label.toLowerCase()} to ${defaultLabel}`}
        title={`Reset to ${defaultLabel}`}
        disabled={value === defaultValue}
        onClick={() => onChange(defaultValue)}
        className={RESET_BUTTON}
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}

/** An on / off switch with a reset button. */
function Switch({
  label,
  hint,
  checked,
  defaultValue,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  defaultValue: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_26px] items-center gap-2">
      <label
        title={hint}
        className="flex cursor-pointer items-center gap-2 text-xs text-ed-text-2"
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 cursor-pointer accent-ed-accent"
        />
        {label}
      </label>
      <button
        type="button"
        aria-label={`Reset ${label.toLowerCase()} to ${defaultValue ? "on" : "off"}`}
        title={`Reset to ${defaultValue ? "on" : "off"}`}
        disabled={checked === defaultValue}
        onClick={() => onChange(defaultValue)}
        className={RESET_BUTTON}
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}
