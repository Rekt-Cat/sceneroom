"use client";

import { useRef } from "react";
import {
  APP_NAME,
  SCENE_FILE_EXTENSION,
  nextRedoLabel,
  nextUndoLabel,
} from "@sceneroom/shared";
import {
  openSceneFromFile,
  saveSceneToFile,
} from "@/sceneFile/sceneFileActions";
import { useImportStore } from "@/store/importStore";
import {
  usePersistenceStore,
  type PersistenceStatus,
} from "@/store/persistenceStore";
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

/** What to show for each state of saving: the words, the colour of the dot and a longer explanation. */
const SAVE_STATUS: Record<
  PersistenceStatus,
  { text: string; dot: string; help: string }
> = {
  loading: {
    text: "Loading…",
    dot: "bg-ed-text-3",
    help: "Looking for the scene saved in this browser",
  },
  saving: {
    text: "Saving…",
    dot: "bg-ed-select",
    help: "Your latest change is being saved in this browser",
  },
  saved: {
    text: "All changes saved",
    dot: "bg-ed-y",
    help: "Saved in this browser. It will be here when you come back.",
  },
  error: {
    text: "Could not save",
    dot: "bg-[#e5545f]",
    help: "The latest changes are not saved. See the message at the top of the 3D view.",
  },
  unavailable: {
    text: "Not saved",
    dot: "bg-[#e5545f]",
    help: "This browser is not allowing saving, so the scene is lost when the page closes",
  },
};

/** The small "All changes saved" text with a coloured dot. */
function SaveStatus() {
  const status = usePersistenceStore((state) => state.status);
  const { text, dot, help } = SAVE_STATUS[status];
  return (
    <span
      role="status"
      title={help}
      className="ml-1 flex items-center gap-1.5 text-xs text-ed-text-3"
    >
      <span className={`size-[7px] rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

const FILE_BUTTON =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-sm text-ed-text-2 transition-colors hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-wait disabled:opacity-60";

/** "Open" and "Save": the scene (and the models in it) as a file you can keep and send. */
function FileButtons() {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useImportStore((state) => state.busy);
  return (
    <div className="flex gap-0.5">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Open a scene file (.sceneroom), or drop one onto the 3D view"
        className={FILE_BUTTON}
      >
        <Icon name="open" />
        Open
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveSceneToFile()}
        title="Save the scene as a file you can keep and send (Ctrl or Cmd + S)"
        className={FILE_BUTTON}
      >
        <Icon name="save" />
        Save
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={SCENE_FILE_EXTENSION}
        className="hidden"
        aria-label="Choose a scene file to open"
        onChange={(event) => {
          const [file] = Array.from(event.target.files ?? []);
          // Empty the box, so choosing the same file again still counts as a change
          event.target.value = "";
          if (file) void openSceneFromFile(file);
        }}
      />
    </div>
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
      <FileButtons />
      <span className="h-5 w-px bg-ed-line-strong" aria-hidden="true" />
      <span className="text-sm text-ed-text-3">Untitled scene</span>
      <SaveStatus />
    </header>
  );
}
