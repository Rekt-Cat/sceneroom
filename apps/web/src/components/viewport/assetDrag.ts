import { create } from "zustand";
import type { DragEvent as ReactDragEvent } from "react";

/** The label an asset carries while it is dragged from the Assets tab (its value is the asset id). */
export const ASSET_DRAG_TYPE = "application/x-sceneroom-asset";

/** True if the drag carries an asset from the Assets tab. */
export function carriesAsset(
  event: ReactDragEvent | globalThis.DragEvent,
): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes(ASSET_DRAG_TYPE);
}

/** A one-pixel see-through picture, made once, loaded before it is needed. Null on the server. */
const blankDragImage: HTMLImageElement | null =
  typeof Image === "undefined" ? null : new Image();
if (blankDragImage) {
  blankDragImage.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
}

/**
 * Replaces the faded copy of the card that the browser shows next to the pointer while dragging with
 * nothing, so that only the model's own preview in the 3D view is seen.
 */
export function hideDragImage(event: ReactDragEvent): void {
  if (blankDragImage) event.dataTransfer.setDragImage(blankDragImage, 0, 0);
}

/**
 * What the Assets tab is dragging right now, and where over the ground it would land. The browser
 * hides what a drag carries until the drop, so the dragged asset's id is kept here from the start of
 * the drag. The 3D view uses it to draw a see-through preview of the model while it is dragged over.
 */
type AssetDragState = {
  assetId: string | null;
  /** Where on the ground the pointer is, or null while the drag is not over the 3D view. */
  spot: [number, number, number] | null;
  start: (assetId: string) => void;
  setSpot: (spot: [number, number, number] | null) => void;
  /** The drag ended (dropped, cancelled or left). */
  end: () => void;
};

export const useAssetDragStore = create<AssetDragState>()((set) => ({
  assetId: null,
  spot: null,
  start: (assetId) => set({ assetId, spot: null }),
  setSpot: (spot) => set({ spot }),
  end: () => set({ assetId: null, spot: null }),
}));
