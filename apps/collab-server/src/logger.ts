/** Where the server writes what happened. Tests pass their own to look at it. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export const consoleLogger: Logger = {
  info: (message) => console.log(`[collab] ${message}`),
  warn: (message) => console.warn(`[collab] ${message}`),
  error: (message, error) => console.error(`[collab] ${message}`, error ?? ""),
};
