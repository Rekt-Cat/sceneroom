"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  MAX_SCENE_NAME_LENGTH,
  initialsOf,
  timeAgo,
  type ProjectEntry,
} from "@sceneroom/shared";

const MENU_ITEM =
  "block w-full px-3 py-1.5 text-left text-sm hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50";

function subscribeMinute(onChange: () => void): () => void {
  const timer = setInterval(onChange, 60_000);
  return () => clearInterval(timer);
}

/** The time, to the minute: null while the page is made on the server, then the real time, refreshed every minute. */
function useMinuteClock(): number | null {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / 60_000) * 60_000,
    () => null,
  );
}

/**
 * One project on the home screen: its picture (or the first letters of its name when it has none yet), its name,
 * when it was last edited and how many scenes it has. Clicking it opens the project; the ⋯ menu has the rest.
 */
export default function ProjectCard({
  entry,
  picture,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: {
  entry: ProjectEntry;
  picture: string | null;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const wrapper = useRef<HTMLDivElement>(null);
  // "5 minutes ago" is worked out in the browser (the server's clock would differ) and refreshed every minute
  const now = useMinuteClock();

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setMenu(false);
      } else if (!wrapper.current?.contains(event.target as Node)) {
        setMenu(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);

  return (
    <div
      ref={wrapper}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-ed-line bg-ed-panel hover:border-ed-line-strong"
    >
      <Link
        href={`/p/${entry.id}`}
        aria-label={`Open ${entry.name}`}
        className="block aspect-video bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small picture kept in this browser, not a file Next can optimise
          <img src={picture} alt="" className="size-full object-cover" />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-full place-items-center text-3xl font-semibold text-ed-text-3"
          >
            {initialsOf(entry.name)}
          </span>
        )}
      </Link>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              value={draft}
              maxLength={MAX_SCENE_NAME_LENGTH}
              aria-label="Project name"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => {
                setRenaming(false);
                if (draft !== entry.name) onRename(draft);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setDraft(entry.name);
                  setRenaming(false);
                }
              }}
              className="h-7 w-full rounded border border-ed-line-strong bg-ed-field px-1.5 text-sm"
            />
          ) : (
            <Link
              href={`/p/${entry.id}`}
              className="block truncate text-sm font-medium hover:underline"
            >
              {entry.name}
            </Link>
          )}
          <p className="mt-0.5 text-xs text-ed-text-3">
            {now === null ? "" : `Edited ${timeAgo(now, entry.updatedAt)} · `}
            {entry.scenes} scene{entry.scenes === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          aria-label={`More for ${entry.name}`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((open) => !open)}
          className="grid size-7 shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
        >
          <span aria-hidden="true">⋯</span>
        </button>
      </div>
      {menu && (
        <div
          role="menu"
          aria-label={`Project ${entry.name}`}
          className="absolute right-2 bottom-12 z-10 w-44 overflow-hidden rounded-lg border border-ed-line-strong bg-ed-panel py-1 shadow-xl shadow-black/50"
        >
          <button
            role="menuitem"
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              setMenu(false);
              setDraft(entry.name);
              setRenaming(true);
            }}
          >
            Rename
          </button>
          <button
            role="menuitem"
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              setMenu(false);
              onDuplicate();
            }}
          >
            Duplicate
          </button>
          <button
            role="menuitem"
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              setMenu(false);
              onExport();
            }}
          >
            Export file
          </button>
          <button
            role="menuitem"
            type="button"
            disabled
            title="Sharing with other people comes with accounts. Until then, export a file and send it."
            className={MENU_ITEM}
          >
            Share…
          </button>
          <button
            role="menuitem"
            type="button"
            className={`${MENU_ITEM} text-ed-danger`}
            onClick={() => {
              setMenu(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
