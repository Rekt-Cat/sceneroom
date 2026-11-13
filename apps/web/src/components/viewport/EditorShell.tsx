"use client";

import BoxSelectOverlay from "./BoxSelectOverlay";
import ControlsLegend from "./ControlsLegend";
import HierarchyPanel from "./HierarchyPanel";
import InspectorPanel from "./InspectorPanel";
import ToolDock from "./ToolDock";
import TopBar from "./TopBar";
import ViewportLoader from "./ViewportLoader";
import { useEditorShortcuts } from "./useEditorShortcuts";

/**
 * The whole editor screen: top bar, scene list on the left, 3D view in the middle (nothing covers
 * it except its own small controls), Inspector on the right.
 */
export default function EditorShell() {
  useEditorShortcuts();

  return (
    <div className="flex h-dvh flex-col bg-ed-bg text-ed-text">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <HierarchyPanel />
        {/* Same colour as the 3D background (Viewport.tsx) so there is no flash while it loads */}
        <main className="relative min-w-0 flex-1 overflow-hidden bg-[#14191d]">
          <div className="absolute inset-0">
            <ViewportLoader />
          </div>
          <ControlsLegend />
          <ToolDock />
        </main>
        <InspectorPanel />
      </div>
      <BoxSelectOverlay />
    </div>
  );
}
