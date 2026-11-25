import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("/api/auth without accounts set up", () => {
  it("answers 503 with a clear message instead of failing", async () => {
    for (const name of [
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "COLLAB_SECRET",
    ]) {
      vi.stubEnv(name, "");
    }
    const request = new Request("http://localhost:3000/api/auth/get-session");
    for (const handler of [GET, POST]) {
      const response = await handler(request);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Accounts are not set up on this server.",
      });
    }
  });
});
