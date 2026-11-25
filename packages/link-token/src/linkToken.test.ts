import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLinkToken, verifyLinkToken } from "./linkToken";

const SECRET = "a-test-secret-that-is-long-enough-123";

describe("link tokens", () => {
  it("a token carries its project and role", () => {
    const token = createLinkToken({ projectId: "p1", role: "viewer" }, SECRET);
    expect(verifyLinkToken(token, SECRET)).toEqual({
      ok: true,
      projectId: "p1",
      role: "viewer",
      generation: 0,
    });
  });

  it("a token signed with another secret is refused", () => {
    const token = createLinkToken({ projectId: "p1", role: "editor" }, SECRET);
    expect(
      verifyLinkToken(token, "another-secret-that-is-long-enough-1"),
    ).toEqual({
      ok: false,
      reason: "bad signature",
    });
  });

  it("changing the claims breaks the signature (a viewer cannot make themself an editor)", () => {
    const token = createLinkToken({ projectId: "p1", role: "viewer" }, SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ p: "p1", r: "editor" }),
    ).toString("base64url");
    expect(verifyLinkToken(`${forged}.${signature}`, SECRET)).toMatchObject({
      ok: false,
    });
  });

  it("a token expires", () => {
    const token = createLinkToken(
      { projectId: "p1", role: "editor" },
      SECRET,
      1000,
    );
    expect(verifyLinkToken(token, SECRET, 999)).toMatchObject({ ok: true });
    expect(verifyLinkToken(token, SECRET, 1000)).toEqual({
      ok: false,
      reason: "expired",
    });
  });

  it.each(["", "abc", "a.b.c", ".", "a.", ".b", "e30.AAAA"])(
    "garbage %j is refused without throwing",
    (token) => {
      expect(verifyLinkToken(token, SECRET)).toMatchObject({ ok: false });
    },
  );

  it("a correctly signed token with invalid claims is refused", () => {
    // Signed properly, but the role is not one we know

    const body = Buffer.from(JSON.stringify({ p: "p1", r: "owner" })).toString(
      "base64url",
    );
    const signature = createHmac("sha256", SECRET)
      .update(body)
      .digest("base64url");
    expect(verifyLinkToken(`${body}.${signature}`, SECRET)).toEqual({
      ok: false,
      reason: "invalid claims",
    });
  });

  it("a token carries its generation, and a missing one means 0", () => {
    const token = createLinkToken(
      { projectId: "p1", role: "editor", generation: 3 },
      SECRET,
    );
    expect(verifyLinkToken(token, SECRET)).toMatchObject({
      ok: true,
      generation: 3,
    });
    const plain = createLinkToken({ projectId: "p1", role: "editor" }, SECRET);
    expect(verifyLinkToken(plain, SECRET)).toMatchObject({
      ok: true,
      generation: 0,
    });
  });

  it("refuses to make a token for a bad project id", () => {
    expect(() =>
      createLinkToken({ projectId: "a:b", role: "editor" }, SECRET),
    ).toThrow();
  });
});
