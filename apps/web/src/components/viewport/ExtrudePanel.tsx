"use client";

import {
  DEFAULT_EXTRUDE_OPTIONS,
  MAX_EXTRUDE_DIVISIONS,
  MAX_EXTRUDE_SCALE,
  MAX_EXTRUDE_TWIST_DEGREES,
  MIN_EXTRUDE_SCALE,
} from "@sceneroom/shared";
import {
  MAX_EXTRUDE_DISTANCE,
  MIN_EXTRUDE_DISTANCE,
  changeExtrude,
  commitExtrude,
  previewExtrude,
  type ExtrudeChange,
} from "@/meshEdit/editOperations";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";
import OperationField from "./OperationField";

/**
 * The settings of the extrusion that was just made, shown under the edit bar until something else is done:
 * how far it goes, how many bands, whether the new face gets smaller or bigger, and a twist. Changing one
 * does the extrusion again in place (still one undo step).
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
  return (
    <div
      role="group"
      aria-label="Extrude settings"
      className="mt-1 flex flex-col gap-1.5 border-t border-ed-line pt-2"
    >
      <span className="font-semibold text-ed-text">Extrude settings</span>
      <OperationField
        label="Distance"
        hint="How far the new face is pushed out."
        value={session.distance}
        min={MIN_EXTRUDE_DISTANCE}
        max={Math.max(5, session.defaultDistance * 4)}
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
        defaultValue={DEFAULT_EXTRUDE_OPTIONS.divisions}
        onPreview={(value) => preview({ divisions: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { divisions: value })
        }
      />
      <OperationField
        label="Scale"
        hint="Make the new face smaller (a tapering stalk, 50% = half as wide) or bigger (a flare). 100% keeps it the same."
        value={session.options.scale}
        min={MIN_EXTRUDE_SCALE}
        max={MAX_EXTRUDE_SCALE}
        step={0.05}
        unit="%"
        show={(v) => v * 100}
        defaultValue={DEFAULT_EXTRUDE_OPTIONS.scale}
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
        defaultValue={DEFAULT_EXTRUDE_OPTIONS.twistDegrees}
        onPreview={(value) => preview({ twistDegrees: value })}
        onCommit={(value) =>
          commit(value === undefined ? undefined : { twistDegrees: value })
        }
      />
      <p className="text-ed-text-3">
        To build a column or a leg: set Scale to about 50%, then press Extrude
        again on the new end.
      </p>
    </div>
  );
}
