import { createInvitation, listInvitations } from "@/server/invitations";
import {
  createInvitationSchema,
  projectIdSchema,
} from "@/server/projectSchemas";
import { notFound, readBody, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

type Context = RouteContext<"/api/projects/[id]/invitations">;

/** The invitations of a project, without their secrets (owner only). */
export function GET(request: Request, context: Context) {
  return withUser(request, async ({ db, user }) => {
    const id = projectIdSchema.safeParse((await context.params).id);
    if (!id.success) return notFound();
    return respond(await listInvitations(db, user, id.data));
  });
}

/** Makes an invitation link: `{ role, days? }` (owner only). The secret is in the answer once and never again. */
export function POST(request: Request, context: Context) {
  return withUser(request, async ({ db, user }) => {
    const id = projectIdSchema.safeParse((await context.params).id);
    if (!id.success) return notFound();
    const body = await readBody(request, createInvitationSchema);
    if (!body.ok) return body.response;
    const result = await createInvitation(db, user, id.data, body.data);
    const response = respond(result, 201);
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
