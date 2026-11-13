"use client";

import { TRANSFORM_MODES, type TransformMode } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon, type IconName } from "./icons";

const MODES: Record<
  TransformMode,
  { label: string; key: string; icon: IconName }
> = {
  translate: { label: "Move", key: "W", icon: "move" },
  rotate: { label: "Rotate", key: "E", icon: "rotate" },
  scale: { label: "Scale", key: "R", icon: "scale" },
};

const tool =
  "flex h-[34px] items-center gap-2 rounded-lg pr-3 pl-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ed-accent";

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-current/30 px-1.5 font-mono text-[11px] leading-[17px] opacity-70">
      {children}
    </kbd>
  );
}

/** Floating bar at the bottom of the 3D view: Move / Rotate / Scale and the Snap switch. */
export default function ToolDock() {
  const mode = useSceneStore((state) => state.transformMode);
  const snapEnabled = useSceneStore((state) => state.snapEnabled);
  const setTransformMode = useSceneStore((state) => state.setTransformMode);
  const toggleSnap = useSceneStore((state) => state.toggleSnap);

  return (
    <div
      role="toolbar"
      aria-label="Transform tools"
      className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-ed-line-strong bg-ed-panel/90 p-1.5 shadow-xl shadow-black/40 backdrop-blur"
    >
      {TRANSFORM_MODES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={m === mode}
          onClick={() => setTransformMode(m)}
          className={`${tool} ${
            m === mode
              ? "bg-ed-accent text-white"
              : "text-ed-text-2 hover:bg-ed-raised hover:text-ed-text"
          }`}
        >
          <Icon name={MODES[m].icon} />
          {MODES[m].label}
          <Key>{MODES[m].key}</Key>
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-ed-line-strong" aria-hidden="true" />
      <button
        type="button"
        aria-pressed={snapEnabled}
        onClick={toggleSnap}
        title="Snap to steps. Hold Shift while dragging to flip it."
        className={`${tool} ${
          snapEnabled
            ? "bg-ed-accent text-white"
            : "text-ed-text-2 hover:bg-ed-raised hover:text-ed-text"
        }`}
      >
        <Icon name="magnet" />
        Snap
        <Key>X</Key>
      </button>
    </div>
  );
}
