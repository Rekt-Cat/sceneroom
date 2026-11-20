import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INFO_MESSAGE_SECONDS, useImportStore } from "./importStore";

beforeEach(() => {
  vi.useFakeTimers();
  useImportStore.setState({ busy: false, message: null });
});

afterEach(() => {
  vi.useRealTimers();
});

const later = (seconds: number) => vi.advanceTimersByTime(seconds * 1000);

describe("messages over the 3D view", () => {
  it("an info message goes by itself after a few seconds", () => {
    useImportStore.getState().setMessage({ tone: "info", text: "Done." });
    later(INFO_MESSAGE_SECONDS - 1);
    expect(useImportStore.getState().message?.text).toBe("Done.");
    later(2);
    expect(useImportStore.getState().message).toBeNull();
  });

  it("an error stays until it is dismissed", () => {
    useImportStore.getState().setMessage({ tone: "error", text: "Broke." });
    later(600);
    expect(useImportStore.getState().message?.text).toBe("Broke.");
    useImportStore.getState().setMessage(null);
    expect(useImportStore.getState().message).toBeNull();
  });

  it("a newer message is not removed by the timer of an older one", () => {
    const store = useImportStore.getState();
    store.setMessage({ tone: "info", text: "First" });
    later(5);
    store.setMessage({ tone: "info", text: "Second" });
    later(5); // the first timer would have gone off by now
    expect(useImportStore.getState().message?.text).toBe("Second");
    later(4);
    expect(useImportStore.getState().message).toBeNull();
  });

  it("an error replacing an info message is not removed by the info timer", () => {
    const store = useImportStore.getState();
    store.setMessage({ tone: "info", text: "Fine" });
    later(2);
    store.setMessage({ tone: "error", text: "Not fine" });
    later(30);
    expect(useImportStore.getState().message?.text).toBe("Not fine");
  });
});
