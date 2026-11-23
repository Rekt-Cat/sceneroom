import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { projectIdSchema } from "./documentName";

/** What a link lets you do: "editor" changes the project, "viewer" only looks (enforced on the server). */
export const LINK_ROLES = ["editor", "viewer"] as const;
export type LinkRole = (typeof LINK_ROLES)[number];

const payloadSchema = z.object({
  /** The project this link opens. It opens nothing else. */
  p: projectIdSchema,
  r: z.enum(LINK_ROLES),
  /** Expiry, seconds since 1970. Missing = never expires. */
  e: z.number().int().positive().optional(),
  /**
   * Which generation of links this is. The project's owner can cancel every link at once by moving the project to the
   * next generation (ownerStore.ts); a token of an older generation is no longer accepted. Missing = 0.
   */
  g: z.number().int().min(0).optional(),
});

export type LinkClaims = {
  projectId: string;
  role: LinkRole;
  /** See `g` above. Default 0. */
  generation?: number;
};

export type LinkCheck =
  ({ ok: true } & LinkClaims) | { ok: false; reason: string };

const toBase64Url = (bytes: Uint8Array | string) =>
  Buffer.from(bytes).toString("base64url");

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

/**
 * Makes a link token: the claims, then a signature made with the server's secret. Only someone who knows the
 * secret can make one that passes, and any change to the claims breaks the signature. It is not encrypted
 * (the project id and role can be read), only tamper-proof. Stage A of the permissions (COLLABORATION.md, section 9).
 */
export function createLinkToken(
  claims: LinkClaims,
  secret: string,
  expiresAtSeconds?: number,
): string {
  const payload = payloadSchema.parse({
    p: claims.projectId,
    r: claims.role,
    e: expiresAtSeconds,
    g: claims.generation || undefined,
  });
  const body = toBase64Url(JSON.stringify(payload));
  return `${body}.${toBase64Url(sign(body, secret))}`;
}

/** Checks a token a client sent. Never throws: a bad token is a `{ ok: false }` with a reason for the log. */
export function verifyLinkToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): LinkCheck {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, reason: "not a token" };
  }
  const [body, signature] = parts;
  const expected = sign(body, secret);
  const given = Buffer.from(signature, "base64url");
  // timingSafeEqual needs equal lengths, and compares without leaking where the first difference is
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad signature" };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "unreadable claims" };
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid claims" };
  if (parsed.data.e !== undefined && parsed.data.e <= nowSeconds) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    projectId: parsed.data.p,
    role: parsed.data.r,
    generation: parsed.data.g ?? 0,
  };
}
