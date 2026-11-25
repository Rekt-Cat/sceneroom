/** The most online projects one person may own (each one costs storage on the collab server). */
export const MAX_ONLINE_PROJECTS_PER_USER = 50;
/** The longest a project name may be, in characters. */
export const MAX_PROJECT_NAME_LENGTH = 100;
/** The biggest request body the project routes read, in bytes (they only receive a name or a role). */
export const MAX_REQUEST_BYTES = 4096;
/** How long a collab token from the web app is good for, in seconds. The editor fetches a fresh one at every (re)connect. */
export const COLLAB_TOKEN_TTL_SECONDS = 3600;
/** How long an invitation link works when the owner does not choose, in days. */
export const INVITATION_DEFAULT_DAYS = 7;
/** The longest an invitation link may work, in days. */
export const INVITATION_MAX_DAYS = 30;
/** The most invitations of one project that may be waiting (not used, not revoked, not expired) at once. */
export const MAX_PENDING_INVITATIONS = 20;
