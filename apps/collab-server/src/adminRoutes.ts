import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { projectIdSchema, verifyAdminRequest } from "@sceneroom/link-token";
import type { Logger } from "./logger";

export type AdminRouteOptions = {
  /** The secret the web app and this server share (COLLAB_SECRET). */
  secret: string;
  logger: Logger;
  /**
   * Closes the connections of a project: one person's (`userId`), or everybody's when `userId` is null. Returns how many
   * were closed.
   */
  disconnect: (projectId: string, userId: string | null) => number;
  /** Seconds since 1970. For tests. */
  now?: () => number;
};

const MAX_BODY_BYTES = 1024;
const ROUTE = "/internal/disconnect";

const body = z.object({
  projectId: projectIdSchema,
  /** Missing = everybody connected to the project. */
  userId: z.string().min(1).max(200).optional(),
});

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * The internal route the web app calls when someone is removed from a project, or their role changes, or the project is
 * deleted: `POST /internal/disconnect` with `{ projectId, userId? }`, signed with the shared secret
 * (`X-Admin-Timestamp` and `X-Admin-Signature`, see packages/link-token/src/adminRequest.ts). Returns false when the request
 * is not for this route. It sends no CORS headers: browsers must never call it.
 *
 * The closed browsers connect again at once; their token is asked for again, and a person who is no longer a member is
 * refused.
 */
export async function handleAdminRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: AdminRouteOptions,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== ROUTE) return false;
  if (request.method !== "POST") {
    json(response, 405, { error: "Use POST." });
    return true;
  }
  const raw = await readBody(request);
  if (raw === null) {
    json(response, 413, { error: "The request is too big." });
    return true;
  }
  const timestamp = Number(request.headers["x-admin-timestamp"]);
  const signature = String(request.headers["x-admin-signature"] ?? "");
  const check = verifyAdminRequest(
    options.secret,
    timestamp,
    raw,
    signature,
    options.now?.(),
  );
  if (!check.ok) {
    options.logger.warn(`admin: refused ${ROUTE}: ${check.reason}`);
    json(response, 401, { error: "Not allowed." });
    return true;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    json(response, 400, { error: "The request is not valid JSON." });
    return true;
  }
  const parsed = body.safeParse(value);
  if (!parsed.success) {
    json(response, 400, { error: "The request is not valid." });
    return true;
  }
  const closed = options.disconnect(
    parsed.data.projectId,
    parsed.data.userId ?? null,
  );
  options.logger.info(
    `admin: disconnected ${closed} connection(s) of ${parsed.data.projectId}${parsed.data.userId ? ` (one person)` : ""}`,
  );
  json(response, 200, { closed });
  return true;
}
