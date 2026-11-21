import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";

const SECRET = "a-test-secret-that-is-long-enough-123";

describe("loadConfig", () => {
  it("uses the defaults when only the secret is given", () => {
    expect(loadConfig({ COLLAB_SECRET: SECRET })).toEqual({
      port: 1234,
      host: "127.0.0.1",
      dbPath: "./data/collab.sqlite",
      secret: SECRET,
      maxMessageBytes: 1_048_576,
      maxDocumentBytes: 20_971_520,
    });
  });

  it("reads numbers from text", () => {
    const config = loadConfig({
      COLLAB_SECRET: SECRET,
      PORT: "4000",
      MAX_MESSAGE_BYTES: "5000",
    });
    expect(config.port).toBe(4000);
    expect(config.maxMessageBytes).toBe(5000);
  });

  it("refuses a missing or short secret, and bad numbers, in one message", () => {
    expect(() => loadConfig({})).toThrow(/COLLAB_SECRET/);
    expect(() => loadConfig({ COLLAB_SECRET: "short" })).toThrow(
      /COLLAB_SECRET/,
    );
    expect(() =>
      loadConfig({
        COLLAB_SECRET: SECRET,
        PORT: "abc",
        MAX_MESSAGE_BYTES: "-1",
      }),
    ).toThrow(/PORT.*MAX_MESSAGE_BYTES/);
  });
});
