"use client";

import { useState } from "react";
import {
  BONE_LABELS,
  BONE_MOTION,
  CHARACTER_BONES,
  CHARACTER_PRESET_INFO,
  CHARACTER_PRESET_NAMES,
  DEFAULT_CHARACTER,
  HAIR_STYLES,
  POSE_CHANNELS,
  POSE_PRESETS,
  POSE_PRESET_LABELS,
  POSE_PRESET_NAMES,
  createCharacterRandomiser,
  createRandom,
  samePose,
  scatterSpots,
  type CharacterBone,
  type CharacterChange,
  type CharacterSettings,
  type HairStyle,
  type PoseChannel,
  type SceneNode,
} from "@sceneroom/shared";
import { bakeCharacterToMeshes } from "@/mesh/bakeCharacter";
import { useCharacterViewStore } from "@/store/characterViewStore";
import { useSceneStore } from "@/store/sceneStore";
import { Choice } from "./EnvironmentPanel";
import { Icon } from "./icons";
import { ValueSlider } from "./InspectorFields";
import { ColorRow } from "./SurfaceSection";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";
const SUBTITLE =
  "pt-1 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";
const BUTTON =
  "flex h-8 items-center justify-center gap-2 rounded-md border border-ed-line-strong bg-ed-raised text-sm font-medium hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50";

const HAIR_CHOICES: readonly { value: HairStyle; label: string }[] =
  HAIR_STYLES.map((value) => ({
    value,
    label: value[0]!.toUpperCase() + value.slice(1),
  }));

const CHANNEL_LABELS: Record<PoseChannel, string> = {
  swing: "Swing",
  out: "Out",
  twist: "Twist",
};

/** What each way of turning a bone means, for the tooltip. */
const CHANNEL_HINTS: Record<PoseChannel, string> = {
  swing:
    "Forwards (positive) and back. For a knee or elbow: bend. For a foot: toes up.",
  out: "Away from the middle of the body (positive), or towards it. A side bend for the spine.",
  twist: "Turning along its length.",
};

type BodySlider = {
  key: "height" | "build" | "headSize" | "legRatio" | "armScale";
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
};

const BODY: BodySlider[] = [
  { key: "height", label: "Height", min: 0.3, max: 3, step: 0.01, decimals: 2 },
  { key: "build", label: "Build", min: 0, max: 1, step: 0.01, decimals: 2 },
  {
    key: "headSize",
    label: "Head",
    min: 0.6,
    max: 1.6,
    step: 0.01,
    decimals: 2,
  },
  {
    key: "legRatio",
    label: "Legs",
    min: 0.35,
    max: 0.6,
    step: 0.01,
    decimals: 2,
  },
  {
    key: "armScale",
    label: "Arms",
    min: 0.7,
    max: 1.3,
    step: 0.01,
    decimals: 2,
  },
];

type ColorKey =
  "skinColor" | "hairColor" | "shirtColor" | "pantsColor" | "shoesColor";
const COLORS: { key: ColorKey; label: string }[] = [
  { key: "skinColor", label: "Skin" },
  { key: "hairColor", label: "Hair" },
  { key: "shirtColor", label: "Shirt" },
  { key: "pantsColor", label: "Trousers" },
  { key: "shoesColor", label: "Shoes" },
];

/** The starting values of the crowd controls (not saved: they only decide the next crowd). */
const CROWD_DEFAULTS = { count: 10, radius: 6, spacing: 1.2, variation: 0.08 };

/** The bone on the other side of the body (left for right), or null for a bone in the middle. */
function oppositeBone(bone: CharacterBone): CharacterBone | null {
  if (bone.endsWith(".L")) return bone.replace(".L", ".R") as CharacterBone;
  if (bone.endsWith(".R")) return bone.replace(".R", ".L") as CharacterBone;
  return null;
}

/**
 * The "Character" section of the Inspector: the kind of person, how they look (body, hair, clothes, colours),
 * their pose (a pose button, or any bone's angles), a crowd of copies, the skeleton view, and Make mesh.
 * Every value has its own reset button.
 */
export default function CharacterSection({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const setNodeCharacter = useSceneStore((state) => state.setNodeCharacter);
  const previewNodeCharacter = useSceneStore(
    (state) => state.previewNodeCharacter,
  );
  const applyCharacterPreset = useSceneStore(
    (state) => state.applyCharacterPreset,
  );
  const showSkeleton = useCharacterViewStore((state) => state.showSkeleton);
  const setShowSkeleton = useCharacterViewStore(
    (state) => state.setShowSkeleton,
  );
  // Remembers the character the button started from, so pressing it again and again gives variations of ONE
  // character instead of drifting (see createCharacterRandomiser)
  const [randomise] = useState(createCharacterRandomiser);
  const [bone, setBone] = useState<CharacterBone>("head");
  const character = node.character;
  if (!character) return null;

  const commit = (change: CharacterChange) => setNodeCharacter(node.id, change);
  const preview = (change: CharacterChange) =>
    previewNodeCharacter(node.id, change);

  return (
    <section aria-label="Character" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Character</h3>
      <div className="space-y-2.5 px-4 pb-4">
        <div
          role="group"
          aria-label="Kind of character"
          className="flex flex-wrap gap-1.5"
        >
          {CHARACTER_PRESET_NAMES.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={disabled}
              title={`${CHARACTER_PRESET_INFO[preset].hint}. Keeps the pose.`}
              onClick={() => applyCharacterPreset(node.id, preset)}
              className={`${BUTTON} min-w-[4.5rem] flex-1 text-xs`}
            >
              {CHARACTER_PRESET_INFO[preset].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          title="Change the colours, the hair and clothes, and the height and build a little at random. Every press varies the character you started from, so it never drifts. The pose is kept."
          onClick={() =>
            commit(
              randomise(
                character,
                createRandom(Math.floor(Math.random() * 2 ** 31)),
              ),
            )
          }
          className={`${BUTTON} w-full`}
        >
          <Icon name="redo" />
          Randomise look
        </button>

        <p className={SUBTITLE}>Body</p>
        {BODY.map(({ key, label, min, max, step, decimals }) => (
          <ValueSlider
            key={key}
            label={label}
            value={character[key]}
            defaultValue={DEFAULT_CHARACTER[key]}
            min={min}
            max={max}
            step={step}
            decimals={decimals}
            disabled={disabled}
            editLabel="Character"
            onCommit={(value) => commit({ [key]: value })}
            onPreview={(value) => preview({ [key]: value })}
          />
        ))}

        <p className={SUBTITLE}>Hair and clothes</p>
        <Choice
          label="Hair"
          choices={HAIR_CHOICES}
          value={character.hair}
          defaultValue={DEFAULT_CHARACTER.hair}
          onChange={(hair) => commit({ hair })}
        />
        <Switch
          label="Long sleeves"
          checked={character.longSleeves}
          defaultValue={DEFAULT_CHARACTER.longSleeves}
          disabled={disabled}
          onChange={(longSleeves) => commit({ longSleeves })}
        />
        <Switch
          label="Long trousers"
          checked={character.longPants}
          defaultValue={DEFAULT_CHARACTER.longPants}
          disabled={disabled}
          onChange={(longPants) => commit({ longPants })}
        />
        {COLORS.map(({ key, label }) => (
          <ColorRow
            key={key}
            label={label}
            title={`The colour of the ${label.toLowerCase()}`}
            value={character[key]}
            defaultValue={DEFAULT_CHARACTER[key]}
            resetHint={DEFAULT_CHARACTER[key].toUpperCase()}
            disabled={disabled}
            editLabel={`${label} colour`}
            onCommit={(value) => commit({ [key]: value })}
            onPreview={(value) => preview({ [key]: value })}
          />
        ))}

        <PoseControls
          character={character}
          bone={bone}
          setBone={setBone}
          disabled={disabled}
          commit={commit}
          preview={preview}
        />

        <Switch
          label="Stand on the ground"
          hint="Raises or lowers the body so its lowest point is on the ground, whatever the pose (a sitting character lowers its hips)"
          checked={character.onGround}
          defaultValue={DEFAULT_CHARACTER.onGround}
          disabled={disabled}
          onChange={(onGround) => commit({ onGround })}
        />
        <Switch
          label="Show skeleton"
          hint="Draw the bones and joints over the character (a view aid: not saved, not part of the scene)"
          checked={showSkeleton}
          defaultValue={false}
          disabled={false}
          onChange={setShowSkeleton}
        />

        <Crowd node={node} disabled={disabled} />
        <MakeMeshButton node={node} disabled={disabled} />
      </div>
    </section>
  );
}

/** The pose: a button for each ready-made pose, and the angles of any bone. */
function PoseControls({
  character,
  bone,
  setBone,
  disabled,
  commit,
  preview,
}: {
  character: CharacterSettings;
  bone: CharacterBone;
  setBone: (bone: CharacterBone) => void;
  disabled: boolean;
  commit: (change: CharacterChange) => void;
  preview: (change: CharacterChange) => void;
}) {
  const motion = BONE_MOTION[bone];
  const angles = character.pose[bone] ?? [0, 0, 0];
  const other = oppositeBone(bone);
  const withBone = (target: CharacterBone, next: [number, number, number]) => ({
    pose: { ...character.pose, [target]: next },
  });
  const channelIndex = (channel: PoseChannel) => POSE_CHANNELS.indexOf(channel);

  return (
    <div className="space-y-2.5 border-t border-ed-line pt-3">
      <p className={SUBTITLE}>Pose</p>
      <div role="group" aria-label="Poses" className="flex flex-wrap gap-1.5">
        {POSE_PRESET_NAMES.map((name) => (
          <button
            key={name}
            type="button"
            disabled={disabled}
            aria-pressed={samePose(character.pose, POSE_PRESETS[name])}
            onClick={() => commit({ pose: POSE_PRESETS[name] })}
            className={`${BUTTON} min-w-[3.6rem] flex-1 text-xs aria-pressed:border-ed-accent aria-pressed:bg-ed-accent/20`}
          >
            {POSE_PRESET_LABELS[name]}
          </button>
        ))}
      </div>

      <label className="grid grid-cols-[58px_1fr] items-center gap-2 text-xs text-ed-text-2">
        Bone
        <select
          value={bone}
          onChange={(event) => setBone(event.target.value as CharacterBone)}
          className="h-[30px] rounded-md border border-ed-line bg-ed-field px-2 text-sm text-ed-text outline-none focus:border-ed-accent"
        >
          {CHARACTER_BONES.map((name) => (
            <option key={name} value={name}>
              {BONE_LABELS[name]}
            </option>
          ))}
        </select>
      </label>

      {POSE_CHANNELS.map((channel) => {
        const [min, max] = motion[channel];
        // A bone that cannot turn this way (a knee does not swing sideways) has no slider for it
        if (min === 0 && max === 0) return null;
        const index = channelIndex(channel);
        const set = (value: number) => {
          const next: [number, number, number] = [...angles];
          next[index] = value;
          return next;
        };
        return (
          <div key={channel} title={CHANNEL_HINTS[channel]}>
            <ValueSlider
              label={CHANNEL_LABELS[channel]}
              value={angles[index]!}
              defaultValue={0}
              min={min}
              max={max}
              step={1}
              decimals={0}
              disabled={disabled}
              editLabel="Pose"
              onCommit={(value) => commit(withBone(bone, set(value)))}
              onPreview={(value) => preview(withBone(bone, set(value)))}
            />
          </div>
        );
      })}

      <div className="flex gap-1.5">
        {other && (
          <button
            type="button"
            disabled={disabled}
            title={`Give ${BONE_LABELS[other].toLowerCase()} the same angles (both sides then match, mirrored)`}
            onClick={() => commit(withBone(other, [...angles]))}
            className={`${BUTTON} flex-1 text-xs`}
          >
            Copy to {BONE_LABELS[other].split(" ")[0]!.toLowerCase()} side
          </button>
        )}
        <button
          type="button"
          disabled={disabled || samePose(character.pose, {})}
          title="Put every bone back at rest"
          onClick={() => commit({ pose: {} })}
          className={`${BUTTON} flex-1 text-xs`}
        >
          <Icon name="reset" />
          Reset pose
        </button>
      </div>
    </div>
  );
}

/** An on / off switch with a reset button. */
function Switch({
  label,
  hint,
  checked,
  defaultValue,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  defaultValue: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_26px] items-center gap-2">
      <label
        title={hint}
        className="flex cursor-pointer items-center gap-2 text-xs text-ed-text-2 has-[:disabled]:cursor-not-allowed"
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="size-4 cursor-pointer accent-ed-accent disabled:cursor-not-allowed"
        />
        {label}
      </label>
      <button
        type="button"
        aria-label={`Reset ${label.toLowerCase()} to ${defaultValue ? "on" : "off"}`}
        title={`Reset to ${defaultValue ? "on" : "off"}`}
        disabled={disabled || checked === defaultValue}
        onClick={() => onChange(defaultValue)}
        className="grid size-[26px] place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Icon name="reset" />
      </button>
    </div>
  );
}

/** "Make a crowd": copies of this character around it, each with a look of its own. The numbers only decide the next crowd. */
function Crowd({ node, disabled }: { node: SceneNode; disabled: boolean }) {
  const scatterCharacter = useSceneStore((state) => state.scatterCharacter);
  const [crowd, setCrowd] = useState(CROWD_DEFAULTS);
  const change = (key: keyof typeof CROWD_DEFAULTS) => (value: number) =>
    setCrowd((current) => ({ ...current, [key]: value }));
  const row = (
    key: keyof typeof CROWD_DEFAULTS,
    label: string,
    min: number,
    max: number,
    step: number,
    decimals: number,
  ) => (
    <ValueSlider
      label={label}
      value={crowd[key]}
      defaultValue={CROWD_DEFAULTS[key]}
      min={min}
      max={max}
      step={step}
      decimals={decimals}
      disabled={disabled}
      editLabel="Crowd"
      onCommit={change(key)}
      onPreview={change(key)}
    />
  );
  return (
    <div className="space-y-2.5 border-t border-ed-line pt-3">
      <p className={SUBTITLE}>Crowd</p>
      {row("count", "Copies", 1, 60, 1, 0)}
      {row("radius", "Radius", 1, 40, 0.5, 1)}
      {row("spacing", "Space", 0, 6, 0.1, 1)}
      {row("variation", "Size mix", 0, 0.4, 0.01, 2)}
      <button
        type="button"
        disabled={disabled}
        title="Add copies of this character around it, each with its own colours, hair, clothes, size and turn (the pose is kept)"
        onClick={() =>
          scatterCharacter(
            node.id,
            scatterSpots({
              seed: Math.floor(Math.random() * 100000),
              count: crowd.count,
              radius: crowd.radius,
              spacing: crowd.spacing,
              sizeVariation: crowd.variation,
              firstSeed: Math.floor(Math.random() * 100000),
            }),
          )
        }
        className={`${BUTTON} w-full`}
      >
        <Icon name="plus" />
        Make a crowd
      </button>
      <p className="text-[11px] leading-relaxed text-ed-text-3">
        Adds copies around this character, each with its own look, size and
        turn, and the same pose. One undo step.
      </p>
    </div>
  );
}

/** "Make mesh": the character (in its pose) becomes editable meshes, one per colour. */
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
        title="Turn this character, in its pose, into editable meshes: the skin, and a mesh inside it for each other colour (undo brings the character back)"
        onClick={() => {
          setBusy(true);
          void bakeCharacterToMeshes(node.id).finally(() => setBusy(false));
        }}
        className={`${BUTTON} w-full`}
      >
        <Icon name="mesh" />
        Make mesh
      </button>
      <p className="mt-1.5 text-[11px] leading-relaxed text-ed-text-3">
        Bakes the character, in its current pose, into real points and
        triangles: the skin, and a mesh for the hair, shirt, trousers, shoes and
        eyes inside it. The skeleton and the sliders go away.
      </p>
    </div>
  );
}
