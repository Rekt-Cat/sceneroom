import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { corsHeaders } from "./cors";
import { projectIdSchema } from "./documentName";
import { FILE_ID_PATTERN, type FileStore } from "./fileStore";
import { verifyLinkToken } from "./linkToken";
import type { Logger } from "./logger";

export type FileRouteOptions = {
  store: FileStore;
  secret: string;
  logger: Logger;
  /** The biggest single file, in bytes. */
  maxFileBytes: number;
  /** The most bytes all the files of one project may take together. */
  maxProjectBytes: number;
  /** Web pages from these origins may call the file routes (CORS). */
  allowedOrigins: readonly string[];
  /** The generation of links that is valid for a project (links of an older one were cancelled). */
  generationOf: (projectId: string) => number;
};

/** `/files/<projectId>/<fileId>`: the only address the file routes answer to. */
const ROUTE = /^\/files\/([^/]+)\/([^/?#]+)$/;

function send(
  response: ServerResponse,
  status: number,
  message: string,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    ...headers,
  });
  response.end(message);
}

/** Reads a request body, giving up as soon as it is bigger than `limit`. null = too big. */
async function readBody(
  request: IncomingMessage,
  limit: number,
): Promise<Buffer | null> {
  const declared = Number(request.headers["content-length"]);
  if (Number.isFinite(declared) && declared > limit) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > limit) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Handles the file routes of the collab server. Returns false when the request is not for them (so the caller can
 * pass it on). Every rule is checked here on the server:
 *
 * - `PUT /files/<project>/<id>`: needs an editor token for that project; the id must be the SHA-256 of the bytes sent;
 *   a file over `maxFileBytes`, or one that would take the project over `maxProjectBytes`, is refused
 * - `GET` and `HEAD` the same address: need an editor or viewer token for that project; 404 if there is no such file
 * - `OPTIONS`: the browser's check before a call from the web page (CORS), answered for allowed origins only
 */
export async function handleFileRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: FileRouteOptions,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;

  const cors = corsHeaders(
    request,
    options.allowedOrigins,
    "GET, HEAD, PUT, OPTIONS",
  );
  const method = request.method ?? "GET";
  if (method === "OPTIONS") {
    response.writeHead(204, cors);
    response.end();
    return true;
  }
  if (method !== "GET" && method !== "HEAD" && method !== "PUT") {
    send(response, 405, "Method not allowed", {
      ...cors,
      Allow: "GET, HEAD, PUT, OPTIONS",
    });
    return true;
  }

  const projectId = projectIdSchema.safeParse(match[1]);
  const fileId = match[2]!;
  if (!projectId.success || !FILE_ID_PATTERN.test(fileId)) {
    send(response, 400, "Not a valid project or file id", cors);
    return true;
  }

  const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? "");
  const check = bearer
    ? verifyLinkToken(bearer[1]!, options.secret)
    : ({ ok: false, reason: "no token" } as const);
  if (!check.ok) {
    options.logger.warn(
      `files: refused ${method} ${url.pathname}: ${check.reason}`,
    );
    send(response, 401, "Not allowed", cors);
    return true;
  }
  if (
    check.projectId !== projectId.data ||
    check.generation !== options.generationOf(projectId.data)
  ) {
    options.logger.warn(
      `files: refused ${method} ${url.pathname}: token is for another project or was cancelled`,
    );
    send(response, 403, "Not allowed", cors);
    return true;
  }

  try {
    if (method === "PUT") {
      if (check.role !== "editor") {
        options.logger.warn(`files: refused PUT ${url.pathname}: viewer`);
        send(response, 403, "Viewers cannot upload files", cors);
        return true;
      }
      const body = await readBody(request, options.maxFileBytes);
      if (!body) {
        send(response, 413, "The file is too big", cors);
        return true;
      }
      // The id IS the fingerprint of the bytes: a client cannot store other bytes under it
      const fingerprint = createHash("sha256").update(body).digest("hex");
      if (fingerprint !== fileId) {
        options.logger.warn(
          `files: refused PUT ${url.pathname}: bytes do not match the id`,
        );
        send(response, 400, "The bytes do not match the file id", cors);
        return true;
      }
      if (await options.store.has(projectId.data, fileId)) {
        send(response, 200, "Already stored", cors);
        return true;
      }
      const used = await options.store.projectBytes(projectId.data);
      if (used + body.length > options.maxProjectBytes) {
        options.logger.warn(
          `files: refused PUT ${url.pathname}: project is over its file limit`,
        );
        send(response, 413, "This project has reached its file limit", cors);
        return true;
      }
      await options.store.put(projectId.data, fileId, body);
      send(response, 201, "Stored", cors);
      return true;
    }

    const bytes = await options.store.get(projectId.data, fileId);
    if (!bytes) {
      send(response, 404, "No such file", cors);
      return true;
    }
    response.writeHead(200, {
      ...cors,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      // The id is the fingerprint of the bytes, so they never change
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    response.end(method === "HEAD" ? undefined : bytes);
    return true;
  } catch (error) {
    options.logger.error(`files: ${method} ${url.pathname} failed`, error);
    if (!response.headersSent) send(response, 500, "Server error", cors);
    return true;
  }
}
