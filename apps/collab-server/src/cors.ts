import type { IncomingMessage } from "node:http";

/**
 * The headers that let a web page from an allowed address call the server (CORS). The browser asks first (`OPTIONS`) and
 * only sends the real call if the answer allows its origin. Origins that are not in the list get no permission.
 */
export function corsHeaders(
  request: IncomingMessage,
  allowedOrigins: readonly string[],
  methods: string,
): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = methods;
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}
