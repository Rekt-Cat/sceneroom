"use client";

import {
  MAX_EXTRUDE_DIVISIONS,
  MAX_EXTRUDE_SCALE,
  MAX_EXTRUDE_TWIST_DEGREES,
  MIN_EXTRUDE_SCALE,
} from "@sceneroom/shared";
import {
  MAX_EXTRUDE_DISTANCE,
  changeExtrude,
  commitExtrude,
  previewExtrude,
  type ExtrudeChange,
} from "@/meshEdit/editOperations";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import OperationField from "./OperationField";

/**
 * The settings of the extrusion or inset that was just made, shown under the edit bar until something else is
 * done: how far it goes (also inwards), how many bands, whether the new face gets smaller or bigger, and a twist.
 * Changing one does the operation again in place (still one undo step).
 */
export default function ExtrudePanel() {
  const session = useEditStore((state) => state.extrude);
  // The panel ends when anything else is done (the undo history grew or changed)
  const current = useSceneStore((state) => state.history.past.length);
  if (!session || current !== session.pastLength) return null;

  // While a value is being dragged it is only shown; when it stops changing it is stored (one undo step)
  const preview = (patch: ExtrudeChange) => void previewExtrude(patch);
  const commit = (final?: ExtrudeChange) =>
    void (final ? changeExtrude(final) : commitExtrude());
  const inset = session.kind === "inset";
  const reach = Math.max(2, Math.abs(session.defaultDistance) * 4);
  return (
    <div
      role="group"
      aria-label={inset ? "Inset settings" : "Extrude settings"}
      className="mt-1 flex flex-col gap-1.5 border-t border-ed-line pt-2"
    >
      <span className="font-semibold text-ed-text">
        {inset ? "Inset settings" : "Extrude settings"}
      </span>
      <OperationField
        label={inset ? "Depth" : "Distance"}
        hint={
          inset
            ? "How far the new face is pushed out (more than 0) or in (less than 0). 0 keeps it level with the old face."
            : "How far the new face is pushed out. A negative number pushes it in, into a recess."
        }
        value={session.distance}
        min={-reach}
        max={reach}
        step={0.05}
        defaultValue={session.defaultDistance}
        onPreview={(value) =>
          preview({ distance: Math.min(MAX_EXTRUDE_DISTANCE, value) })
        }
        onCommit={(value) =>
          commit(value === undefined ? undefined : { distance: value })
        }
      />
      <OperationField
        label="Divisions"
        hint="Cut the extruded part into this many bands along its length (more bands = more places to bend or taper later)."
        value={session.options.divisions}
        min={1}
        max={MAX_EXTRUDE_DIVISIONS}
        step={1}
        defaultValue={session.defaultOptions.divisions}
        onPreview={(value) => preview({ divisions: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { divisions: value })
        }
      />
      <OperationField
        label={inset ? "Face size" : "Scale"}
        hint={
          inset
            ? "How big the new face is compared with the old one. Smaller leaves a wider border round it."
            : "Make the new face smaller (a tapering stalk, 50% = half as wide) or bigger (a flare). 100% keeps it the same."
        }
        value={session.options.scale}
        min={MIN_EXTRUDE_SCALE}
        max={MAX_EXTRUDE_SCALE}
        step={0.05}
        unit="%"
        show={(v) => v * 100}
        defaultValue={session.defaultOptions.scale}
        onPreview={(value) => preview({ scale: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { scale: value })
        }
      />
      <OperationField
        label="Twist"
        hint="Turn the new face round its direction, like wringing a cloth. The walls twist with it."
        value={session.options.twistDegrees}
        min={-MAX_EXTRUDE_TWIST_DEGREES}
        max={MAX_EXTRUDE_TWIST_DEGREES}
        step={5}
        unit="°"
        defaultValue={session.defaultOptions.twistDegrees}
        onPreview={(value) => preview({ twistDegrees: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { twistDegrees: value })
        }
      />
      <p className="text-ed-text-3">
        {inset
          ? "Tip: inset a face, then set Depth to push the smaller face out (a button, a window frame) or in (a recess)."
          : "To build a column or a leg: set Scale to about 50%, then press Extrude again on the new end."}
      </p>
    </div>
  );
}
