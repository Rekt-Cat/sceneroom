"use client";

import { useState } from "react";
import {
  CUSTOM_PLANT_NAME_MAX_LENGTH,
  DEFAULT_PLANT,
  LEAF_STYLES,
  PLANT_PRESET_INFO,
  PLANT_PRESET_NAMES,
  createPlantRandomiser,
  createRandom,
  scatterSpots,
  type LeafStyle,
  type PlantChange,
  type SceneNode,
} from "@sceneroom/shared";
import { bakePlantToMeshes } from "@/mesh/bakePlant";
import { useImportStore } from "@/store/importStore";
import { usePlantLibraryStore } from "@/store/plantLibraryStore";
import { useSceneStore } from "@/store/sceneStore";
import { Choice } from "./EnvironmentPanel";
import { Icon } from "./icons";
import { MaterialSlider, ValueSlider } from "./InspectorFields";
import { ColorRow } from "./SurfaceSection";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";

const SUBTITLE =
  "pt-1 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";

const LEAF_CHOICES: readonly { value: LeafStyle; label: string }[] =
  LEAF_STYLES.map((value) => ({
    value,
    label: value === "blobs" ? "Lumps" : "Cards",
  }));

/** The number sliders of a plant: the setting, its label and its range. The ranges match `sanitizePlantChange`. */
type Slider = {
  key:
    | "height"
    | "trunkRadius"
    | "taper"
    | "crookedness"
    | "levels"
    | "branches"
    | "branchAngle"
    | "branchLength"
    | "branchStart"
    | "droop"
    | "leafDensity"
    | "leafSize"
    | "sides"
    | "rings";
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
};

const SHAPE: Slider[] = [
  { key: "height", label: "Height", min: 0.2, max: 30, step: 0.1, decimals: 1 },
  {
    key: "trunkRadius",
    label: "Trunk",
    min: 0.005,
    max: 2,
    step: 0.005,
    decimals: 3,
  },
  { key: "taper", label: "Taper", min: 0, max: 0.95, step: 0.01, decimals: 2 },
  {
    key: "crookedness",
    label: "Crooked",
    min: 0,
    max: 1,
    step: 0.01,
    decimals: 2,
  },
];
const BRANCHES: Slider[] = [
  { key: "levels", label: "Levels", min: 0, max: 3, step: 1, decimals: 0 },
  { key: "branches", label: "Branches", min: 1, max: 10, step: 1, decimals: 0 },
  { key: "branchAngle", label: "Angle", min: 5, max: 90, step: 1, decimals: 0 },
  {
    key: "branchLength",
    label: "Length",
    min: 0.15,
    max: 0.95,
    step: 0.01,
    decimals: 2,
  },
  {
    key: "branchStart",
    label: "Start",
    min: 0,
    max: 0.9,
    step: 0.01,
    decimals: 2,
  },
  { key: "droop", label: "Droop", min: -1, max: 1, step: 0.01, decimals: 2 },
];
const LEAVES: Slider[] = [
  {
    key: "leafDensity",
    label: "Density",
    min: 0,
    max: 1,
    step: 0.01,
    decimals: 2,
  },
  {
    key: "leafSize",
    label: "Size",
    min: 0.03,
    max: 3,
    step: 0.01,
    decimals: 2,
  },
];
const DETAIL: Slider[] = [
  { key: "sides", label: "Sides", min: 3, max: 12, step: 1, decimals: 0 },
  { key: "rings", label: "Rings", min: 2, max: 10, step: 1, decimals: 0 },
];

/** The starting values of the forest controls (not saved: they only decide the next "Scatter"). */
const FOREST_DEFAULTS = { count: 12, radius: 6, spacing: 1.5, variation: 0.25 };

/**
 * The "Plant" section of the Inspector: pick a kind (tree, pine, bush), change every number of how it
 * grows, its colours and its seed, scatter copies of it as a forest, or turn it into editable meshes.
 * Every value has its own reset button (back to the starting value of a tree).
 */
export default function PlantSection({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const setNodePlant = useSceneStore((state) => state.setNodePlant);
  const previewNodePlant = useSceneStore((state) => state.previewNodePlant);
  const applyPlantPreset = useSceneStore((state) => state.applyPlantPreset);
  const setNodeColor = useSceneStore((state) => state.setNodeColor);
  const previewNodeColor = useSceneStore((state) => state.previewNodeColor);
  // Remembers the plant the button started from, so pressing it many times gives variations of ONE plant
  // instead of drifting (see createPlantRandomiser). A new one for each plant shown.
  const [randomise] = useState(createPlantRandomiser);
  const plant = node.plant;
  if (!plant) return null;

  const commit = (change: PlantChange) => setNodePlant(node.id, change);
  const preview = (change: PlantChange) => previewNodePlant(node.id, change);

  const slider = ({ key, label, min, max, step, decimals }: Slider) => (
    <ValueSlider
      key={key}
      label={label}
      value={plant[key]}
      defaultValue={DEFAULT_PLANT[key]}
      min={min}
      max={max}
      step={step}
      decimals={decimals}
      disabled={disabled}
      editLabel="Plant"
      onCommit={(value) => commit({ [key]: value })}
      onPreview={(value) => preview({ [key]: value })}
    />
  );

  return (
    <section aria-label="Plant" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Plant</h3>
      <div className="space-y-2.5 px-4 pb-4">
        <div role="group" aria-label="Kind of plant" className="flex gap-1.5">
          {PLANT_PRESET_NAMES.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              title={`Give this plant the numbers of a ${PLANT_PRESET_INFO[preset].label.toLowerCase()} (keeps its seed)`}
              onClick={() => applyPlantPreset(node.id, preset)}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-ed-line-strong bg-ed-raised text-xs font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name={preset} className="size-3.5" />
              {PLANT_PRESET_INFO[preset].label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_30px] items-end gap-2">
          <ValueSlider
            label="Seed"
            value={plant.seed}
            defaultValue={DEFAULT_PLANT.seed}
            max={99999}
            step={1}
            decimals={0}
            disabled={disabled}
            editLabel="Plant"
            onCommit={(seed) => commit({ seed })}
            onPreview={(seed) => preview({ seed })}
          />
          <button
            type="button"
            disabled={disabled}
            title="Grow a different plant (a new random seed)"
            aria-label="New random seed"
            onClick={() => commit({ seed: Math.floor(Math.random() * 100000) })}
            className="grid size-[30px] place-items-center rounded-md border border-ed-line-strong bg-ed-raised hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon name="redo" />
          </button>
        </div>

        <button
          type="button"
          disabled={disabled}
          title="Change the numbers a little at random, and grow from a new seed. Every press varies the plant you started from, so pressing it again and again never drifts. One undo step."
          onClick={() =>
            commit(
              randomise(
                plant,
                createRandom(Math.floor(Math.random() * 2 ** 31)),
              ),
            )
          }
          className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-ed-line-strong bg-ed-raised text-sm font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="redo" />
          Randomise
        </button>

        <p className={SUBTITLE}>Trunk</p>
        {SHAPE.map(slider)}

        <p className={SUBTITLE}>Branches</p>
        {BRANCHES.map(slider)}

        <p className={SUBTITLE}>Leaves</p>
        <Choice
          label="Style"
          choices={LEAF_CHOICES}
          value={plant.leafStyle}
          defaultValue={DEFAULT_PLANT.leafStyle}
          onChange={(leafStyle) => commit({ leafStyle })}
        />
        {LEAVES.map(slider)}

        <p className={SUBTITLE}>Colours</p>
        <ColorRow
          label="Trunk"
          title="The colour of the trunk and branches"
          value={node.color}
          defaultValue={PLANT_PRESET_INFO.tree.barkColor}
          resetHint={PLANT_PRESET_INFO.tree.barkColor.toUpperCase()}
          disabled={disabled}
          editLabel="Change colour"
          onCommit={(color) => setNodeColor(node.id, color)}
          onPreview={(color) => previewNodeColor(node.id, color)}
        />
        <ColorRow
          label="Leaves"
          title="The colour of the leaves"
          value={plant.leafColor}
          defaultValue={DEFAULT_PLANT.leafColor}
          resetHint={DEFAULT_PLANT.leafColor.toUpperCase()}
          disabled={disabled}
          editLabel="Leaf colour"
          onCommit={(leafColor) => commit({ leafColor })}
          onPreview={(leafColor) => preview({ leafColor })}
        />
        <MaterialSlider
          node={node}
          property="roughness"
          label="Rough"
          disabled={disabled}
        />
        <MaterialSlider
          node={node}
          property="metalness"
          label="Metal"
          disabled={disabled}
        />

        <p className={SUBTITLE}>Detail</p>
        {DETAIL.map(slider)}
        <p className="text-[11px] leading-relaxed text-ed-text-3">
          More sides and rings make rounder branches, and more triangles.
        </p>

        <SaveAsMyPlant node={node} />
        <Forest node={node} disabled={disabled} />
        <MakeMeshButton node={node} disabled={disabled} />
      </div>
    </section>
  );
}

/**
 * "Save as my plant": keeps this plant's numbers and trunk colour under a name, so it appears under "My plants"
 * in the Add menu, one click to add again. Saved in this browser (not in the scene). Saving again under the
 * same name replaces it.
 */
function SaveAsMyPlant({ node }: { node: SceneNode }) {
  const save = usePlantLibraryStore((state) => state.save);
  const [name, setName] = useState("");
  const shown = name || node.name;
  function submit() {
    const item = save(shown, node);
    useImportStore.getState().setMessage(
      item
        ? {
            tone: "info",
            text: `Saved "${item.name}" under My plants (Add menu, Plants tab).`,
          }
        : { tone: "error", text: "Give the plant a name to save it." },
    );
    if (item) setName("");
  }
  return (
    <div className="space-y-2 border-t border-ed-line pt-3">
      <p className={SUBTITLE}>My plants</p>
      <div className="flex gap-1.5">
        <input
          value={name}
          placeholder={node.name}
          maxLength={CUSTOM_PLANT_NAME_MAX_LENGTH}
          aria-label="Name for this plant"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
          className="h-8 min-w-0 flex-1 rounded-md border border-ed-line bg-ed-field px-2.5 text-sm outline-none placeholder:text-ed-text-3 focus:border-ed-accent"
        />
        <button
          type="button"
          title="Keep these numbers and the trunk colour as a plant you can add again (the seed is not kept: each new one grows differently)"
          onClick={submit}
          className="h-8 shrink-0 rounded-md border border-ed-line-strong bg-ed-raised px-3 text-sm font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent"
        >
          Save
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-ed-text-3">
        Saves these numbers under a name. It then shows in the Add menu, under
        Plants, in this browser. Each new one gets its own seed.
      </p>
    </div>
  );
}

/** "Scatter copies": a forest from one plant. The numbers here only decide the next scatter (they are not saved). */
function Forest({ node, disabled }: { node: SceneNode; disabled: boolean }) {
  const scatterPlant = useSceneStore((state) => state.scatterPlant);
  const [forest, setForest] = useState(FOREST_DEFAULTS);
  const change = (key: keyof typeof FOREST_DEFAULTS) => (value: number) =>
    setForest((current) => ({ ...current, [key]: value }));
  const row = (
    key: keyof typeof FOREST_DEFAULTS,
    label: string,
    min: number,
    max: number,
    step: number,
    decimals: number,
  ) => (
    <ValueSlider
      label={label}
      value={forest[key]}
      defaultValue={FOREST_DEFAULTS[key]}
      min={min}
      max={max}
      step={step}
      decimals={decimals}
      disabled={disabled}
      editLabel="Forest"
      onCommit={change(key)}
      onPreview={change(key)}
    />
  );
  return (
    <div className="space-y-2.5 border-t border-ed-line pt-3">
      <p className={SUBTITLE}>Forest</p>
      {row("count", "Copies", 1, 100, 1, 0)}
      {row("radius", "Radius", 1, 50, 0.5, 1)}
      {row("spacing", "Space", 0, 10, 0.1, 1)}
      {row("variation", "Size mix", 0, 0.8, 0.01, 2)}
      <button
        type="button"
        disabled={disabled}
        title="Add copies of this plant around it, each a little different (a new seed, size and turn)"
        onClick={() =>
          scatterPlant(
            node.id,
            scatterSpots({
              seed: node.plant?.seed ?? 1,
              count: forest.count,
              radius: forest.radius,
              spacing: forest.spacing,
              sizeVariation: forest.variation,
              firstSeed: (node.plant?.seed ?? 1) + 13,
            }),
          )
        }
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-ed-line-strong bg-ed-raised text-sm font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="plus" />
        Scatter copies
      </button>
      <p className="text-[11px] leading-relaxed text-ed-text-3">
        Adds copies around this plant, each with its own seed, size and turn, so
        no two are the same. One undo step.
      </p>
    </div>
  );
}

/** "Make mesh" for a plant: wood and leaves become two editable meshes (undo brings the plant back). */
function MakeMeshButton({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="border-t border-ed-line pt-3">
      <button
        type="button"
        disabled={disabled || busy}
        title="Turn this plant into editable meshes: the wood, and the leaves inside it (undo brings the plant back)"
        onClick={() => {
          setBusy(true);
          void bakePlantToMeshes(node.id).finally(() => setBusy(false));
        }}
        className="flex h-8 w-full items-center justify-center gap-2 rounded-md border border-ed-line-strong bg-ed-raised text-sm font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="mesh" />
        Make mesh
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ed-text-3">
        Bakes the plant into real points and triangles (the wood, and the leaves
        as a second mesh inside it). The plant sliders go away; the seed is kept
        in a note.
      </p>
    </div>
  );
}
