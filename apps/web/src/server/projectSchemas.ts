import { z } from "zod";
import { MAX_PROJECT_NAME_LENGTH } from "./limits";

/** The id is the local project's id, the same one the collab server uses in its document names. */
export const projectIdSchema = z.uuid();
export const userIdSchema = z.string().min(1).max(200);

export const createProjectSchema = z.object({
  id: projectIdSchema,
  name: z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH),
});

/** A member's role can be changed to these. Owner is not here: a project has one owner, set when it is created. */
export const MEMBER_ROLES = ["editor", "commenter", "viewer"] as const;
export const changeRoleSchema = z.object({ role: z.enum(MEMBER_ROLES) });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
