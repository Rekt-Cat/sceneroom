import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signs a request from the web app to the collab server's internal routes (for example "disconnect this person"). The
 * signature covers the time and the exact body, so it cannot be reused for another body, and an old one is refused.
 * Made with the same secret as the tokens (COLLAB_SECRET), which only the two servers know.
 */
export function signAdminRequest(
  secret: string,
  timestampSeconds: number,
  body: string,
): string {
  return createHmac("sha256", secret)
    .update(`${timestampSeconds}.${body}`)
    .digest("hex");
}

/** How far a request's time may be from now, in seconds (clocks differ a little; old requests must not work forever). */
export const ADMIN_MAX_SKEW_SECONDS = 60;

export type AdminCheck = { ok: true } | { ok: false; reason: string };

export function verifyAdminRequest(
  secret: string,
  timestampSeconds: number,
  body: string,
  signature: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): AdminCheck {
  if (!Number.isInteger(timestampSeconds)) {
    return { ok: false, reason: "no time" };
  }
  if (Math.abs(nowSeconds - timestampSeconds) > ADMIN_MAX_SKEW_SECONDS) {
    return { ok: false, reason: "stale" };
  }
  const expected = Buffer.from(
    signAdminRequest(secret, timestampSeconds, body),
    "hex",
  );
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true };
}
