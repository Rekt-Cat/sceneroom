"use client";

import dynamic from "next/dynamic";
import AddToolbar from "./AddToolbar";
import SelectionPanel from "./SelectionPanel";
import Toolbar from "./Toolbar";
import { useEditorShortcuts } from "./useEditorShortcuts";

// `ssr: false` is only allowed inside a Client Component (Next.js docs: Lazy Loading),
// so this thin wrapper exists to load the WebGL viewport in the browser only.
const Viewport = dynamic(() => import("./Viewport"), {
  ssr: false,
  loading: () => (
    <p className="p-6 text-sm text-zinc-400">Loading 3D viewport…</p>
  ),
});

export default function ViewportLoader() {
  useEditorShortcuts();
  return (
    <>
      <Viewport />
      <Toolbar />
      <AddToolbar />
      <SelectionPanel />
    </>
  );
}
