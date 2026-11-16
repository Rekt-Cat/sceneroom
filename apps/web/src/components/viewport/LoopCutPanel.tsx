"use client";

import {
  DEFAULT_LOOP_CUT_OPTIONS,
  MAX_LOOP_CUTS,
  type LoopCutOptions,
} from "@sceneroom/shared";
import {
  changeLoopCut,
  commitLoopCut,
  previewLoopCut,
} from "@/meshEdit/editOperations";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import OperationField from "./OperationField";

/**
 * The settings of the loop cut that was just made, shown under the edit bar until something else is done: how
 * many new loops, and how far they slide towards one end. Changing one does the cut again in place (still one
 * undo step); while a slider is dragged it is only shown, and stored when it is let go.
 */
export default function LoopCutPanel() {
  const session = useEditStore((state) => state.loopCut);
  // The panel ends when anything else is done (the undo history grew or changed)
  const current = useSceneStore((state) => state.history.past.length);
  if (!session || current !== session.pastLength) return null;

  const preview = (patch: Partial<LoopCutOptions>) =>
    void previewLoopCut(patch);
  const commit = (final?: Partial<LoopCutOptions>) =>
    void (final ? changeLoopCut(final) : commitLoopCut());
  return (
    <div
      role="group"
      aria-label="Loop cut settings"
      className="mt-1 flex flex-col gap-1.5 border-t border-ed-line pt-2"
    >
      <span className="font-semibold text-ed-text">Loop cut settings</span>
      <OperationField
        label="Cuts"
        hint="How many new rings of edges to add across the strip (evenly spaced)."
        value={session.options.cuts}
        min={1}
        max={MAX_LOOP_CUTS}
        step={1}
        defaultValue={DEFAULT_LOOP_CUT_OPTIONS.cuts}
        onPreview={(value) => preview({ cuts: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { cuts: value })
        }
      />
      <OperationField
        label="Slide"
        hint="Move the new loops towards one end of the edges they cross. 0 keeps them halfway."
        value={session.options.slide}
        min={-1}
        max={1}
        step={0.05}
        unit="%"
        show={(v) => v * 100}
        defaultValue={DEFAULT_LOOP_CUT_OPTIONS.slide}
        onPreview={(value) => preview({ slide: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { slide: value })
        }
      />
      <p className="text-ed-text-3">
        The new points are selected: press R to scale them (a waist), or W to
        slide them.
      </p>
    </div>
  );
}
