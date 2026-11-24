import { describe, expect, it } from "vitest";
import {
  ADMIN_MAX_SKEW_SECONDS,
  signAdminRequest,
  verifyAdminRequest,
} from "./adminRequest";
import { createLinkToken, verifyLinkToken } from "./linkToken";

const SECRET = "a-test-secret-that-is-long-enough-123";
const BODY = '{"projectId":"p1","userId":"u1"}';

describe("signed internal requests", () => {
  it("a request signed with the secret passes", () => {
    const signature = signAdminRequest(SECRET, 1000, BODY);
    expect(verifyAdminRequest(SECRET, 1000, BODY, signature, 1000)).toEqual({
      ok: true,
    });
  });

  it("another secret, another body or another time fail", () => {
    const signature = signAdminRequest(SECRET, 1000, BODY);
    expect(
      verifyAdminRequest("z".repeat(40), 1000, BODY, signature, 1000),
    ).toEqual({ ok: false, reason: "bad signature" });
    expect(
      verifyAdminRequest(SECRET, 1000, '{"projectId":"p2"}', signature, 1000),
    ).toEqual({ ok: false, reason: "bad signature" });
    expect(verifyAdminRequest(SECRET, 1001, BODY, signature, 1001)).toEqual({
      ok: false,
      reason: "bad signature",
    });
  });

  it("an old or future request is refused even when its signature is right", () => {
    const old = signAdminRequest(SECRET, 1000, BODY);
    expect(
      verifyAdminRequest(
        SECRET,
        1000,
        BODY,
        old,
        1000 + ADMIN_MAX_SKEW_SECONDS + 1,
      ),
    ).toEqual({ ok: false, reason: "stale" });
    expect(
      verifyAdminRequest(
        SECRET,
        1000,
        BODY,
        old,
        1000 - ADMIN_MAX_SKEW_SECONDS - 1,
      ),
    ).toEqual({ ok: false, reason: "stale" });
    expect(
      verifyAdminRequest(SECRET, 1000, BODY, old, 1000 + ADMIN_MAX_SKEW_SECONDS)
        .ok,
    ).toBe(true);
  });

  it("rubbish where a signature should be never throws", () => {
    expect(verifyAdminRequest(SECRET, 1000, BODY, "not hex!", 1000)).toEqual({
      ok: false,
      reason: "bad signature",
    });
    expect(verifyAdminRequest(SECRET, 1000, BODY, "", 1000)).toEqual({
      ok: false,
      reason: "bad signature",
    });
    expect(verifyAdminRequest(SECRET, Number.NaN, BODY, "00", 1000)).toEqual({
      ok: false,
      reason: "no time",
    });
  });

  it("a link token cannot be used as the signature of an internal request", () => {
    const token = createLinkToken({ projectId: "p1", role: "editor" }, SECRET);
    expect(verifyAdminRequest(SECRET, 1000, BODY, token, 1000).ok).toBe(false);
  });
});

describe("the user in a token", () => {
  it("is carried when given and absent otherwise", () => {
    const withUser = createLinkToken(
      { projectId: "p1", role: "viewer", userId: "user-9" },
      SECRET,
    );
    expect(verifyLinkToken(withUser, SECRET)).toEqual({
      ok: true,
      projectId: "p1",
      role: "viewer",
      generation: 0,
      userId: "user-9",
    });
    const without = createLinkToken(
      { projectId: "p1", role: "viewer" },
      SECRET,
    );
    expect(verifyLinkToken(without, SECRET)).toEqual({
      ok: true,
      projectId: "p1",
      role: "viewer",
      generation: 0,
    });
  });

  it("changing the user breaks the signature", () => {
    const token = createLinkToken(
      { projectId: "p1", role: "viewer", userId: "user-9" },
      SECRET,
    );
    const [body, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(body!, "base64url").toString()),
        u: "user-1",
      }),
    ).toString("base64url");
    expect(verifyLinkToken(`${forged}.${signature}`, SECRET)).toEqual({
      ok: false,
      reason: "bad signature",
    });
  });
});
