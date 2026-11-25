"use client";

import { useState } from "react";
import { connectCollab, disconnectCollab } from "@/collab/collabController";
import { useCollabStore } from "@/collab/collabStore";
import { getOwnerKey } from "@/collab/ownerKey";
import {
  isAccountConnection,
  loadConnection,
  saveConnection,
} from "@/collab/savedConnection";
import {
  collabServerUrl,
  configuredServerUrl,
  isWebSocketUrl,
  saveServerOverride,
} from "@/collab/serverAddress";
import {
  ShareError,
  createShareClient,
  type LinkExpiry,
  type LinkRole,
} from "@/collab/shareClient";
import { buildShareLink } from "@/collab/shareLink";
import { useProjectStore } from "@/store/projectStore";
import AccountMembers from "./AccountMembers";
import AccountOnline from "./AccountOnline";

/** The choices for how long a link works. The first one is what is chosen to start with. */
const EXPIRY_CHOICES: { label: string; days: LinkExpiry }[] = [
  { label: "7 days", days: 7 },
  { label: "1 day", days: 1 },
  { label: "30 days", days: 30 },
  { label: "Until I cancel the links", days: undefined },
];

const FIELD =
  "rounded-md border border-ed-border bg-ed-bg px-2 py-1 text-sm text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent";
const BUTTON =
  "rounded-md bg-ed-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ed-accent";

/**
 * The Share box: makes a link that opens this project for someone else, to edit or only to look at, and cancels all links.
 * Stage A of the permissions (docs/backend/COLLABORATION.md, section 9): whoever has the link has the role it carries.
 */
export default function ShareDialog({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const online = useCollabStore((state) => state.active);
  const readOnly = useCollabStore((state) => state.readOnly);
  const people = useCollabStore((state) => state.people);
  const [role, setRole] = useState<LinkRole>("editor");
  const [days, setDays] = useState<LinkExpiry>(EXPIRY_CHOICES[0]!.days);
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  /** Online with an account: members and invitations are shown instead of the link controls (the two are not mixed). It is read at every render, so it follows the project going online while the box is open (`online` changes then). */
  const saved = loadConnection(projectId);
  const accountMode = saved !== null && isAccountConnection(saved);
  /** The server address typed in the box (used while the project is not online yet). */
  const [typedServer, setTypedServer] = useState(collabServerUrl);

  /** Runs a call to the server, showing what went wrong in words. */
  async function run(work: () => Promise<void>): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (failure) {
      setError(
        failure instanceof ShareError
          ? failure.message
          : "Something went wrong. Try again.",
      );
      if (!(failure instanceof ShareError))
        console.error("Share failed:", failure);
    } finally {
      setBusy(false);
    }
  }

  /** The server to use: the one this project is already online with, else the configured one. */
  const serverUrl = () =>
    loadConnection(projectId)?.url ??
    (isWebSocketUrl(typedServer) ? typedServer : collabServerUrl());

  function clientFor() {
    const ownerKey = getOwnerKey(projectId, true);
    if (!ownerKey) {
      throw new ShareError(
        "This browser does not allow saving the key that makes you the owner, so sharing is not possible here.",
      );
    }
    return createShareClient({ url: serverUrl(), projectId, ownerKey });
  }

  /** Goes online as the owner: an editor link that does not run out (the owner can always cancel it with the others). */
  async function goOnlineAsOwner(client: ReturnType<typeof clientFor>) {
    const token = await client.makeLink("editor");
    saveConnection(projectId, { url: serverUrl(), token });
    connectCollab({ projectId, url: serverUrl(), token });
  }

  const createLink = () =>
    run(async () => {
      const client = clientFor();
      const token = await client.makeLink(role, days);
      if (!useCollabStore.getState().active) await goOnlineAsOwner(client);
      setLink(
        buildShareLink({
          origin: window.location.origin,
          projectId,
          url: serverUrl(),
          token,
          sceneId: useProjectStore.getState().activeSceneId,
        }),
      );
    });

  const cancelLinks = () =>
    run(async () => {
      const client = clientFor();
      await client.cancelAllLinks();
      setLink(null);
      setConfirmCancel(false);
      // The owner's own connection was cancelled with the others: come back with a new one
      disconnectCollab();
      await goOnlineAsOwner(client);
      setMessage(
        "All links are cancelled and everyone was disconnected. Make a new link to invite people again.",
      );
    });

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setMessage("Link copied.");
    } catch (failure) {
      console.warn("Could not copy to the clipboard:", failure);
      setMessage("Could not copy by itself: select the link and copy it.");
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Share this project"
      className="absolute top-10 left-0 z-30 flex w-[26rem] flex-col gap-3 rounded-lg border border-ed-border bg-ed-panel p-4 text-sm shadow-lg"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Share this project</h2>
          <p className="mt-0.5 text-xs text-ed-text-2">
            {online
              ? `Online now with ${people.length} other ${people.length === 1 ? "person" : "people"}.`
              : "Making a link also puts this project online."}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md px-2 text-ed-text-2 hover:bg-ed-raised hover:text-ed-text"
        >
          ×
        </button>
      </div>

      <AccountOnline projectId={projectId} />

      {accountMode ? (
        <AccountMembers projectId={projectId} />
      ) : readOnly ? (
        <p className="text-xs text-ed-text-2">
          This project is open as view only, so it cannot make links.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ed-text-2">
                Collab server
                <input
                  value={online ? serverUrl() : typedServer}
                  disabled={online}
                  onChange={(event) => setTypedServer(event.target.value)}
                  onBlur={() => {
                    if (isWebSocketUrl(typedServer))
                      saveServerOverride(typedServer);
                  }}
                  aria-label="Collab server address"
                  aria-invalid={!online && !isWebSocketUrl(typedServer)}
                  className={`${FIELD} font-mono disabled:opacity-60`}
                />
              </label>
              <button
                type="button"
                disabled={online || typedServer === configuredServerUrl()}
                onClick={() => {
                  saveServerOverride(null);
                  setTypedServer(configuredServerUrl());
                }}
                title={`Go back to ${configuredServerUrl()}`}
                className="rounded-md px-2 py-1 text-xs text-ed-text-2 hover:bg-ed-raised hover:text-ed-text disabled:opacity-40"
              >
                Reset server
              </button>
            </div>
            {!online && !isWebSocketUrl(typedServer) && (
              <p className="text-xs text-ed-danger">
                The address must start with ws:// or wss://
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1 text-xs text-ed-text-2">
              Can
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as LinkRole)}
                aria-label="What the link allows"
                className={FIELD}
              >
                <option value="editor">Edit</option>
                <option value="viewer">View only</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-ed-text-2">
              The link works for
              <select
                value={days ?? "never"}
                onChange={(event) =>
                  setDays(
                    event.target.value === "never"
                      ? undefined
                      : Number(event.target.value),
                  )
                }
                aria-label="How long the link works"
                className={FIELD}
              >
                {EXPIRY_CHOICES.map((choice) => (
                  <option key={choice.label} value={choice.days ?? "never"}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void createLink()}
            className={`${BUTTON} self-start`}
          >
            Create link
          </button>

          {link && (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  aria-label="The link"
                  data-testid="share-link"
                  onFocus={(event) => event.currentTarget.select()}
                  className={`${FIELD} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-md px-3 py-1 text-sm text-ed-text-2 hover:bg-ed-raised hover:text-ed-text"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-ed-text-2">
                Whoever has this link can{" "}
                {role === "editor" ? "change" : "look at"} the project. The
                person opening it must be able to reach the server at{" "}
                <span className="font-mono">{serverUrl()}</span>
                {serverUrl().includes("127.0.0.1") ||
                serverUrl().includes("localhost")
                  ? " (that address only works on this computer)"
                  : ""}
                . Only the open scene is shared.
              </p>
            </div>
          )}

          <div className="border-t border-ed-line pt-3">
            {confirmCancel ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-ed-text-2">
                  Every link made for this project stops working and everyone is
                  disconnected. You stay connected.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void cancelLinks()}
                    className="rounded-md bg-ed-danger px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Cancel all links
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    className="rounded-md px-3 py-1.5 text-sm text-ed-text-2 hover:bg-ed-raised"
                  >
                    Keep them
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy || !online}
                onClick={() => setConfirmCancel(true)}
                title={
                  online
                    ? "Stop everyone who has a link"
                    : "Nothing is shared yet"
                }
                className="rounded-md px-2 py-1 text-xs text-ed-text-2 hover:bg-ed-raised hover:text-ed-text disabled:opacity-40"
              >
                Cancel all links…
              </button>
            )}
          </div>
        </>
      )}

      {message && (
        <p role="status" className="text-xs text-ed-y">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-ed-danger">
          {error}
        </p>
      )}
    </div>
  );
}
