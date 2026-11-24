import { acceptInvitation } from "@/server/invitations";
import { tokenBodySchema } from "@/server/projectSchemas";
import { readBody, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

/** The signed-in person uses an invitation link: `{ token }`. They become a member with the invited role. */
export function POST(request: Request) {
  return withUser(request, async ({ db, user }) => {
    const body = await readBody(request, tokenBodySchema);
    if (!body.ok) return body.response;
    const response = respond(await acceptInvitation(db, user, body.data.token));
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
