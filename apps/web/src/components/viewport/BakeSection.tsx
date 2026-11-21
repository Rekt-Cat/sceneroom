"use client";

import type { SceneNode } from "@sceneroom/shared";
import { bakeNormalMap } from "@/bake/bakeNormal";
import { shrinkwrapTargets } from "@/meshEdit/shrinkwrap";
import { BAKE_SIZES, DEFAULT_CAGE, useBakeStore } from "@/store/bakeStore";
import { useSceneStore } from "@/store/sceneStore";
import { BrushSlider } from "./PaintSection";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";
const BUTTON =
  "rounded-md border border-ed-line-strong bg-ed-raised px-2.5 py-1 text-xs font-medium text-ed-text hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-40";
const SELECT =
  "w-full rounded-md border border-ed-line-strong bg-ed-raised px-2 py-1 text-xs text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:opacity-40";

/**
 * The "Bake" section of the Inspector (editable meshes only): copy the detail of a dense object onto this simple mesh
 * as a normal map, so the simple mesh looks as detailed. Needs the mesh to have a UV map. A running bake shows its
 * progress and can be cancelled; the result is one undo step.
 */
export default function BakeSection({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const scene = useSceneStore((state) => state.scene);
  const setNodeMap = useSceneStore((state) => state.setNodeMap);
  const bake = useBakeStore();
  const targets = shrinkwrapTargets(scene, node.id);
  // The choice may name an object that is gone, or the object itself
  const highId = targets.some((t) => t.id === bake.highId) ? bake.highId : "";
  const running = bake.runningFor !== null;
  const thisRunning = bake.runningFor === node.id;
  const normalMap = node.material.normalMap;

  return (
    <section aria-label="Bake" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Bake detail</h3>
      <div className="space-y-2.5 px-4 pb-4">
        <select
          aria-label="Dense object to copy detail from"
          value={highId}
          disabled={disabled || running}
          onChange={(event) => bake.setChoice({ highId: event.target.value })}
          className={SELECT}
        >
          <option value="">Copy detail from…</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Picture size"
          value={bake.size}
          disabled={disabled || running}
          onChange={(event) =>
            bake.setChoice({ size: Number(event.target.value) })
          }
          className={SELECT}
        >
          {BAKE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} x {size} pixels
            </option>
          ))}
        </select>
        <BrushSlider
          label="Cage size"
          value={bake.cage}
          min={0.01}
          max={0.5}
          step={0.01}
          defaultValue={DEFAULT_CAGE}
          onChange={(cage) => bake.setChoice({ cage })}
        />
        <div className="flex flex-wrap gap-2">
          {thisRunning ? (
            <button type="button" onClick={bake.cancel} className={BUTTON}>
              Cancel baking
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled || running || highId === ""}
              title="Copy the detail of the chosen object onto this one as a normal map (one undo step). This object needs a UV map."
              onClick={() =>
                void bakeNormalMap(node.id, highId, bake.size, bake.cage)
              }
              className={BUTTON}
            >
              Bake normal map
            </button>
          )}
          <button
            type="button"
            disabled={disabled || running || normalMap === null}
            title="Take the baked normal map off the object (Undo brings it back)"
            onClick={() =>
              setNodeMap(node.id, "normalMap", null, "Remove normal map")
            }
            className={BUTTON}
          >
            Remove normal map
          </button>
        </div>
        {thisRunning && (
          <progress
            aria-label="Baking progress"
            value={bake.progress}
            max={1}
            className="w-full"
          />
        )}
        <p className="text-[11px] leading-snug text-ed-text-3">
          Rays go from just outside this surface inwards until they meet the
          dense object; what they find is written into a picture the surface
          then shows as bumps. The cage size is how far out they start (a share
          of this object&apos;s size): make it bigger if parts stay flat. This
          object&apos;s modifiers are not included.
        </p>
      </div>
    </section>
  );
}
