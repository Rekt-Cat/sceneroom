"use client";

import { PRIMITIVE_KINDS, type PrimitiveKind } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { overlayButton } from "./buttonStyle";

const KIND_LABELS: Record<PrimitiveKind, string> = {
  cube: "Cube",
  sphere: "Sphere",
  cylinder: "Cylinder",
  plane: "Plane",
  cone: "Cone",
};

/** Buttons that add a new object to the scene (and select it). */
export default function AddToolbar() {
  const addPrimitive = useSceneStore((state) => state.addPrimitive);

  return (
    <div
      role="toolbar"
      aria-label="Add object"
      className="absolute top-3 left-3 flex flex-col gap-1 rounded-lg bg-zinc-900/90 p-1 text-zinc-200 shadow-lg"
    >
      <span className="px-3 pt-1 text-xs tracking-wide text-zinc-400 uppercase">
        Add
      </span>
      {PRIMITIVE_KINDS.map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => addPrimitive(kind)}
          className={`${overlayButton} text-left hover:bg-zinc-700`}
        >
          {KIND_LABELS[kind]}
        </button>
      ))}
    </div>
  );
}
