import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_CUSTOM_PLANTS,
  createNode,
  createPlantNode,
} from "@sceneroom/shared";
import { PLANT_LIBRARY_KEY, usePlantLibraryStore } from "./plantLibraryStore";

/** A stand-in for the browser's storage (Node has none). */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function useStorage(storage: unknown) {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
  };
}

const library = () => usePlantLibraryStore.getState();
const tree = () => ({ ...createPlantNode("p", "tree", 5), color: "#101010" });
const stored = (storage: ReturnType<typeof fakeStorage>) =>
  JSON.parse(storage.data.get(PLANT_LIBRARY_KEY) ?? "[]") as { name: string }[];

beforeEach(() => {
  usePlantLibraryStore.setState({ items: [] });
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe("saving my plants", () => {
  it("saves a plant under a name and remembers it in the browser", () => {
    const storage = fakeStorage();
    useStorage(storage);
    const item = library().save("My oak", tree());
    expect(item).toMatchObject({ name: "My oak", barkColor: "#101010" });
    expect(library().items).toHaveLength(1);
    expect(stored(storage).map((i) => i.name)).toEqual(["My oak"]);
  });

  it("saving the same name again replaces it", () => {
    const storage = fakeStorage();
    useStorage(storage);
    library().save("Oak", tree());
    library().save("oak", { ...tree(), color: "#aa0000" });
    expect(library().items).toHaveLength(1);
    expect(library().items[0]).toMatchObject({ barkColor: "#aa0000" });
    expect(stored(storage)).toHaveLength(1);
  });

  it("an empty name, or an object that is not a plant, is not saved", () => {
    const storage = fakeStorage();
    useStorage(storage);
    expect(library().save("   ", tree())).toBeNull();
    expect(library().save("Cube", createNode("c", "cube"))).toBeNull();
    expect(library().items).toEqual([]);
    expect(storage.data.size).toBe(0);
  });

  it("keeps at most the limit", () => {
    useStorage(fakeStorage());
    for (let i = 0; i < MAX_CUSTOM_PLANTS + 3; i++)
      library().save(`Plant ${i}`, tree());
    expect(library().items).toHaveLength(MAX_CUSTOM_PLANTS);
    expect(library().items[0]!.name).toBe("Plant 3");
  });

  it("forgetting one removes it from the list and from storage, and leaves the others", () => {
    const storage = fakeStorage();
    useStorage(storage);
    const a = library().save("A", tree())!;
    library().save("B", tree());
    library().remove(a.id);
    expect(library().items.map((i) => i.name)).toEqual(["B"]);
    expect(stored(storage).map((i) => i.name)).toEqual(["B"]);
  });

  it("still works for this visit when the browser refuses to store it", () => {
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error("storage is full");
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(library().save("Oak", tree())).not.toBeNull();
    expect(library().items).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe("reading my plants when the page opens", () => {
  it("brings back what was saved", () => {
    const storage = fakeStorage();
    useStorage(storage);
    library().save("Oak", tree());
    library().save("Pine", createPlantNode("q", "pine", 1));
    usePlantLibraryStore.setState({ items: [] });
    library().hydrate();
    expect(library().items.map((i) => i.name)).toEqual(["Oak", "Pine"]);
  });

  it("nothing saved yet leaves the list empty", () => {
    useStorage(fakeStorage());
    library().hydrate();
    expect(library().items).toEqual([]);
  });

  it("damaged storage gives an empty list and does not crash; damaged items are dropped, good ones kept", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useStorage(fakeStorage({ [PLANT_LIBRARY_KEY]: "{not json" }));
    library().hydrate();
    expect(library().items).toEqual([]);
    expect(warn).toHaveBeenCalled();

    const storage = fakeStorage();
    useStorage(storage);
    library().save("Good", tree());
    const list = JSON.parse(storage.data.get(PLANT_LIBRARY_KEY)!);
    storage.data.set(
      PLANT_LIBRARY_KEY,
      JSON.stringify([list[0], { id: "x", name: "Bad" }, 42]),
    );
    usePlantLibraryStore.setState({ items: [] });
    library().hydrate();
    expect(library().items.map((i) => i.name)).toEqual(["Good"]);
  });

  it("storage that cannot be read does not crash", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    useStorage({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    });
    expect(() => library().hydrate()).not.toThrow();
  });
});
