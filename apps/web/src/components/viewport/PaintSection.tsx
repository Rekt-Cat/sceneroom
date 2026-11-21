"use client";

import { useEffect } from "react";
import { BRUSH_LIMITS, DEFAULT_BRUSH, type SceneNode } from "@sceneroom/shared";
import { startPaint, stopPaint, syncPaintWith } from "@/paint/paintSession";
import { useEditStore } from "@/store/editStore";
import { usePaintStore } from "@/store/paintStore";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";

const sectionTitle =
  "px-4 pt-3.5 pb-2 text-[11px] font-semibold tracking-widest text-ed-text-3 uppercase";
const RESET_BUTTON =
  "grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent";
const BUTTON =
  "rounded-md border border-ed-line-strong bg-ed-raised px-2.5 py-1 text-xs font-medium text-ed-text hover:brightness-110 focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-40";

/**
 * The "Paint" section of the Inspector (editable meshes only): a button that turns paint mode on, and the brush
 * (colour, size, hardness, strength, each with its own reset button) while it is on. Dragging the left mouse button
 * over the object paints; the right button still turns the camera. Each stroke is one undo step.
 */
export default function PaintSection({
  node,
  disabled,
}: {
  node: SceneNode;
  disabled: boolean;
}) {
  const active = usePaintStore((state) => state.nodeId === node.id);
  const brush = usePaintStore();
  const setColorMap = useSceneStore((state) => state.setNodeColorMap);
  const colorMap = node.material.colorMap;

  // Undo and Redo change which picture the object uses: show it in the session too
  useEffect(() => {
    if (active) void syncPaintWith(colorMap);
  }, [active, colorMap]);

  // Starting to edit points ends paint mode (clicks on the surface are for picking points then)
  const editing = useEditStore((state) => state.nodeId !== null);
  useEffect(() => {
    if (editing) void stopPaint();
  }, [editing]);

  // Escape ends paint mode; selecting something else (this panel goes away) ends it too
  useEffect(() => {
    if (!active) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") void stopPaint();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);
  useEffect(() => {
    return () => {
      void stopPaint();
    };
  }, [node.id]);

  return (
    <section aria-label="Paint" className="border-t border-ed-line">
      <h3 className={sectionTitle}>Paint</h3>
      <div className="space-y-2.5 px-4 pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title="Paint on the surface with the left mouse button. The object needs a UV map (Edit points, UV window, Unwrap)."
            onClick={() => void (active ? stopPaint() : startPaint(node.id))}
            className={BUTTON}
          >
            {active ? "Stop painting" : "Paint on surface"}
          </button>
          <button
            type="button"
            disabled={disabled || colorMap === null}
            title="Take the painting off the object (Undo brings it back)"
            onClick={() => setColorMap(node.id, null, "Remove painting")}
            className={BUTTON}
          >
            Remove painting
          </button>
        </div>
        {active && (
          <>
            <div className="grid grid-cols-[58px_1fr_26px] items-center gap-2">
              <span className="text-xs text-ed-text-2">Brush colour</span>
              <input
                type="color"
                value={brush.color}
                aria-label="Brush colour"
                onChange={(event) =>
                  brush.setBrush({ color: event.target.value })
                }
                className="size-[26px] cursor-pointer appearance-none rounded-md border-2 border-ed-line-strong bg-transparent p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
              />
              <ResetButton
                label="brush colour"
                hidden={brush.color === DEFAULT_BRUSH.color}
                onClick={() => brush.setBrush({ color: DEFAULT_BRUSH.color })}
              />
            </div>
            <BrushSlider
              label="Brush size"
              value={brush.radius}
              min={BRUSH_LIMITS.minRadius}
              max={BRUSH_LIMITS.maxRadius}
              step={1}
              defaultValue={DEFAULT_BRUSH.radius}
              onChange={(radius) => brush.setBrush({ radius })}
            />
            <BrushSlider
              label="Hardness"
              value={brush.hardness}
              min={0}
              max={1}
              step={0.01}
              defaultValue={DEFAULT_BRUSH.hardness}
              onChange={(hardness) => brush.setBrush({ hardness })}
            />
            <BrushSlider
              label="Strength"
              value={brush.opacity}
              min={0.05}
              max={1}
              step={0.01}
              defaultValue={DEFAULT_BRUSH.opacity}
              onChange={(opacity) => brush.setBrush({ opacity })}
            />
            <p className="text-[11px] leading-snug text-ed-text-3">
              Drag with the left mouse button on the object to paint. Right-drag
              turns the camera. Esc stops. Once painted, the picture replaces
              the object&apos;s colour.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function ResetButton({
  label,
  hidden,
  onClick,
}: {
  label: string;
  hidden: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Reset the ${label}`}
      title={`Reset the ${label}`}
      disabled={hidden}
      onClick={onClick}
      className={RESET_BUTTON}
    >
      <Icon name="reset" />
    </button>
  );
}

function BrushSlider({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid grid-cols-[58px_1fr_40px_26px] items-center gap-2">
      <span className="text-xs text-ed-text-2">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-ed-accent"
      />
      <span className="text-right font-mono text-xs text-ed-text-3">
        {step < 1 ? value.toFixed(2) : value}
      </span>
      <ResetButton
        label={label.toLowerCase()}
        hidden={value === defaultValue}
        onClick={() => onChange(defaultValue)}
      />
    </div>
  );
}
