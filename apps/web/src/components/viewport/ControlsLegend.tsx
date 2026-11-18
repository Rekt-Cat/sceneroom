"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./icons";

/** Small card in the corner of the 3D view that lists the mouse controls. It can be folded away. */
const CONTROLS: [string, string][] = [
  ["Left-drag", "Pan"],
  ["Right-drag", "Orbit"],
  ["Scroll", "Zoom"],
  ["Ctrl/Cmd-drag", "Select box"],
  ["F", "Zoom to selection"],
  ["Hold right + WASD QE", "Fly"],
  ["Hold Space", "Four views"],
  ["Right-click", "Menu"],
];

/** Where the choice is remembered (in this browser only). */
const STORAGE_KEY = "sceneroom.controlsLegend.collapsed";

/** Reads whether the card was folded last time. Anything unreadable counts as "not folded". */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage can be blocked (a private window): the card just starts open
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch (error) {
    console.warn("Could not remember the controls card:", error);
  }
}

/** The card listens to its own choice, so folding it re-draws it (and the saved value is read once the page is in the browser). */
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export default function ControlsLegend() {
  // Open on the server and on the first draw; the remembered choice is applied right after
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  const toggle = () => {
    writeCollapsed(!collapsed);
    listeners.forEach((listener) => listener());
  };

  return (
    <section
      aria-label="Mouse and keyboard controls"
      // The card lets clicks through to the 3D view, except on its own button
      // In a narrow view the tool dock is centred over this corner, so the card stands above the dock instead
      className="pointer-events-none absolute bottom-5 left-4 @max-[1080px]:bottom-[88px] rounded-[10px] border border-ed-line bg-ed-panel/85 px-3 py-2 text-xs text-ed-text-2 backdrop-blur"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={collapsed ? "Show the controls" : "Hide the controls"}
        className="pointer-events-auto flex w-full items-center justify-between gap-6 rounded py-0.5 text-sm font-medium text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        Controls
        <Icon
          name={collapsed ? "chevronRight" : "chevronDown"}
          className="size-4 text-ed-text-2"
        />
      </button>
      {!collapsed && (
        <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-3.5 gap-y-0.5">
          {CONTROLS.map(([action, effect]) => (
            <div key={action} className="contents">
              <dt className="font-medium text-ed-text">{action}</dt>
              <dd>{effect}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
