"use client";

import { useMemo, useState } from "react";
import {
  ASSET_NOTE_MAX_LENGTH,
  NODE_NAME_MAX_LENGTH,
  assetUsageCounts,
  type AssetInfo,
} from "@sceneroom/shared";
import { useSceneStore } from "@/store/sceneStore";
import { ASSET_DRAG_TYPE, hideDragImage, useAssetDragStore } from "./assetDrag";
import AssetThumbnail from "./AssetThumbnail";
import { Icon } from "./icons";

/** "1.4 MB", "820 KB": file sizes the way people read them. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const ICON_BUTTON =
  "grid size-[26px] shrink-0 place-items-center rounded-md text-ed-text-3 hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent";

/**
 * The "Assets" tab of the left panel: the imported files of the scene. Place another copy, rename,
 * write down where it came from (and its licence), delete.
 */
export default function AssetsPanel() {
  const assets = useSceneStore((state) => state.scene.assets);
  const nodes = useSceneStore((state) => state.scene.nodes);
  const list = Object.values(assets);
  const usage = useMemo(
    () => assetUsageCounts({ version: 1, nodes, assets }),
    [nodes, assets],
  );

  if (list.length === 0) {
    return (
      <p className="px-4 py-3 text-sm text-ed-text-3">
        No imported models yet. Use Import, or drop a .glb file onto the 3D
        view.
      </p>
    );
  }

  return (
    <ul
      aria-label="Assets"
      className="min-h-0 flex-1 overflow-y-auto px-2 py-1"
    >
      {list.map((asset) => (
        <AssetRow key={asset.id} asset={asset} used={usage[asset.id] ?? 0} />
      ))}
    </ul>
  );
}

function AssetRow({ asset, used }: { asset: AssetInfo; used: number }) {
  const placeAsset = useSceneStore((state) => state.placeAsset);
  const renameAsset = useSceneStore((state) => state.renameAsset);
  const setAssetNote = useSceneStore((state) => state.setAssetNote);
  const deleteAsset = useSceneStore((state) => state.deleteAsset);
  const [draft, setDraft] = useState(asset.name);
  const [showNote, setShowNote] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Keeps the box in step with the name when it changes elsewhere (undo, redo)
  const [seenName, setSeenName] = useState(asset.name);
  if (seenName !== asset.name) {
    setSeenName(asset.name);
    setDraft(asset.name);
  }

  function commitName() {
    renameAsset(asset.id, draft);
    // An empty name is refused by the store; show the real name again
    setDraft(useSceneStore.getState().scene.assets[asset.id]?.name ?? draft);
  }

  return (
    <li
      // The whole card is the drag handle: drop it on the 3D view to place the model there
      draggable
      title="Drag into the 3D view to place it"
      onPointerDown={(event) => {
        // Typing and selecting text in a box must not start a drag, so the card is not draggable
        // while the press is on a text box
        event.currentTarget.draggable = !(event.target as Element).closest(
          "input, textarea",
        );
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
        event.dataTransfer.effectAllowed = "copy";
        hideDragImage(event);
        useAssetDragStore.getState().start(asset.id);
      }}
      // Fires wherever the drag ends: dropped, cancelled with Escape, or let go outside the page
      onDragEnd={() => useAssetDragStore.getState().end()}
      className="flex cursor-grab gap-2 rounded-lg px-1.5 py-1.5 hover:bg-ed-field active:cursor-grabbing"
    >
      <AssetThumbnail asset={asset} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <input
            value={draft}
            maxLength={NODE_NAME_MAX_LENGTH}
            aria-label={`Asset name for ${asset.name}`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(asset.name);
                event.currentTarget.blur();
              }
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-ed-line-strong focus-visible:border-ed-accent focus-visible:outline-none"
          />
          <button
            type="button"
            title="Place another copy in the scene"
            aria-label={`Place ${asset.name} in the scene`}
            onClick={() => placeAsset(asset.id)}
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
            title="Delete this asset"
            aria-label={`Delete ${asset.name}`}
            onClick={() =>
              used === 0 ? deleteAsset(asset.id) : setConfirming(true)
            }
            className={ICON_BUTTON}
          >
            <Icon name="trash" />
          </button>
        </div>
        <p className="px-1.5 text-xs text-ed-text-3">
          {asset.triangles.toLocaleString("en-US")} triangles ·{" "}
          {formatBytes(asset.bytes)} ·{" "}
          {used === 0 ? "not used" : `used ${used}×`}
        </p>
        {confirming && (
          <div
            role="alert"
            className="mt-1 flex items-center gap-2 rounded-md bg-ed-raised px-2 py-1.5 text-xs"
          >
            <span className="min-w-0 flex-1">
              Also deletes {used} object{used === 1 ? "" : "s"} using it.
            </span>
            <button
              type="button"
              onClick={() => deleteAsset(asset.id)}
              className="rounded px-1.5 py-0.5 font-medium text-ed-danger hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded px-1.5 py-0.5 text-ed-text-2 hover:bg-ed-field focus-visible:outline-2 focus-visible:outline-ed-accent"
            >
              Cancel
            </button>
          </div>
        )}
        {showNote && <NoteBox asset={asset} onSave={setAssetNote} />}
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
