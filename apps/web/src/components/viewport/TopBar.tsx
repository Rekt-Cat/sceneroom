"use client";

import { APP_NAME, nextRedoLabel, nextUndoLabel } from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { Icon, type IconName } from "./icons";

const historyButton =
  "grid size-[30px] place-items-center rounded-md text-ed-text-2 transition-colors hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:text-ed-text-3 disabled:opacity-50 disabled:hover:bg-transparent";

function HistoryButton({
  icon,
  verb,
  label,
  shortcut,
  onClick,
}: {
  icon: IconName;
  verb: "Undo" | "Redo";
  /** What would be undone or redone, or null if nothing. */
  label: string | null;
  shortcut: string;
  onClick: () => void;
}) {
  const text = label
    ? `${verb} ${label.toLowerCase()}`
    : `Nothing to ${verb.toLowerCase()}`;
  return (
    <button
      type="button"
      disabled={label === null}
      onClick={onClick}
      aria-label={text}
      title={label ? `${text} (${shortcut})` : text}
      className={historyButton}
    >
      <Icon name={icon} />
    </button>
  );
}

/** Bar across the top of the editor: logo, Undo and Redo, and the scene name (plain text for now). */
export default function TopBar() {
  const undoLabel = useSceneStore((state) => nextUndoLabel(state.history));
  const redoLabel = useSceneStore((state) => nextRedoLabel(state.history));
  const undo = useSceneStore((state) => state.undo);
  const redo = useSceneStore((state) => state.redo);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-ed-line bg-ed-panel px-3.5">
      <span className="grid size-[26px] place-items-center rounded-[7px] bg-linear-to-br from-[#6f80ff] to-[#4152d4] text-white">
        <Icon name="cube" />
      </span>
      <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
      <span className="h-5 w-px bg-ed-line-strong" aria-hidden="true" />
      <div className="flex gap-0.5">
        <HistoryButton
          icon="undo"
          verb="Undo"
          label={undoLabel}
          shortcut="Ctrl or Cmd + Z"
          onClick={undo}
        />
        <HistoryButton
          icon="redo"
          verb="Redo"
          label={redoLabel}
          shortcut="Ctrl or Cmd + Shift + Z"
          onClick={redo}
        />
      </div>
      <span className="h-5 w-px bg-ed-line-strong" aria-hidden="true" />
      <span className="text-sm text-ed-text-3">Untitled scene</span>
    </header>
  );
}
