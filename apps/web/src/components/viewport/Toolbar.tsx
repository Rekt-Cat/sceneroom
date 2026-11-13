"use client";

import { TRANSFORM_MODES, type TransformMode } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { overlayButton } from "./buttonStyle";

const MODE_LABELS: Record<TransformMode, string> = {
  translate: "Move (W)",
  rotate: "Rotate (E)",
  scale: "Scale (R)",
};

/** Small overlay with the gizmo mode buttons and the snap switch. */
export default function Toolbar() {
  const mode = useSceneStore((state) => state.transformMode);
  const snapEnabled = useSceneStore((state) => state.snapEnabled);
  const setTransformMode = useSceneStore((state) => state.setTransformMode);
  const toggleSnap = useSceneStore((state) => state.toggleSnap);

  return (
    <div
      role="toolbar"
      aria-label="Transform tools"
      className="absolute top-3 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg bg-zinc-900/90 p-1 text-zinc-200 shadow-lg"
    >
      {TRANSFORM_MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={m === mode}
          onClick={() => setTransformMode(m)}
          className={`${overlayButton} ${
            m === mode ? "bg-sky-600 text-white" : "hover:bg-zinc-700"
          }`}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={snapEnabled}
        onClick={toggleSnap}
        className={`${overlayButton} ml-1 border border-zinc-600 ${
          snapEnabled ? "bg-zinc-700" : "hover:bg-zinc-800"
        }`}
      >
        Snap {snapEnabled ? "on" : "off"} (X · hold Shift)
      </button>
    </div>
  );
}
