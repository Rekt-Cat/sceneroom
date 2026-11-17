"use client";

import { isSideView } from "@sceneroom/shared";
import { useViewStore } from "@/store/viewStore";
import ViewSelect from "./ViewSelect";

/**
 * The drop-down in the top-left corner of the big view when it shows a pinned side (not the normal 3D view):
 * choose another side, or Perspective to go back. Hidden for the normal view, so the screen stays clean.
 */
export default function BigViewSwitch() {
  const bigView = useViewStore((state) => state.bigView);
  const setBigView = useViewStore((state) => state.setBigView);
  if (!isSideView(bigView)) return null;
  return (
    <div className="absolute top-3 left-[104px] z-10 flex items-center gap-2">
      <ViewSelect
        label="What the big view shows"
        value={bigView}
        onChange={setBigView}
      />
      <span className="rounded-md bg-ed-raised/90 px-2 py-0.5 text-xs text-ed-text-3">
        Pinned: zoom only. Choose Perspective to go back
      </span>
    </div>
  );
}
