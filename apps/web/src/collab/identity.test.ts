import { afterEach, describe, expect, it, vi } from "vitest";
import { useCollabStore } from "./collabStore";
import { loadSavedName, saveName } from "./identity";

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
    },
  });
  return data;
}

afterEach(() => {
  vi.unstubAllGlobals();
  useCollabStore.setState({ myName: null });
});

describe("the name a person chose", () => {
  it("is saved, read back and removed", () => {
    stubStorage();
    expect(loadSavedName()).toBeNull();
    saveName("Ayush");
    expect(loadSavedName()).toBe("Ayush");
    saveName(null);
    expect(loadSavedName()).toBeNull();
  });

  it("a stored value that is not a usable name is ignored", () => {
    stubStorage({ "sceneroom-presence-name": "    " });
    expect(loadSavedName()).toBeNull();
  });

  it("blocked storage does not break anything", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(loadSavedName()).toBeNull();
    expect(() => saveName("x")).not.toThrow();
  });

  it("choosing a name in the store tidies and saves it; null goes back to the guest name", () => {
    const data = stubStorage();
    useCollabStore.getState().setMyName("  Ayush   D ");
    expect(useCollabStore.getState().myName).toBe("Ayush D");
    expect(data.get("sceneroom-presence-name")).toBe("Ayush D");
    useCollabStore.getState().setMyName("   ");
    expect(useCollabStore.getState().myName).toBeNull();
    expect(data.has("sceneroom-presence-name")).toBe(false);
  });
});
