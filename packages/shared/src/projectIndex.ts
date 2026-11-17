import { z } from "zod";
import { MAX_SCENE_NAME_LENGTH, type Project } from "./project";

/** The most projects kept in one browser (each is a full record; this keeps the home screen and the storage sane). */
export const MAX_LOCAL_PROJECTS = 100;

/**
 * What the home screen knows about a project without opening it: enough for a card. The project itself
 * (all its scenes) is a record of its own, loaded only when it is opened.
 */
export const projectEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(MAX_SCENE_NAME_LENGTH),
  /** Milliseconds since 1970. */
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  scenes: z.number().int().min(1),
});

export const projectIndexSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectEntrySchema).max(MAX_LOCAL_PROJECTS),
});

export type ProjectEntry = z.infer<typeof projectEntrySchema>;
export type ProjectIndex = z.infer<typeof projectIndexSchema>;

export const EMPTY_PROJECT_INDEX: ProjectIndex = { version: 1, projects: [] };

/** The card data of a project. `createdAt` is kept from the first time the project was saved. */
export function entryFor(
  id: string,
  project: Project,
  createdAt: number,
  now: number,
): ProjectEntry {
  return {
    id,
    name: project.name,
    createdAt,
    updatedAt: now,
    scenes: project.scenes.length,
  };
}

/** The index with this entry added, or replacing the one with the same id. */
export function withEntry(
  index: ProjectIndex,
  entry: ProjectEntry,
): ProjectIndex {
  const others = index.projects.filter((p) => p.id !== entry.id);
  return { ...index, projects: [...others, entry] };
}

export function withoutEntry(index: ProjectIndex, id: string): ProjectIndex {
  return { ...index, projects: index.projects.filter((p) => p.id !== id) };
}

export type ProjectSort = "recent" | "name";

/** The entries in the order the home screen shows them: newest edit first, or by name. */
export function sortEntries(
  entries: readonly ProjectEntry[],
  sort: ProjectSort,
): ProjectEntry[] {
  return [...entries].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      : b.updatedAt - a.updatedAt || a.name.localeCompare(b.name),
  );
}

/** The entries whose name contains the words typed (any case); all of them for an empty search. */
export function searchEntries(
  entries: readonly ProjectEntry[],
  text: string,
): ProjectEntry[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...entries];
  return entries.filter((entry) => {
    const name = entry.name.toLowerCase();
    return words.every((word) => name.includes(word));
  });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago", then the date. */
export function timeAgo(now: number, then: number): string {
  const ago = Math.max(0, now - then);
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) {
    const minutes = Math.floor(ago / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (ago < DAY) {
    const hours = Math.floor(ago / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(ago / DAY);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(then).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The first letters of a name for the tile of a project that has no picture yet ("My Game" -> "MG"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? Array.from(words[0]!).slice(0, 2)
      : [Array.from(words[0]!)[0]!, Array.from(words[1]!)[0]!];
  return letters.join("").toUpperCase();
}
