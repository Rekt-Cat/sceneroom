"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_PROJECT_NAME,
  MAX_SCENE_NAME_LENGTH,
  summariseScene,
  unusedModels,
} from "@sceneroom/shared";
import { allScenes, deleteModel, projectModels } from "@/store/libraryActions";
import { useImportStore } from "@/store/importStore";
import { useProjectStore } from "@/store/projectStore";
import { useSceneStore } from "@/store/sceneStore";
import { Icon } from "./icons";

const BUTTON =
  "rounded-md border border-ed-line-strong px-2.5 py-1 text-xs font-medium hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-40";

function tellProblem(text: string | null) {
  if (text) useImportStore.getState().setMessage({ tone: "error", text });
}

/**
 * The project at a glance: its name, every scene with what it holds, and the imported models nothing uses (which
 * can be removed). Opened from the project name in the top bar. Units and default looks for new scenes are still
 * to come (docs/overview/PLAN.md, Phase 5b step 4).
 */
export default function ProjectDialog({ onClose }: { onClose: () => void }) {
  const name = useProjectStore((s) => s.name);
  const tabs = useProjectStore((s) => s.scenes);
  const parked = useProjectStore((s) => s.parked);
  const prefabs = useProjectStore((s) => s.prefabs);
  const activeId = useProjectStore((s) => s.activeSceneId);
  const switchScene = useProjectStore((s) => s.switchScene);
  const renameProject = useProjectStore((s) => s.renameProject);
  // The open scene changes while it is edited: read it from the editor so the numbers are current
  const openScene = useSceneStore((s) => s.scene);
  const [draft, setDraft] = useState(name);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sceneOf = (id: string) =>
    id === activeId ? openScene : parked[id]?.scene;
  const rows = tabs.flatMap((tab) => {
    const scene = sceneOf(tab.id);
    return scene ? [{ tab, summary: summariseScene(scene) }] : [];
  });
  const total = rows.reduce(
    (sum, { summary }) => ({
      objects: sum.objects + summary.objects,
      triangles: sum.triangles + summary.triangles,
    }),
    { objects: 0, triangles: 0 },
  );
  // Re-read on every render: `openScene` changing is what triggers it
  void openScene;
  const models = projectModels();
  const unused = unusedModels(allScenes(), Object.values(prefabs), models);

  const saveName = () => {
    if (draft === name) return;
    const problem = renameProject(draft);
    if (problem) {
      tellProblem(problem);
      setDraft(name);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Project overview"
        className="flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl border border-ed-line-strong bg-ed-panel p-5 text-sm shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Project</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="grid size-7 place-items-center rounded-md text-ed-text-2 hover:bg-ed-raised focus-visible:outline-2 focus-visible:outline-ed-accent"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-ed-text-3">Name</span>
          <span className="flex items-center gap-1.5">
            <input
              ref={first}
              value={draft}
              maxLength={MAX_SCENE_NAME_LENGTH}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="h-8 flex-1 rounded-md border border-ed-line-strong bg-ed-field px-2"
            />
            <button
              type="button"
              title="Reset the name"
              aria-label="Reset the name"
              disabled={name === DEFAULT_PROJECT_NAME}
              onClick={() => {
                setDraft(DEFAULT_PROJECT_NAME);
                tellProblem(renameProject(DEFAULT_PROJECT_NAME));
              }}
              className="grid size-7 place-items-center rounded-md text-ed-text-3 hover:bg-ed-field hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Icon name="reset" />
            </button>
          </span>
        </label>

        <section aria-label="Scenes">
          <h3 className="mb-1.5 text-ed-text-3">
            Scenes ({rows.length}) · {total.objects.toLocaleString("en-US")}{" "}
            objects
          </h3>
          <ul className="flex flex-col divide-y divide-ed-line rounded-md border border-ed-line">
            {rows.map(({ tab, summary }) => (
              <li key={tab.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {tab.name}
                  {tab.prefabId && (
                    <span className="ml-2 rounded bg-ed-field px-1.5 text-[11px] font-normal text-ed-text-3">
                      prefab
                    </span>
                  )}
                  {tab.id === activeId && (
                    <span className="ml-2 text-[11px] font-normal text-ed-text-3">
                      open
                    </span>
                  )}
                </span>
                <span className="text-xs text-ed-text-3">
                  {summary.objects} object{summary.objects === 1 ? "" : "s"}
                  {summary.lights > 0
                    ? ` · ${summary.lights} light${summary.lights === 1 ? "" : "s"}`
                    : ""}
                  {summary.prefabInstances > 0
                    ? ` · ${summary.prefabInstances} prefab copies`
                    : ""}
                  {summary.triangles > 0
                    ? ` · ${summary.triangles.toLocaleString("en-US")} triangles`
                    : ""}
                </span>
                <button
                  type="button"
                  disabled={tab.id === activeId}
                  onClick={() => {
                    switchScene(tab.id);
                    onClose();
                  }}
                  className={BUTTON}
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Library">
          <h3 className="mb-1.5 text-ed-text-3">
            Library: {models.length} imported model
            {models.length === 1 ? "" : "s"} · {Object.keys(prefabs).length}{" "}
            prefab{Object.keys(prefabs).length === 1 ? "" : "s"}
          </h3>
          {unused.length === 0 ? (
            <p className="text-xs text-ed-text-3">
              Every imported model is used somewhere. Nothing to clean up.
            </p>
          ) : (
            <div className="flex flex-col gap-2 rounded-md border border-ed-line p-3">
              <p className="text-xs text-ed-text-2">
                {unused.length} model{unused.length === 1 ? " is" : "s are"} not
                used by any scene or prefab:{" "}
                {unused.map((model) => model.name).join(", ")}.
              </p>
              <button
                type="button"
                onClick={() => {
                  for (const model of unused)
                    tellProblem(deleteModel(model.id));
                }}
                className={`${BUTTON} self-start`}
                title="Takes them out of the Assets tab. Nothing in any scene changes, because nothing uses them."
              >
                Remove {unused.length} unused model
                {unused.length === 1 ? "" : "s"}
              </button>
            </div>
          )}
        </section>

        <p className="text-xs text-ed-text-3">
          Coming later: units, and a default look for new scenes.
        </p>
      </div>
    </div>
  );
}
