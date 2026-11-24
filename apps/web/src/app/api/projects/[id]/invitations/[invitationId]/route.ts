import { revokeInvitation } from "@/server/invitations";
import { invitationIdSchema, projectIdSchema } from "@/server/projectSchemas";
import { notFound, respond, withUser } from "@/server/routeHelpers";

export const runtime = "nodejs";

/** Cancels an invitation that nobody used yet (owner only). */
export function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]/invitations/[invitationId]">,
) {
  return withUser(request, async ({ db, user }) => {
    const params = await context.params;
    const projectId = projectIdSchema.safeParse(params.id);
    const invitationId = invitationIdSchema.safeParse(params.invitationId);
    if (!projectId.success || !invitationId.success) return notFound();
    return respond(
      await revokeInvitation(db, user, projectId.data, invitationId.data),
    );
  });
}
