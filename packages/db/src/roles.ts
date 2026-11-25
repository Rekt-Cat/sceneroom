import { Role } from "./generated/enums";

export { Role };

/** What a role may do (docs/backend/ACCOUNTS.md, section 4). One place to ask; routes never compare role names. */
export type Permissions = {
  canEdit: boolean;
  canInvite: boolean;
  canDeleteProject: boolean;
};

const PERMISSIONS: Record<Role, Permissions> = {
  owner: { canEdit: true, canInvite: true, canDeleteProject: true },
  editor: { canEdit: true, canInvite: false, canDeleteProject: false },
  commenter: { canEdit: false, canInvite: false, canDeleteProject: false },
  viewer: { canEdit: false, canInvite: false, canDeleteProject: false },
};

export function permissionsOf(role: Role): Permissions {
  return PERMISSIONS[role];
}

/** The collab server knows two kinds of connection: read-write and read-only. */
export function collabAccess(role: Role): "read-write" | "read-only" {
  return permissionsOf(role).canEdit ? "read-write" : "read-only";
}
