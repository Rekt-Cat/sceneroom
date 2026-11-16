"use client";

import { useMemo, useState } from "react";
import {
  ASSET_NOTE_MAX_LENGTH,
  NODE_NAME_MAX_LENGTH,
  collectProjectModels,
  prefabUsage,
  projectAssetUsage,
  type AssetInfo,
  type Prefab,
} from "@sceneroom/shared";
import {
  deleteModel,
  deletePrefab,
  editPrefab,
  placeLibraryItem,
  renameModel,
  renamePrefab,
  setModelNote,
} from "@/store/libraryActions";
import { useImportStore } from "@/store/importStore";
import { useProjectStore } from "@/store/projectStore";
import { useSceneStore } from "@/store/sceneStore";
import { ASSET_DRAG_TYPE, hideDragImage, useAssetDragStore } from "./assetDrag";
import AssetThumbnail from "./AssetThumbnail";
import { Icon } from "./icons";
import { useLibrary } from "./useLibrary";

/** "1.4 MB", "820 KB": file sizes the way people read them. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Tells the person why something was refused, in the bar over the 3D view. */
function tellProblem(text: string | null) {
  if (text) useImportStore.getState().setMessage({ tone: "error", text });
}

const ICON_BUTTON =
  "grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent";

const SECTION_HEADING =
  "px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-ed-text-3";

/** "2 scenes" / "1 scene". */
function scenes(count: number): string {
  return `${count} scene${count === 1 ? "" : "s"}`;
}

/**
 * The "Assets" tab of the left panel: what the whole PROJECT can use in any scene. Prefabs (objects made
 * in a scene and kept here) and imported models. Place another copy, rename, write down where a model
 * came from (and its licence), delete.
 */
export default function AssetsPanel() {
  const { everyScene, models, prefabList } = useLibrary();
  const modelUsage = useMemo(() => projectAssetUsage(everyScene), [everyScene]);
  const instances = useMemo(() => prefabUsage(everyScene), [everyScene]);

  if (models.length === 0 && prefabList.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-ed-text-3">
        Nothing here yet. Models you import and prefabs you make are kept here
        for every scene of the project. Use Import, or select an object and
        choose Make prefab in the Inspector.
      </p>
    );
  }

  return (
    <div
      aria-label="Assets of the project"
      className="min-h-0 flex-1 overflow-y-auto px-2 py-1"
    >
      {prefabList.length > 0 && (
        <section aria-label="Prefabs">
          <h3 className={SECTION_HEADING}>Prefabs</h3>
          <ul>
            {prefabList.map((prefab) => (
              <PrefabRow
                key={prefab.id}
                prefab={prefab}
                usage={instances[prefab.id] ?? { instances: 0, scenes: 0 }}
              />
            ))}
          </ul>
        </section>
      )}
      {models.length > 0 && (
        <section aria-label="Models">
          <h3 className={SECTION_HEADING}>Models</h3>
          <ul>
            {models.map((asset) => (
              <AssetRow
                key={asset.id}
                asset={asset}
                used={modelUsage[asset.id] ?? { objects: 0, scenes: 0 }}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** What the browser needs on a card that can be dragged onto the 3D view. */
function dragProps(id: string) {
  return {
    // The whole card is the drag handle: drop it on the 3D view to place it there
    draggable: true,
    onPointerDown: (event: React.PointerEvent<HTMLLIElement>) => {
      // Typing and selecting text in a box must not start a drag, so the card is not draggable
      // while the press is on a text box
      event.currentTarget.draggable = !(event.target as Element).closest(
        "input, textarea",
      );
    },
    onDragStart: (event: React.DragEvent<HTMLLIElement>) => {
      event.dataTransfer.setData(ASSET_DRAG_TYPE, id);
      event.dataTransfer.effectAllowed = "copy";
      hideDragImage(event);
      useAssetDragStore.getState().start(id);
    },
    // Fires wherever the drag ends: dropped, cancelled with Escape, or let go outside the page
    onDragEnd: () => useAssetDragStore.getState().end(),
  };
}

/** The name box of a card: the name is kept as typed until Enter or leaving the box. */
function NameBox({
  name,
  label,
  onCommit,
}: {
  name: string;
  label: string;
  /** Saves the name; returns the name that is now really in use (an empty or used name is refused). */
  onCommit: (name: string) => string;
}) {
  const [draft, setDraft] = useState(name);
  // Keeps the box in step with the name when it changes elsewhere (undo, redo, another scene)
  const [seenName, setSeenName] = useState(name);
  if (seenName !== name) {
    setSeenName(name);
    setDraft(name);
  }
  return (
    <input
      value={draft}
      maxLength={NODE_NAME_MAX_LENGTH}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => setDraft(onCommit(draft))}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
      className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-ed-line-strong focus-visible:border-ed-accent focus-visible:outline-none"
    />
  );
}

/** "Delete? Also …" question under a card, with Delete and Cancel. */
function ConfirmBar({
  text,
  onConfirm,
  onCancel,
}: {
  text: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-1 flex items-center gap-2 rounded-md bg-ed-raised px-2 py-1.5 text-xs"
    >
      <span className="min-w-0 flex-1">{text}</span>
      <button
        type="button"
        onClick={onConfirm}
        className="rounded px-1.5 py-0.5 font-medium text-ed-danger hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-1.5 py-0.5 text-ed-text-2 hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        Cancel
      </button>
    </div>
  );
}

function PrefabRow({
  prefab,
  usage,
}: {
  prefab: Prefab;
  usage: { instances: number; scenes: number };
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li
      {...dragProps(prefab.id)}
      // Double-click opens the prefab to change it (a drag places a linked copy)
      onDoubleClick={(event) => {
        if ((event.target as Element).closest("button, input, textarea"))
          return;
        tellProblem(editPrefab(prefab.id));
      }}
      title="Double-click to edit the prefab. Drag into the 3D view to place a linked copy."
      className="flex cursor-grab gap-2 rounded-lg px-1.5 py-1.5 hover:bg-ed-field active:cursor-grabbing"
    >
      <div
        aria-hidden="true"
        className="grid size-12 shrink-0 place-items-center rounded-lg border border-ed-accent/50 bg-ed-field text-ed-accent"
      >
        <Icon name="cube" className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <NameBox
            name={prefab.name}
            label={`Prefab name for ${prefab.name}`}
            onCommit={(draft) => {
              tellProblem(renamePrefab(prefab.id, draft));
              return (
                useProjectStore.getState().prefabs[prefab.id]?.name ?? draft
              );
            }}
          />
          <button
            type="button"
            title="Place a linked copy in the open scene"
            aria-label={`Place ${prefab.name} in the scene`}
            onClick={() => placeLibraryItem(prefab.id)}
            className={ICON_BUTTON}
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            title="Delete this prefab (its copies stay, as ordinary objects)"
            aria-label={`Delete ${prefab.name}`}
            onClick={() =>
              usage.instances === 0
                ? deletePrefab(prefab.id)
                : setConfirming(true)
            }
            className={ICON_BUTTON}
          >
            <Icon name="trash" />
          </button>
        </div>
        <p className="px-1.5 text-xs text-ed-text-3">
          {prefab.nodes.length} object{prefab.nodes.length === 1 ? "" : "s"} ·{" "}
          {usage.instances === 0
            ? "no copies placed"
            : `${usage.instances} cop${usage.instances === 1 ? "y" : "ies"} in ${scenes(usage.scenes)}`}
        </p>
        <div className="px-1.5 pt-0.5">
          <button
            type="button"
            title="Open the prefab as a scene of its own. Changes show in every copy."
            aria-label={`Edit the prefab ${prefab.name}`}
            onClick={() => tellProblem(editPrefab(prefab.id))}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-ed-accent hover:bg-ed-raised focus-visible:outline-2 focus-visible:outline-ed-accent"
          >
            Edit prefab
          </button>
        </div>
        {confirming && (
          <ConfirmBar
            text={`The ${usage.instances} cop${usage.instances === 1 ? "y" : "ies"} stay as ordinary objects, no longer linked.`}
            onConfirm={() => deletePrefab(prefab.id)}
            onCancel={() => setConfirming(false)}
          />
        )}
      </div>
    </li>
  );
}

function AssetRow({
  asset,
  used,
}: {
  asset: AssetInfo;
  used: { objects: number; scenes: number };
}) {
  const [showNote, setShowNote] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /** Deletes the model everywhere; a prefab that uses it can refuse. */
  function remove() {
    tellProblem(deleteModel(asset.id));
    setConfirming(false);
  }

  return (
    <li
      {...dragProps(asset.id)}
      title="Drag into the 3D view to place it"
      className="flex cursor-grab gap-2 rounded-lg px-1.5 py-1.5 hover:bg-ed-field active:cursor-grabbing"
    >
      <AssetThumbnail asset={asset} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <NameBox
            name={asset.name}
            label={`Asset name for ${asset.name}`}
            onCommit={(draft) => {
              renameModel(asset.id, draft);
              // An empty name is refused; show the real name again
              return (
                collectProjectModels([useSceneStore.getState().scene]).find(
                  (m) => m.id === asset.id,
                )?.name ?? draft
              );
            }}
          />
          <button
            type="button"
            title="Place another copy in the open scene"
            aria-label={`Place ${asset.name} in the scene`}
            onClick={() => placeLibraryItem(asset.id)}
            className={ICON_BUTTON}
          >
            <Icon name="plus" />
          </button>
          <button
            type="button"
            title="Source and licence note"
            aria-label={`Source and licence note for ${asset.name}`}
            aria-pressed={showNote}
            onClick={() => setShowNote((value) => !value)}
            className={`${ICON_BUTTON} ${asset.note ? "text-ed-accent" : ""}`}
          >
            <Icon name="link" />
          </button>
          <button
            type="button"
            title="Delete this asset from the project"
            aria-label={`Delete ${asset.name}`}
            onClick={() =>
              used.objects === 0 ? remove() : setConfirming(true)
            }
            className={ICON_BUTTON}
          >
            <Icon name="trash" />
          </button>
        </div>
        <p className="px-1.5 text-xs text-ed-text-3">
          {asset.triangles.toLocaleString("en-US")} triangles ·{" "}
          {formatBytes(asset.bytes)} ·{" "}
          {used.objects === 0
            ? "not used"
            : `used ${used.objects}× in ${scenes(used.scenes)}`}
        </p>
        {confirming && (
          <ConfirmBar
            text={`Also deletes the ${used.objects} object${used.objects === 1 ? "" : "s"} using it, in ${scenes(used.scenes)}.`}
            onConfirm={remove}
            onCancel={() => setConfirming(false)}
          />
        )}
        {showNote && <NoteBox asset={asset} onSave={setModelNote} />}
      </div>
    </li>
  );
}

function NoteBox({
  asset,
  onSave,
}: {
  asset: AssetInfo;
  onSave: (id: string, note: string) => void;
}) {
  const [draft, setDraft] = useState(asset.note);
  return (
    <textarea
      value={draft}
      maxLength={ASSET_NOTE_MAX_LENGTH}
      rows={3}
      placeholder="Where it came from, who made it, its licence (for example CC-BY, credit needed)"
      aria-label={`Source and licence note for ${asset.name}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onSave(asset.id, draft)}
      className="mt-1 w-full resize-none rounded-md border border-ed-line bg-ed-field px-2 py-1.5 text-xs placeholder:text-ed-text-3 focus-visible:border-ed-accent focus-visible:outline-none"
    />
  );
}
