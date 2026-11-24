import { describe, expect, it } from "vitest";
import { readAccountsEnv } from "./accountsEnv";

const good = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/db",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "id",
  GITHUB_CLIENT_SECRET: "secret",
  COLLAB_SECRET: "b".repeat(64),
};

describe("readAccountsEnv", () => {
  it("accepts a complete set", () => {
    expect(readAccountsEnv(good).ok).toBe(true);
  });

  it("names every missing variable, and no values", () => {
    const result = readAccountsEnv({ COLLAB_SECRET: "short-secret-value" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const text = result.problems.join("\n");
    expect(text).toContain("DATABASE_URL");
    expect(text).toContain("GITHUB_CLIENT_ID");
    expect(text).toContain("COLLAB_SECRET");
    expect(text).not.toContain("short-secret-value");
  });

  it("refuses a short secret and a bad address", () => {
    const result = readAccountsEnv({
      ...good,
      BETTER_AUTH_SECRET: "short",
      BETTER_AUTH_URL: "not a url",
    });
    expect(result.ok).toBe(false);
  });
});
