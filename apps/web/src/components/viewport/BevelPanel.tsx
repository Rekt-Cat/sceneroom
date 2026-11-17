"use client";

import {
  BEVEL_MAX_SEGMENTS,
  changeBevel,
  commitBevel,
  previewBevel,
} from "@/meshEdit/editOperations";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import OperationField from "./OperationField";

/**
 * The settings of the bevel that was just made, shown under the edit bar until something else is done: how wide
 * it is, and how many segments (1 is a flat chamfer, more is rounder). Same live behaviour as the loop cut panel.
 */
export default function BevelPanel() {
  const session = useEditStore((state) => state.bevel);
  const current = useSceneStore((state) => state.history.past.length);
  if (!session || current !== session.pastLength) return null;

  const commit = (final?: { width?: number; segments?: number }) =>
    void (final ? changeBevel(final) : commitBevel());
  return (
    <div
      role="group"
      aria-label="Bevel settings"
      className="mt-1 flex flex-col gap-1.5 border-t border-ed-line pt-2"
    >
      <span className="font-semibold text-ed-text">Bevel settings</span>
      <OperationField
        label="Width"
        hint="How far the bevel reaches across the faces on each side of the edge."
        value={session.width}
        min={session.maxWidth * 0.01}
        max={session.maxWidth}
        step={session.maxWidth / 100}
        defaultValue={session.defaultWidth}
        onPreview={(value) => void previewBevel({ width: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { width: value })
        }
      />
      <OperationField
        label="Segments"
        hint="1 is a flat cut (chamfer). More segments make the corner rounder."
        value={session.segments}
        min={1}
        max={BEVEL_MAX_SEGMENTS}
        step={1}
        defaultValue={1}
        onPreview={(value) => void previewBevel({ segments: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { segments: value })
        }
      />
      <p className="text-ed-text-3">
        The new strip is selected: press R to scale it or W to slide it.
      </p>
    </div>
  );
}
