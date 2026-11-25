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
      filesDir: "./data/files",
      maxFileBytes: 52_428_800,
      maxProjectFileBytes: 524_288_000,
      allowedOrigins: ["http://localhost:3000"],
      linkSharing: true,
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

  it("reads the list of allowed origins", () => {
    const config = loadConfig({
      COLLAB_SECRET: SECRET,
      ALLOWED_ORIGINS: "https://a.example, https://b.example ,",
    });
    expect(config.allowedOrigins).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
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

describe("the file store and link sharing settings", () => {
  const base = { COLLAB_SECRET: "s".repeat(40) };

  it("default to the folder and to link sharing on", () => {
    const config = loadConfig(base);
    expect(config.s3).toBeUndefined();
    expect(config.linkSharing).toBe(true);
  });

  it("read a complete S3 setup, with the region defaulting to auto", () => {
    const config = loadConfig({
      ...base,
      S3_ENDPOINT: "https://abc.r2.cloudflarestorage.com",
      S3_BUCKET: "sceneroom-files",
      S3_ACCESS_KEY_ID: "id",
      S3_SECRET_ACCESS_KEY: "secret",
    });
    expect(config.s3).toEqual({
      endpoint: "https://abc.r2.cloudflarestorage.com",
      bucket: "sceneroom-files",
      region: "auto",
      accessKeyId: "id",
      secretAccessKey: "secret",
    });
  });

  it("treat empty S3 values as not set, and refuse half a setup naming what is missing, without printing any value", () => {
    expect(
      loadConfig({ ...base, S3_ENDPOINT: "", S3_BUCKET: "" }).s3,
    ).toBeUndefined();
    let message = "";
    try {
      loadConfig({
        ...base,
        S3_BUCKET: "b",
        S3_SECRET_ACCESS_KEY: "do-not-print-this",
      });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/S3_ENDPOINT/);
    expect(message).toMatch(/S3_ACCESS_KEY_ID/);
    expect(message).not.toContain("do-not-print-this");
    expect(() =>
      loadConfig({
        ...base,
        S3_ENDPOINT: "not a url",
        S3_BUCKET: "b",
        S3_ACCESS_KEY_ID: "i",
        S3_SECRET_ACCESS_KEY: "s",
      }),
    ).toThrow();
  });

  it("LINK_SHARING must be true or false", () => {
    expect(loadConfig({ ...base, LINK_SHARING: "false" }).linkSharing).toBe(
      false,
    );
    expect(() => loadConfig({ ...base, LINK_SHARING: "maybe" })).toThrow(
      /LINK_SHARING/,
    );
  });
});
