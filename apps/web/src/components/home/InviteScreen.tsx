"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/auth/authClient";
import {
  acceptInvitation,
  fetchMe,
  onlineProjectAddress,
  previewInvitation,
} from "@/collab/accountClient";

type Preview =
  | { state: "loading" }
  | { state: "ok"; projectName: string; role: string }
  | { state: "problem"; text: string };

const BUTTON =
  "rounded-md bg-ed-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ed-accent";

/**
 * What an invitation link opens: it says which project and role the link is for, asks the person to sign in with GitHub if
 * they are not, and then lets them accept. Accepting makes them a member and opens the project online.
 */
export default function InviteScreen({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview>({ state: "loading" });
  /** undefined = not known yet, null = not signed in */
  const [me, setMe] = useState<{ id: string; name: string } | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    previewInvitation(token).then(
      (found) => {
        if (!cancelled) setPreview({ state: "ok", ...found });
      },
      (failure: unknown) => {
        if (!cancelled) {
          setPreview({
            state: "problem",
            text:
              failure instanceof Error
                ? failure.message
                : "This invitation could not be read.",
          });
        }
      },
    );
    void fetchMe().then((who) => {
      if (!cancelled) setMe(who);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function signIn() {
    setProblem(null);
    const result = await authClient.signIn.social({
      provider: "github",
      // Come back to this page, signed in
      callbackURL: window.location.pathname,
    });
    if (result.error) {
      console.error("Sign-in failed:", result.error);
      setProblem("Could not start the GitHub sign-in. Try again.");
    }
  }

  async function accept() {
    setBusy(true);
    setProblem(null);
    try {
      const joined = await acceptInvitation(token);
      if (joined.entrySceneId) {
        router.push(
          onlineProjectAddress({
            id: joined.projectId,
            entrySceneId: joined.entrySceneId,
          }),
        );
      } else {
        setProblem(
          `You are now a member of "${joined.projectName}", but its owner has to open it once more before you can. Ask them to.`,
        );
      }
    } catch (failure) {
      console.error("Accepting the invitation failed:", failure);
      setProblem(
        failure instanceof Error
          ? failure.message
          : "Could not accept the invitation. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-ed-bg p-6 text-ed-text">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-ed-line bg-ed-panel p-6">
        <h1 className="text-lg font-semibold">Invitation</h1>

        {preview.state === "loading" && (
          <p className="text-sm text-ed-text-2">Reading the invitation…</p>
        )}

        {preview.state === "problem" && (
          <p
            role="alert"
            data-testid="invite-problem"
            className="text-sm text-ed-danger"
          >
            {preview.text}
          </p>
        )}

        {preview.state === "ok" && (
          <>
            <p className="text-sm" data-testid="invite-summary">
              You are invited to <strong>{preview.projectName}</strong> as{" "}
              <strong>{preview.role}</strong>.
            </p>
            {me === undefined && (
              <p className="text-sm text-ed-text-2">Checking who you are…</p>
            )}
            {me === null && (
              <>
                <p className="text-sm text-ed-text-2">
                  Sign in first, then you can accept.
                </p>
                <button type="button" className={BUTTON} onClick={signIn}>
                  Sign in with GitHub
                </button>
              </>
            )}
            {me && (
              <>
                <p className="text-sm text-ed-text-2">
                  Signed in as {me.name}.
                </p>
                <button
                  type="button"
                  className={BUTTON}
                  disabled={busy}
                  onClick={() => void accept()}
                >
                  Accept invitation
                </button>
              </>
            )}
          </>
        )}

        {problem && (
          <p
            role="alert"
            data-testid="invite-problem"
            className="text-sm text-ed-danger"
          >
            {problem}
          </p>
        )}
        <Link href="/" className="text-xs text-ed-text-2 underline">
          Go to your projects
        </Link>
      </div>
    </main>
  );
}
