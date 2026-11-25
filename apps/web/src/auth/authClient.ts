"use client";

import { createAuthClient } from "better-auth/react";

/** The browser's side of sign-in: `useSession`, `signIn.social`, `signOut`. Talks to /api/auth on this site. */
export const authClient = createAuthClient();
