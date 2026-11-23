"use client";

import { useState } from "react";
import { useCollabStore } from "@/collab/collabStore";
import { NAME_MAX_LENGTH, defaultName } from "@/collab/presence";

/** How many other people get their own circle before "+N". */
const MAX_AVATARS = 4;

function Avatar({
  name,
  color,
  ring,
}: {
  name: string;
  color: string;
  ring?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      style={{ backgroundColor: color }}
      className={`grid size-6 place-items-center rounded-full text-[11px] font-semibold text-[#13202a] ${
        ring ? "ring-2 ring-ed-text-3" : ""
      }`}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** Your own circle: click it to change the name others see. */
function MyName() {
  const me = useCollabStore((state) => state.me);
  const myName = useCollabStore((state) => state.myName);
  const setMyName = useCollabStore((state) => state.setMyName);
  const [open, setOpen] = useState(false);
  if (!me) return null;
  const shown = myName ?? defaultName(me.clientId);
  return (
    <div className="relative">
      <button
        type="button"
        data-testid="presence-me"
        aria-label={`You are ${shown}. Change your name`}
        aria-expanded={open}
        title={`You are ${shown}. Click to change your name.`}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full focus-visible:outline-2 focus-visible:outline-ed-accent"
      >
        <Avatar name={shown} color={me.color} ring />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Your name"
          className="absolute top-8 right-0 z-30 flex w-56 flex-col gap-2 rounded-lg border border-ed-border bg-ed-panel p-3 text-xs shadow-lg"
        >
          <label className="flex flex-col gap-1 text-ed-text-2">
            Name others see
            <input
              autoFocus
              defaultValue={shown}
              maxLength={NAME_MAX_LENGTH}
              aria-label="Name others see"
              className="rounded-md border border-ed-border bg-ed-bg px-2 py-1 text-sm text-ed-text focus-visible:outline-2 focus-visible:outline-ed-accent"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  setMyName(event.currentTarget.value);
                  setOpen(false);
                } else if (event.key === "Escape") {
                  setOpen(false);
                }
              }}
              onBlur={(event) => setMyName(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            disabled={myName === null}
            onClick={() => {
              setMyName(null);
              setOpen(false);
            }}
            title={`Go back to ${defaultName(me.clientId)}`}
            className="self-start rounded-md px-2 py-1 text-ed-text-2 hover:bg-ed-raised hover:text-ed-text disabled:opacity-40"
          >
            Reset name
          </button>
        </div>
      )}
    </div>
  );
}

/** Who else is in this scene (coloured circles with their initial), and you. Only for a shared project. */
export default function PresenceBar() {
  const active = useCollabStore((state) => state.active);
  const people = useCollabStore((state) => state.people);
  if (!active) return null;
  const shown = people.slice(0, MAX_AVATARS);
  const more = people.length - shown.length;
  return (
    <div
      data-testid="presence-bar"
      className="ml-2 flex items-center gap-1"
      aria-label="People in this scene"
    >
      {shown.map((person) => (
        <span
          key={person.clientId}
          role="img"
          data-testid="presence-person"
          aria-label={person.name}
          title={person.name}
        >
          <Avatar name={person.name} color={person.color} />
        </span>
      ))}
      {more > 0 && (
        <span
          title={people
            .slice(MAX_AVATARS)
            .map((person) => person.name)
            .join(", ")}
          className="text-xs text-ed-text-3"
        >
          +{more}
        </span>
      )}
      <MyName />
    </div>
  );
}
