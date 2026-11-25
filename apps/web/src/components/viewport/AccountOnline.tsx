"use client";

import { useEffect, useState } from "react";
import { fetchMe, putProjectOnline } from "@/collab/accountClient";
import { connectCollab } from "@/collab/collabController";
import { useCollabStore } from "@/collab/collabStore";
import { saveConnection } from "@/collab/savedConnection";
import { collabServerUrl } from "@/collab/serverAddress";
import { createAccountTokenSource } from "@/collab/tokenSource";
import { useProjectStore } from "@/store/projectStore";

/**
 * In the Share box, for a signed-in person whose project is not online yet: put it online with the account (the person
 * becomes its owner). Shows nothing when signed out, when accounts are not set up, or when the project is already online.
 */
export default function AccountOnline({ projectId }: { projectId: string }) {
  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((found) => {
      if (!cancelled) setMe(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const online = useCollabStore((state) => state.active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me || online) return null;

  async function goOnline() {
    setBusy(true);
    setError(null);
    try {
      const { name, activeSceneId } = useProjectStore.getState();
      await putProjectOnline(projectId, name, activeSceneId);
      const url = collabServerUrl();
      saveConnection(projectId, { kind: "account", url });
      connectCollab({
        projectId,
        url,
        token: createAccountTokenSource(projectId),
      });
    } catch (failure) {
      console.error("Could not put the project online:", failure);
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not put the project online.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-b border-ed-line pb-3">
      <p className="text-xs text-ed-text-2">
        Signed in as {me.name}. Put this project online with your account and
        you are its owner.
      </p>
      <button
        type="button"
        onClick={goOnline}
        disabled={busy}
        className="self-start rounded-md bg-ed-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        Put online with my account
      </button>
      {error && (
        <p role="alert" className="text-xs text-ed-danger">
          {error}
        </p>
      )}
    </div>
  );
}
