"use client";

import { useEffect, useState, type DragEvent } from "react";
import { importFiles } from "@/assets/importFile";
import { watchEditMode } from "@/meshEdit/startEditing";
import { startPersistence } from "@/persistence/startPersistence";
import { usePlantLibraryStore } from "@/store/plantLibraryStore";
import { useLayoutStore } from "@/store/layoutStore";
import { carriesAsset } from "./assetDrag";
import BoxSelectOverlay from "./BoxSelectOverlay";
import ContextMenu from "./ContextMenu";
import ControlsLegend from "./ControlsLegend";
import EditModeBar from "./EditModeBar";
import HierarchyPanel from "./HierarchyPanel";
import ImportBanner from "./ImportBanner";
import InspectorPanel from "./InspectorPanel";
import ToolDock from "./ToolDock";
import TopBar from "./TopBar";
import ViewportLoader from "./ViewportLoader";
import { useEditorShortcuts } from "./useEditorShortcuts";

/** True if a drag carries files from the computer (as opposed to text or an element on the page). */
function carriesFiles(event: DragEvent | globalThis.DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

/**
 * The whole editor screen: top bar, scene list on the left, 3D view in the middle (nothing covers
 * it except its own small controls), Inspector on the right.
 */
export default function EditorShell() {
  useEditorShortcuts();

  // The plants this person saved (in this browser)
  useEffect(() => usePlantLibraryStore.getState().hydrate(), []);

  // Edit mode ends by itself when its object is no longer the selected one (or is gone)
  useEffect(() => watchEditMode(), []);

  // Restore the scene saved last time, then save every change (see startPersistence)
  useEffect(() => startPersistence(), []);

  // Read the saved panel widths once the page is in the browser (not during the server render)
  useEffect(() => useLayoutStore.getState().hydrate(), []);

  // The FPS counter is placed by the page, outside the panels; tell it where the left panel ends
  const leftWidth = useLayoutStore((state) => state.leftWidth);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--left-panel-width",
      `${leftWidth}px`,
    );
  }, [leftWidth]);

  // A file dropped on the 3D view is imported. Dropped anywhere else on the page, the browser would
  // open it and replace the editor (and the scene is not saved yet), so those drops are cancelled.
  const [dropping, setDropping] = useState(false);
  const [droppingAsset, setDroppingAsset] = useState(false);
  useEffect(() => {
    const cancel = (event: globalThis.DragEvent) => {
      if (carriesFiles(event)) event.preventDefault();
    };
    window.addEventListener("dragover", cancel);
    window.addEventListener("drop", cancel);
    return () => {
      window.removeEventListener("dragover", cancel);
      window.removeEventListener("drop", cancel);
    };
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-ed-bg text-ed-text">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <HierarchyPanel />
        {/* Same colour as the 3D background (Viewport.tsx) so there is no flash while it loads */}
        <main
          className="relative min-w-0 flex-1 overflow-hidden bg-[#14191d]"
          onDragEnter={(event) => {
            if (carriesFiles(event)) setDropping(true);
            if (carriesAsset(event)) setDroppingAsset(true);
          }}
          onDragOver={(event) => {
            if (!carriesFiles(event)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            // Moving over a child of the view also fires "leave"; only hide when really leaving it
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            ) {
              setDropping(false);
              setDroppingAsset(false);
            }
          }}
          onDrop={(event) => {
            setDroppingAsset(false);
            if (!carriesFiles(event)) return;
            event.preventDefault();
            setDropping(false);
            void importFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <div className="absolute inset-0">
            <ViewportLoader />
          </div>
          <ControlsLegend />
          <ToolDock />
          <ImportBanner />
          <EditModeBar />
          {dropping && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-ed-accent bg-ed-accent/10 text-sm font-medium"
            >
              Drop a .glb model to import it, or a .sceneroom file to open it
            </div>
          )}
          {droppingAsset && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-3 grid place-items-center rounded-xl border-2 border-dashed border-ed-accent bg-ed-accent/10 text-sm font-medium"
            >
              Drop to place the model on the ground
            </div>
          )}
        </main>
        <InspectorPanel />
      </div>
      <BoxSelectOverlay />
      <ContextMenu />
    </div>
  );
}
