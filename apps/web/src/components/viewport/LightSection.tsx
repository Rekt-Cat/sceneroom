"use client";

import {
  DEFAULT_LIGHTS,
  MAX_LIGHT_INTENSITY,
  type LightChange,
  type LightKind,
  type SceneNode,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";
import { ValueSlider } from "./InspectorFields";
import { ColorRow } from "./SurfaceSection";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";

/** The furthest a point or spot light can be set to reach. */
const MAX_RANGE = 100;

/**
 * The "Light" section of the Inspector, for light objects: colour, strength, how far it reaches (point
 * and spot), the width and softness of the beam (spot) and the shadow switch. Every value has its own
 * reset button, back to the starting value of that kind of light.
 */
export default function LightSection({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const setNodeLight = useSceneStore((state) => state.setNodeLight);
  const previewNodeLight = useSceneStore((state) => state.previewNodeLight);
  const light = node.light;
  if (!light) return null;
  const kind = node.kind as LightKind;
  const defaults = DEFAULT_LIGHTS[kind];
  const maxIntensity = MAX_LIGHT_INTENSITY[kind];
  // A bulb or torch is measured in bigger numbers (see MAX_LIGHT_INTENSITY), so whole steps are fine
  const bigNumbers = maxIntensity >= 100;

  const commit = (change: LightChange) => setNodeLight(node.id, change);
  const preview = (change: LightChange) => previewNodeLight(node.id, change);

  return (
    <section aria-label="Light" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Light</h3>
      <div className="space-y-2.5 px-4 pb-4">
        <ColorRow
          label="Colour"
          title="The colour of the light"
          value={light.color}
          defaultValue={defaults.color}
          resetHint={defaults.color.toUpperCase()}
          disabled={disabled}
          editLabel="Light colour"
          onCommit={(color) => commit({ color })}
          onPreview={(color) => preview({ color })}
        />
        <ValueSlider
          label="Strength"
          value={light.intensity}
          defaultValue={defaults.intensity}
          max={maxIntensity}
          step={bigNumbers ? 1 : 0.01}
          decimals={bigNumbers ? 0 : 2}
          disabled={disabled}
          editLabel="Light strength"
          onCommit={(intensity) => commit({ intensity })}
          onPreview={(intensity) => preview({ intensity })}
        />
        {kind !== "directional" && (
          <ValueSlider
            label="Range"
            value={light.range}
            defaultValue={defaults.range}
            max={MAX_RANGE}
            step={1}
            decimals={0}
            disabled={disabled}
            editLabel="Light range"
            onCommit={(range) => commit({ range })}
            onPreview={(range) => preview({ range })}
          />
        )}
        {kind === "spot" && (
          <>
            <ValueSlider
              label="Angle"
              value={light.angle}
              defaultValue={defaults.angle}
              max={85}
              step={1}
              decimals={0}
              disabled={disabled}
              editLabel="Light angle"
              onCommit={(angle) => commit({ angle })}
              onPreview={(angle) => preview({ angle })}
            />
            <ValueSlider
              label="Softness"
              value={light.penumbra}
              defaultValue={defaults.penumbra}
              disabled={disabled}
              editLabel="Light softness"
              onCommit={(penumbra) => commit({ penumbra })}
              onPreview={(penumbra) => preview({ penumbra })}
            />
          </>
        )}
        <div className="grid grid-cols-[1fr_26px] items-center gap-2">
          <label
            title="The light throws shadows"
            className="flex cursor-pointer items-center gap-2 text-xs text-ed-text-2 has-[:disabled]:cursor-not-allowed"
          >
            <input
              type="checkbox"
              checked={light.castShadow}
              disabled={disabled}
              onChange={(event) => commit({ castShadow: event.target.checked })}
              className="size-4 cursor-pointer accent-ed-accent disabled:cursor-not-allowed"
            />
            Cast shadows
          </label>
          <button
            type="button"
            aria-label={`Reset cast shadows to ${defaults.castShadow ? "on" : "off"}`}
            title={`Reset to ${defaults.castShadow ? "on" : "off"}`}
            disabled={disabled || light.castShadow === defaults.castShadow}
            onClick={() => commit({ castShadow: defaults.castShadow })}
            className="grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Icon name="reset" />
          </button>
        </div>
      </div>
    </section>
  );
}
