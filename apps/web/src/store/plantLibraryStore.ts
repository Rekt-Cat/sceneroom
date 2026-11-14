import { create } from "zustand";
import {
  addCustomPlant,
  customPlantFrom,
  parseCustomPlants,
  removeCustomPlant,
  type CustomPlant,
  type SceneNode,
} from "@sceneroom/shared";

/** Where the plants a person saved are remembered between visits (in this browser only). */
export const PLANT_LIBRARY_KEY = "sceneroom.plants.v1";

type PlantLibraryState = {
  /** The plants this person saved, oldest first. */
  items: CustomPlant[];
  /** Reads the saved plants from the browser. Called once, after the first render (not during the server render). */
  hydrate: () => void;
  /**
   * Saves a plant object's numbers and trunk colour under a name (a plant with the same name is replaced).
   * Returns the saved plant, or null if the name is empty or the object is not a plant.
   */
  save: (name: string, node: SceneNode) => CustomPlant | null;
  /** Forgets a saved plant. Plants already in scenes are not touched. */
  remove: (id: string) => void;
};

function write(items: readonly CustomPlant[]): void {
  try {
    window.localStorage.setItem(PLANT_LIBRARY_KEY, JSON.stringify(items));
  } catch (error) {
    // Storage can be blocked (private window) or full. The list still works for this visit, it is just not remembered.
    console.warn("Could not remember the saved plants:", error);
  }
}

export const usePlantLibraryStore = create<PlantLibraryState>()((set, get) => ({
  items: [],
  hydrate: () => {
    try {
      const text = window.localStorage.getItem(PLANT_LIBRARY_KEY);
      if (text === null) return;
      // Anything in browser storage may be damaged or from another version: it is checked
      set({ items: parseCustomPlants(JSON.parse(text)) });
    } catch (error) {
      console.warn("Could not read the saved plants:", error);
    }
  },
  save: (name, node) => {
    let item: CustomPlant;
    try {
      item = customPlantFrom(crypto.randomUUID(), name, node);
    } catch {
      return null;
    }
    const items = addCustomPlant(get().items, item);
    set({ items });
    write(items);
    return item;
  },
  remove: (id) => {
    const items = removeCustomPlant(get().items, id);
    set({ items });
    write(items);
  },
}));
