"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AccountButton from "./AccountButton";
import OnlineProjects from "./OnlineProjects";
import {
  APP_NAME,
  MAX_LOCAL_PROJECTS,
  MAX_SCENE_NAME_LENGTH,
  SCENE_FILE_EXTENSION,
  SCENE_TEMPLATES,
  SCENE_TEMPLATE_INFO,
  availableSceneName,
  normalizeSceneName,
  searchEntries,
  sortEntries,
  type ProjectEntry,
  type ProjectSort,
} from "@sceneroom/shared";
import { setAssetStorage } from "@/assets/assetStorage";
import { IndexedDbAssetStorage } from "@/persistence/assetStorageIdb";
import { describeStorageError, openDatabase } from "@/persistence/idb";
import { IndexedDbProjectLibrary } from "@/persistence/projectLibrary";
import { useImportStore } from "@/store/importStore";
import {
  createNewProject,
  exportProjectFile,
  importProject,
  type HomeResult,
} from "@/home/homeActions";
import ImportBanner from "../viewport/ImportBanner";
import ProjectCard from "./ProjectCard";

/** The number of projects from which the search box and the sort choice appear (a short list does not need them). */
const SEARCH_FROM = 5;

type Loaded =
  | { state: "loading" }
  | { state: "unavailable"; text: string }
  | {
      state: "ready";
      library: IndexedDbProjectLibrary;
      entries: ProjectEntry[];
      problem: string | null;
    };

/**
 * The screen before a project opens: every project as a card (picture, name, last edit, scenes), a card to make a
 * new one, a way to open a file, and a menu on each card. Projects live in this browser for now; sharing with other
 * people comes with accounts (docs/overview/PLAN.md, Phase 5c).
 */
export default function HomeScreen() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [pictures, setPictures] = useState<Record<string, string | null>>({});
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const tell = useImportStore((s) => s.setMessage);

  // Open the browser's storage, move the old single project over on the first run, and list the projects
  useEffect(() => {
    let closed = false;
    let database: IDBDatabase | null = null;
    void (async () => {
      try {
        database = await openDatabase();
        if (closed) {
          database.close();
          return;
        }
        // Imported model files are kept here too (opening a file puts its models in)
        setAssetStorage(new IndexedDbAssetStorage(database));
        const library = new IndexedDbProjectLibrary(database);
        const listing = await library.list();
        if (closed) return;
        setLoaded({ state: "ready", library, ...listing });
        const found = await Promise.all(
          listing.entries.map(
            async (e) => [e.id, await library.thumbnail(e.id)] as const,
          ),
        );
        if (!closed) setPictures(Object.fromEntries(found));
      } catch (error) {
        console.warn("Browser storage is not available:", error);
        if (!closed) {
          setLoaded({
            state: "unavailable",
            text: `${describeStorageError(error)} Projects cannot be kept in this browser.`,
          });
        }
      }
    })();
    return () => {
      closed = true;
      database?.close();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (loaded.state !== "ready") return;
    const listing = await loaded.library.list();
    setLoaded({ ...loaded, ...listing });
  }, [loaded]);

  /** Runs an action, shows what went wrong, and opens the project it made. */
  async function act(run: () => Promise<HomeResult>, openAfter = false) {
    if (busy) return;
    setBusy(true);
    tell(null);
    try {
      const result = await run();
      if (!result.ok) {
        if (result.text) tell({ tone: "error", text: result.text });
        return;
      }
      if (result.note) tell({ tone: "info", text: result.note });
      if (openAfter && result.id) router.push(`/p/${result.id}`);
      else await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loaded.state === "loading") {
    return (
      <Shell>
        {<p className="text-ed-text-3">Looking for your projects…</p>}
      </Shell>
    );
  }
  if (loaded.state === "unavailable") {
    return (
      <Shell>
        <p role="alert" className="text-ed-danger">
          {loaded.text}
        </p>
      </Shell>
    );
  }

  const { library, entries, problem } = loaded;
  const shown = sortEntries(searchEntries(entries, search), sort);
  const full = entries.length >= MAX_LOCAL_PROJECTS;

  return (
    <Shell>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Your projects</h1>
        <span className="flex-1" />
        {entries.length >= SEARCH_FROM && (
          <>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects"
              aria-label="Search projects"
              className="h-8 w-52 rounded-md border border-ed-line-strong bg-ed-field px-2.5 text-sm"
            />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ProjectSort)}
              aria-label="Sort projects"
              className="h-8 rounded-md border border-ed-line-strong bg-ed-field px-2 text-sm"
            >
              <option value="recent">Last edited</option>
              <option value="name">Name</option>
            </select>
          </>
        )}
        <button
          type="button"
          disabled={busy || full}
          onClick={() => fileInput.current?.click()}
          title="Open a project file (.sceneroom) as a new project"
          className="h-8 rounded-md border border-ed-line-strong px-3 text-sm font-medium hover:bg-ed-raised focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Open file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={SCENE_FILE_EXTENSION}
          className="hidden"
          aria-label="Choose a project file to open"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (file)
              void act(() => importProject(library, entries, file), true);
          }}
        />
      </div>

      {problem && (
        <p role="alert" className="mb-3 text-sm text-ed-danger">
          {problem}
        </p>
      )}

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4">
        <li>
          <div className="flex h-full min-h-56 flex-col justify-between rounded-xl border-2 border-dashed border-ed-line-strong p-4">
            <div>
              <button
                type="button"
                disabled={busy || full}
                onClick={() =>
                  void act(() => createNewProject(library, entries), true)
                }
                className="w-full rounded-lg bg-ed-accent px-3 py-3 text-base font-semibold text-white hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                + New project
              </button>
              {full && (
                <p className="mt-2 text-xs text-ed-text-3">
                  This browser holds at most {MAX_LOCAL_PROJECTS} projects.
                  Delete one first.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs text-ed-text-3">Or start from</p>
              <div className="flex flex-wrap gap-1.5">
                {SCENE_TEMPLATES.filter((t) => t !== "blank").map(
                  (template) => (
                    <button
                      key={template}
                      type="button"
                      disabled={busy || full}
                      title={SCENE_TEMPLATE_INFO[template].help}
                      onClick={() =>
                        void act(
                          () => createNewProject(library, entries, template),
                          true,
                        )
                      }
                      className="rounded-md border border-ed-line-strong px-2 py-1 text-xs hover:bg-ed-raised focus-visible:outline-2 focus-visible:outline-ed-accent disabled:opacity-50"
                    >
                      {SCENE_TEMPLATE_INFO[template].label}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        </li>
        {shown.map((entry) => (
          <li key={entry.id}>
            <ProjectCard
              entry={entry}
              picture={pictures[entry.id] ?? null}
              onRename={(name) =>
                act(async () => {
                  const clean = normalizeSceneName(name);
                  if (clean === null)
                    return { ok: false, text: "The project needs a name." };
                  const taken = entries.filter((e) => e.id !== entry.id);
                  const unique = availableSceneName(taken, clean);
                  const read = await library.load(entry.id);
                  if (read.status !== "loaded") {
                    return {
                      ok: false,
                      text: "That project could not be read.",
                    };
                  }
                  await library.save(entry.id, {
                    ...read.project,
                    name: unique,
                  });
                  return { ok: true };
                })
              }
              onDuplicate={() =>
                act(async () => {
                  const id = await library.duplicate(entry.id);
                  return id
                    ? { ok: true }
                    : { ok: false, text: "That project could not be read." };
                })
              }
              onExport={() => act(() => exportProjectFile(library, entry.id))}
              onDelete={() => {
                if (
                  !window.confirm(
                    `Delete "${entry.name}"? This cannot be undone. Export it as a file first if you want to keep a copy.`,
                  )
                )
                  return;
                void act(async () => {
                  await library.remove(entry.id);
                  return { ok: true };
                });
              }}
            />
          </li>
        ))}
      </ul>

      {entries.length === 0 && (
        <p className="mt-6 text-sm text-ed-text-3">
          Make your first project: press + New project. It opens a blank scene
          with a ground to build on.
        </p>
      )}
      {entries.length > 0 && shown.length === 0 && (
        <p className="mt-6 text-sm text-ed-text-3">
          No project has “{search}” in its name.
        </p>
      )}
      <OnlineProjects />
      <div className="pointer-events-none fixed bottom-4 left-1/2 -translate-x-1/2 *:pointer-events-auto">
        <ImportBanner />
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-ed-bg text-ed-text">
      <header className="flex h-12 items-center gap-2 border-b border-ed-line bg-ed-panel px-5">
        <span className="text-sm font-semibold tracking-tight">{APP_NAME}</span>
        <AccountButton />
      </header>
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </main>
  );
}

// Kept so the name limit used by the rename box on the cards stays in one place
export const NAME_LIMIT = MAX_SCENE_NAME_LENGTH;
