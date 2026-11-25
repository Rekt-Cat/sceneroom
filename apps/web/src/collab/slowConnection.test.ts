import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCollabStore } from "./collabStore";
import { SLOW_CONNECTION_MS, watchSlowConnection } from "./slowConnection";

beforeEach(() => {
  vi.useFakeTimers();
  useCollabStore.setState(useCollabStore.getInitialState(), true);
});
afterEach(() => vi.useRealTimers());

const slow = () => useCollabStore.getState().slow;
const status = (s: "connecting" | "online" | "offline" | "refused" | "off") =>
  useCollabStore.getState().setStatus(s);

describe("the slow connection watcher", () => {
  it("says slow only after the connection has been trying for a while", () => {
    const stop = watchSlowConnection();
    status("connecting");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS - 1);
    expect(slow()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(slow()).toBe(true);
    stop();
  });

  it("a connection that comes up in time is never slow, and slow goes away when it is online", () => {
    const stop = watchSlowConnection();
    status("connecting");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS - 100);
    status("online");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS * 2);
    expect(slow()).toBe(false);
    status("connecting");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS);
    expect(slow()).toBe(true);
    status("online");
    expect(slow()).toBe(false);
    stop();
  });

  it("a lost connection that does not come back counts as slow too; refused and off do not", () => {
    const stop = watchSlowConnection();
    status("online");
    status("offline");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS);
    expect(slow()).toBe(true);
    status("refused");
    expect(slow()).toBe(false);
    status("connecting");
    status("off");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS * 2);
    expect(slow()).toBe(false);
    stop();
  });

  it("stopping clears the flag and the timer", () => {
    const stop = watchSlowConnection();
    status("connecting");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS);
    expect(slow()).toBe(true);
    stop();
    expect(slow()).toBe(false);
    status("connecting");
    vi.advanceTimersByTime(SLOW_CONNECTION_MS * 2);
    expect(slow()).toBe(false);
  });
});
