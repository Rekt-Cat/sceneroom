import { create } from "zustand";

/**
 * Where the right-click menu is open. "object" means it was opened on an object (or a row of the scene
 * list) and acts on the selection; "empty" means empty space in the 3D view (only Paste makes sense).
 */
export type ContextMenuState = {
  x: number;
  y: number;
  target: "object" | "empty";
};

type ContextMenuStore = {
  menu: ContextMenuState | null;
  open: (x: number, y: number, target: ContextMenuState["target"]) => void;
  close: () => void;
};

export const useContextMenuStore = create<ContextMenuStore>()((set) => ({
  menu: null,
  open: (x, y, target) => set({ menu: { x, y, target } }),
  close: () => set({ menu: null }),
}));
