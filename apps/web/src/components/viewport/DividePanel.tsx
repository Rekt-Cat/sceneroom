"use client";

import { MAX_DIVIDE_CUTS } from "@sceneroom/shared";
import {
  changeDivide,
  commitDivide,
  previewDivide,
} from "@/meshEdit/editOperations";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import OperationField from "./OperationField";

/**
 * The setting of Divide, shown under the edit bar when Divide is pressed (and until something else is done): how
 * many cuts across each face (0 changes nothing, 1 splits a square into 4, 2 into 9). The slider does the cutting.
 * Same live behaviour as the other panels.
 */
export default function DividePanel() {
  const session = useEditStore((state) => state.divide);
  const current = useSceneStore((state) => state.history.past.length);
  if (!session || current !== session.pastLength) return null;

  return (
    <div
      role="group"
      aria-label="Divide settings"
      className="mt-1 flex flex-col gap-1.5 border-t border-ed-line pt-2"
    >
      <span className="font-semibold text-ed-text">Divide settings</span>
      <OperationField
        label="Cuts"
        hint="How many lines are cut across each face: 0 changes nothing, 1 splits a square into 4, 2 into 9, 3 into 16."
        value={session.cuts}
        min={0}
        max={MAX_DIVIDE_CUTS}
        step={1}
        defaultValue={0}
        onPreview={(value) => void previewDivide(value)}
        onCommit={(value) =>
          void (value === undefined ? commitDivide() : changeDivide(value))
        }
      />
      <p className="text-ed-text-3">
        Drag Cuts to divide. The shape does not change; there are only more
        points to work with (Bend, Twist and Taper curve more smoothly, and so
        does Smooth).
      </p>
    </div>
  );
}
