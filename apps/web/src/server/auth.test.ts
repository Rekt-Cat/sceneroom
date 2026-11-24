import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "@sceneroom/db";
import { createAuth } from "./auth";
import { readAccountsEnv } from "./accountsEnv";

// Uses the Docker Postgres (docker compose up -d). No GitHub call is made: only our own wiring is checked.
const env = readAccountsEnv({
  DATABASE_URL: "postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom",
  BETTER_AUTH_SECRET: "t".repeat(40),
  BETTER_AUTH_URL: "http://localhost:3000",
  GITHUB_CLIENT_ID: "test-client-id",
  GITHUB_CLIENT_SECRET: "test-client-secret",
  COLLAB_SECRET: "c".repeat(40),
});
if (!env.ok) throw new Error(env.problems.join(", "));
const db = createDb(env.env.DATABASE_URL);
const auth = createAuth(env.env, db);
afterAll(() => db.$disconnect());

describe("sign-in wiring", () => {
  it("nobody is signed in without a cookie", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/get-session"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("starting GitHub sign-in gives the GitHub address with our callback", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/social", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({ provider: "github", callbackURL: "/" }),
      }),
    );
    const body = (await response.json()) as { url: string };
    const url = new URL(body.url);
    expect(url.origin + url.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/callback/github",
    );
  });

  it("only GitHub is offered: email sign-up is not available", async () => {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: "a@b.test",
          password: "x".repeat(12),
          name: "A",
        }),
      }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});
