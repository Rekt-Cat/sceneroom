import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * `GET /health`: answers 200 `{ "status": "ok" }` while the server is running. For a host's health check (it restarts a
 * server that stops answering) and for a quick look from a browser. It says nothing about the database or the files and
 * shows no settings. Returns false when the request is not for it.
 */
export function handleHealthRequest(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/health") return false;
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return true;
  }
  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(
    request.method === "HEAD" ? undefined : JSON.stringify({ status: "ok" }),
  );
  return true;
}
