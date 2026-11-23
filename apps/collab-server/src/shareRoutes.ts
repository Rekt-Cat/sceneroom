import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { corsHeaders } from "./cors";
import { projectIdSchema } from "./documentName";
import { createLinkToken, LINK_ROLES } from "./linkToken";
import type { Logger } from "./logger";
import type { OwnerStore } from "./ownerStore";

export type ShareRouteOptions = {
  owners: OwnerStore;
  /** The secret link tokens are signed with. */
  secret: string;
  logger: Logger;
  allowedOrigins: readonly string[];
  /** Disconnects everyone connected to a project (used when its links are cancelled). */
  closeProjectConnections: (projectId: string) => void;
  /** Seconds since 1970. For tests. */
  now?: () => number;
};

/** The owner key is a long random string made in the owner's browser. */
const OWNER_KEY_MIN = 32;
const OWNER_KEY_MAX = 200;
const MAX_BODY_BYTES = 2048;
const MAX_EXPIRY_DAYS = 365;

const ROUTE = /^\/share\/([^/]+)(\/reset)?$/;

const makeLinkBody = z.object({
  role: z.enum(LINK_ROLES),
  /** How long the link works. Missing = until the links are cancelled. */
  expiresInDays: z.number().int().min(1).max(MAX_EXPIRY_DAYS).optional(),
});

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string>,
): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readSmallBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const fingerprint = (key: string) =>
  createHash("sha256").update(key).digest("hex");

function sameFingerprint(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The sharing routes of the collab server (stage A of the permissions, docs/backend/COLLABORATION.md, section 9). Returns
 * false when the request is not for them.
 *
 * - `POST /share/<project>` with the owner key and `{ role, expiresInDays? }`: makes a link token for the project. The
 *   first person to ask for a project becomes its owner (the server keeps a fingerprint of their key); after that only that
 *   key works.
 * - `POST /share/<project>/reset` with the owner key: cancels every link made so far and disconnects everyone.
 *
 * The owner key is sent in the `Authorization` header and never stored in clear on the server.
 */
export async function handleShareRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: ShareRouteOptions,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;
  const cors = corsHeaders(request, options.allowedOrigins, "POST, OPTIONS");
  const method = request.method ?? "GET";

  if (method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();
    return true;
  }
  if (method !== "POST") {
    json(
      response,
      405,
      { error: "Method not allowed" },
      { ...cors, Allow: "POST, OPTIONS" },
    );
    return true;
  }

  const projectId = projectIdSchema.safeParse(match[1]);
  if (!projectId.success) {
    json(response, 400, { error: "Not a valid project id" }, cors);
    return true;
  }
  const isReset = match[2] === "/reset";

  const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? "");
  const key = bearer?.[1] ?? "";
  if (key.length < OWNER_KEY_MIN || key.length > OWNER_KEY_MAX) {
    json(response, 401, { error: "A valid owner key is needed" }, cors);
    return true;
  }
  const keyHash = fingerprint(key);

  try {
    // Who owns the project? The first person to ask for sharing claims it (not on a reset: nothing to cancel yet)
    let owner = options.owners.ownerHash(projectId.data);
    if (!owner && !isReset && options.owners.claim(projectId.data, keyHash)) {
      options.logger.info(`share: ${projectId.data} claimed by a new owner`);
      owner = keyHash;
    }
    owner ??= options.owners.ownerHash(projectId.data);
    if (!owner || !sameFingerprint(owner, keyHash)) {
      options.logger.warn(`share: refused ${url.pathname}: not the owner key`);
      json(
        response,
        owner ? 403 : 404,
        {
          error: owner
            ? "This is not the owner's key"
            : "Nothing is shared yet",
        },
        cors,
      );
      return true;
    }

    if (isReset) {
      const generation = options.owners.nextGeneration(projectId.data);
      options.closeProjectConnections(projectId.data);
      options.logger.info(
        `share: ${projectId.data} links cancelled, generation ${generation}`,
      );
      json(response, 200, { generation }, cors);
      return true;
    }

    const raw = await readSmallBody(request);
    let body: unknown;
    try {
      body = raw === null ? undefined : JSON.parse(raw);
    } catch {
      body = undefined;
    }
    const parsed = makeLinkBody.safeParse(body);
    if (!parsed.success) {
      json(
        response,
        400,
        {
          error: "Send { role: 'editor' | 'viewer', expiresInDays?: 1 to 365 }",
        },
        cors,
      );
      return true;
    }
    const now = options.now?.() ?? Math.floor(Date.now() / 1000);
    const expires = parsed.data.expiresInDays
      ? now + parsed.data.expiresInDays * 86_400
      : undefined;
    const token = createLinkToken(
      {
        projectId: projectId.data,
        role: parsed.data.role,
        generation: options.owners.generation(projectId.data),
      },
      options.secret,
      expires,
    );
    json(response, 200, { token }, cors);
    return true;
  } catch (error) {
    options.logger.error(`share: ${url.pathname} failed`, error);
    if (!response.headersSent)
      json(response, 500, { error: "Server error" }, cors);
    return true;
  }
}
