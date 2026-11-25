import { useCollabStore } from "./collabStore";

/** How long the first connection may take before the editor says the server may be waking up (ms). */
export const SLOW_CONNECTION_MS = 8000;

type Timers = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};
const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Sets `slow` in the collab store when the connection has been trying for `SLOW_CONNECTION_MS` without getting online, so the
 * badge can say that a host that sleeps when idle may be waking up (it takes up to a minute). It goes away when the
 * connection is online or refused, or the project goes offline. Returns a function that stops watching.
 */
export function watchSlowConnection(
  afterMs: number = SLOW_CONNECTION_MS,
  timers: Timers = realTimers,
): () => void {
  let timer: unknown = null;
  const clear = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const update = (status: string) => {
    if (status === "connecting" || status === "offline") {
      if (timer === null && !useCollabStore.getState().slow) {
        timer = timers.set(() => {
          timer = null;
          const now = useCollabStore.getState().status;
          if (now === "connecting" || now === "offline") {
            useCollabStore.getState().setSlow(true);
          }
        }, afterMs);
      }
      return;
    }
    clear();
    if (useCollabStore.getState().slow)
      useCollabStore.getState().setSlow(false);
  };
  update(useCollabStore.getState().status);
  const stop = useCollabStore.subscribe((state, previous) => {
    if (state.status !== previous.status) update(state.status);
  });
  return () => {
    stop();
    clear();
    useCollabStore.getState().setSlow(false);
  };
}
