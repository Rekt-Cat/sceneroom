import { issueCollabToken } from "@/server/collabToken";
import { projectIdSchema } from "@/server/projectSchemas";
import { notFound, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

/** A short-lived token for the collab server, for a member of the project. The editor asks again at every reconnect. */
export function POST(
  request: Request,
  context: RouteContext<"/api/projects/[id]/token">,
) {
  return withUser(request, async ({ db, user, env }) => {
    const id = projectIdSchema.safeParse((await context.params).id);
    if (!id.success) return notFound();
    const result = await issueCollabToken(db, user, id.data, env.COLLAB_SECRET);
    const response = respond(result);
    // A token must never be kept by a browser cache or a proxy
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
