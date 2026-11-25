import { z } from "zod";
import {
  INVITATION_DEFAULT_DAYS,
  INVITATION_MAX_DAYS,
  MAX_PROJECT_NAME_LENGTH,
} from "./limits";

/** The id is the local project's id, the same one the collab server uses in its document names. */
export const projectIdSchema = z.uuid();
export const userIdSchema = z.string().min(1).max(200);

export const createProjectSchema = z.object({
  id: projectIdSchema,
  name: z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH),
  /** The scene a new member's browser opens first (the id of the scene that is open when the project goes online). */
  entrySceneId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
});

/** A member's role can be changed to these. Owner is not here: a project has one owner, set when it is created. */
export const MEMBER_ROLES = ["editor", "commenter", "viewer"] as const;
export const changeRoleSchema = z.object({ role: z.enum(MEMBER_ROLES) });

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const invitationIdSchema = z.uuid();

export const createInvitationSchema = z.object({
  role: z.enum(MEMBER_ROLES),
  days: z
    .number()
    .int()
    .min(1)
    .max(INVITATION_MAX_DAYS)
    .default(INVITATION_DEFAULT_DAYS),
});

/** The secret in an invitation link: 32 random bytes as base64url (43 characters). Anything else is refused at once. */
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const tokenBodySchema = z.object({ token: invitationTokenSchema });
