"use client";

import { useState } from "react";
import { authClient } from "@/auth/authClient";

const button =
  "rounded-md border border-ed-line-strong px-3 py-1 text-xs text-ed-text-2 transition-colors hover:bg-ed-raised hover:text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent disabled:opacity-50";

/**
 * "Sign in with GitHub" / the signed-in name with "Sign out". Shows nothing when accounts are not set up on this server
 * (the sign-in routes answer 503), so the editor works as before without a database.
 */
export default function AccountButton() {
  const { data, isPending, error } = authClient.useSession();
  const [message, setMessage] = useState<string | null>(null);

  if (isPending || error) return null;

  const signIn = async () => {
    setMessage(null);
    const result = await authClient.signIn.social({
      provider: "github",
      callbackURL: window.location.pathname,
    });
    if (result.error) {
      console.error("Sign-in failed:", result.error);
      setMessage("Could not start the GitHub sign-in. Try again.");
    }
  };

  const signOut = async () => {
    setMessage(null);
    const result = await authClient.signOut();
    if (result.error) {
      console.error("Sign-out failed:", result.error);
      setMessage("Could not sign out. Try again.");
    }
  };

  return (
    <div className="ml-auto flex items-center gap-2 text-xs">
      {message && (
        <span role="status" className="text-ed-text-3">
          {message}
        </span>
      )}
      {data ? (
        <>
          <span data-testid="account-name" className="text-ed-text-2">
            {data.user.name}
          </span>
          <button type="button" className={button} onClick={signOut}>
            Sign out
          </button>
        </>
      ) : (
        <button type="button" className={button} onClick={signIn}>
          Sign in with GitHub
        </button>
      )}
    </div>
  );
}
