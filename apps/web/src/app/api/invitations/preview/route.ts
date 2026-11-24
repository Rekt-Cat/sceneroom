import { previewInvitation } from "@/server/invitations";
import { tokenBodySchema } from "@/server/projectSchemas";
import { readBody, respond, withAccounts } from "@/server/routeHelpers";

export const runtime = "nodejs";

/**
 * What an invitation link is for (project name and role), for the page that opens before anyone signs in: `{ token }`.
 * A POST so the secret is not in an address that gets logged.
 */
export function POST(request: Request) {
  return withAccounts(request, async ({ db }) => {
    const body = await readBody(request, tokenBodySchema);
    if (!body.ok) return body.response;
    const response = respond(await previewInvitation(db, body.data.token));
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
