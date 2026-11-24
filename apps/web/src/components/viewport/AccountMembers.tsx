"use client";

import { useCallback, useEffect, useState } from "react";
import { useCollabStore } from "@/collab/collabStore";
import {
  MEMBER_ROLES,
  changeMemberRole,
  createInvitation,
  fetchMe,
  getProject,
  listInvitations,
  listMembers,
  removeMember,
  revokeInvitation,
  type Invitation,
  type Member,
  type MemberRole,
  type OnlineProject,
} from "@/collab/accountClient";

const FIELD =
  "rounded-md border border-ed-border bg-ed-bg px-2 py-1 text-sm text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent";
const BUTTON =
  "rounded-md bg-ed-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ed-accent";
const LINK_BUTTON =
  "rounded-md px-2 py-1 text-xs text-ed-text-2 hover:bg-ed-raised hover:text-ed-text disabled:opacity-40";

const DAY_CHOICES = [1, 7, 30] as const;

type Loaded = {
  project: OnlineProject;
  myId: string | null;
  members: Member[];
  invitations: Invitation[];
};

/** Everything the panel shows, from the server. The invitations are only asked for by the owner. */
async function readAll(projectId: string): Promise<Loaded> {
  const [project, who, members] = await Promise.all([
    getProject(projectId),
    fetchMe(),
    listMembers(projectId),
  ]);
  const invitations =
    project.role === "owner" ? await listInvitations(projectId) : [];
  return { project, myId: who?.id ?? null, members, invitations };
}

/**
 * In the Share box, for a project that is online with accounts: who is in it, and (for the owner) changing roles, removing
 * people and making invitation links. Every change is made by the web app, which checks the role again on the server; what
 * this shows is only what the person is allowed to ask for.
 */
export default function AccountMembers({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<OnlineProject | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<MemberRole>("viewer");
  const [days, setDays] = useState<number>(7);
  const [link, setLink] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isOwner = project?.role === "owner";

  /** Puts what was read from the server on the screen. */
  const show = useCallback((data: Loaded) => {
    setProject(data.project);
    setMyId(data.myId);
    setMembers(data.members);
    setInvitations(data.invitations);
  }, []);

  const load = useCallback(async () => {
    try {
      show(await readAll(projectId));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load the members.",
      );
    }
  }, [projectId, show]);

  // First load: the answer is put on the screen when it arrives (not synchronously in the effect)
  useEffect(() => {
    let cancelled = false;
    readAll(projectId).then(
      (data) => {
        if (!cancelled) show(data);
      },
      (failure: unknown) => {
        if (!cancelled) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load the members.",
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [projectId, show]);

  // The lists change while the box is open (someone accepts an invitation, the owner removes someone in another window):
  // read them again when someone connects or leaves, and every ten seconds.
  const peopleHere = useCollabStore((state) => state.people.length);
  useEffect(() => {
    const soon = setTimeout(() => void load(), 400);
    const regularly = setInterval(() => void load(), 10_000);
    return () => {
      clearTimeout(soon);
      clearInterval(regularly);
    };
  }, [peopleHere, load]);

  /** Runs a change, then reloads the lists, showing what went wrong in words. */
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      await load();
    } catch (failure) {
      console.error("Members change failed:", failure);
      setError(
        failure instanceof Error
          ? failure.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const makeLink = () =>
    run(async () => {
      const made = await createInvitation(projectId, role, days);
      setLink(`${window.location.origin}/invite/${made.token}`);
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

  if (!project) {
    return error ? (
      <p role="alert" className="text-xs text-ed-danger">
        {error}
      </p>
    ) : (
      <p className="text-xs text-ed-text-2">Loading members…</p>
    );
  }

  const pending = invitations.filter(
    (invitation) => invitation.status === "pending",
  );

  return (
    <div className="flex flex-col gap-3" data-testid="account-members">
      <p className="text-xs text-ed-text-2">
        Online with your account. You are{" "}
        {project.role === "owner" ? "the owner" : `a ${project.role}`}.
      </p>

      <ul className="flex flex-col gap-1" aria-label="Members">
        {members.map((member) => {
          const mine = member.userId === myId;
          const removable = member.role !== "owner" && (isOwner || mine);
          return (
            <li key={member.userId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {member.name}
                {mine ? " (you)" : ""}
                {member.email && (
                  <span className="ml-1 text-xs text-ed-text-3">
                    {member.email}
                  </span>
                )}
              </span>
              {isOwner && member.role !== "owner" ? (
                <select
                  value={member.role}
                  disabled={busy}
                  aria-label={`Role of ${member.name}`}
                  onChange={(event) =>
                    void run(() =>
                      changeMemberRole(
                        projectId,
                        member.userId,
                        event.target.value as MemberRole,
                      ).then(() => undefined),
                    )
                  }
                  className={FIELD}
                >
                  {MEMBER_ROLES.map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-ed-text-2">{member.role}</span>
              )}
              {removable &&
                (confirming === member.userId ? (
                  <span className="flex gap-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await removeMember(projectId, member.userId);
                          setConfirming(null);
                        })
                      }
                      className="rounded-md bg-ed-danger px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {mine ? "Leave" : "Remove"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(null)}
                      className={LINK_BUTTON}
                    >
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirming(member.userId)}
                    className={LINK_BUTTON}
                    aria-label={
                      mine ? "Leave the project" : `Remove ${member.name}`
                    }
                  >
                    {mine ? "Leave…" : "Remove…"}
                  </button>
                ))}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <div className="flex flex-col gap-2 border-t border-ed-line pt-3">
          <p className="text-xs text-ed-text-2">
            Invite someone with a link. They sign in with GitHub and join with
            this role.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-ed-text-2">
              Role
              <select
                value={role}
                aria-label="Invitation role"
                onChange={(event) => setRole(event.target.value as MemberRole)}
                className={FIELD}
              >
                {MEMBER_ROLES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-ed-text-2">
              Works for
              <select
                value={days}
                aria-label="Invitation length"
                onChange={(event) => setDays(Number(event.target.value))}
                className={FIELD}
              >
                {DAY_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice} {choice === 1 ? "day" : "days"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void makeLink()}
              className={BUTTON}
            >
              Make invitation link
            </button>
          </div>
          {link && (
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  aria-label="Invitation link"
                  data-testid="invite-link"
                  onFocus={(event) => event.target.select()}
                  className={`${FIELD} min-w-0 flex-1 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => void copy()}
                  className={BUTTON}
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-ed-text-3">
                Shown once. It can be used by one person.
              </p>
            </div>
          )}
          {pending.length > 0 && (
            <ul
              className="flex flex-col gap-1"
              aria-label="Waiting invitations"
            >
              {pending.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center gap-2 text-xs text-ed-text-2"
                >
                  <span className="flex-1">
                    {invitation.role}, until{" "}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        revokeInvitation(projectId, invitation.id).then(
                          () => undefined,
                        ),
                      )
                    }
                    className={LINK_BUTTON}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
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
