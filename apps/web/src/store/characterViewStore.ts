import { create } from "zustand";

/**
 * How characters are shown in the editor (a view aid, not scene data: not saved and not part of undo):
 * whether the bones of the selected character are drawn over it.
 */
export const useCharacterViewStore = create<{
  showSkeleton: boolean;
  setShowSkeleton: (show: boolean) => void;
}>()((set) => ({
  showSkeleton: false,
  setShowSkeleton: (showSkeleton) => set({ showSkeleton }),
}));
