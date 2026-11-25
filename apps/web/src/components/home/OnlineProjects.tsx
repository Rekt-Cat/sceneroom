"use client";

import { useEffect, useState } from "react";
import {
  fetchMe,
  listMyProjects,
  onlineProjectAddress,
  type OnlineProject,
} from "@/collab/accountClient";

/**
 * The projects the signed-in person is a member of (their own put online, and ones they were invited to), with their role.
 * Shows nothing when signed out, when accounts are not set up, or when there are none.
 */
export default function OnlineProjects() {
  const [projects, setProjects] = useState<OnlineProject[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const me = await fetchMe();
      if (!me) return;
      try {
        const mine = await listMyProjects();
        if (!cancelled) setProjects(mine);
      } catch (failure) {
        console.warn("Could not list the online projects:", failure);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (projects.length === 0) return null;
  return (
    <section className="mt-8" aria-labelledby="online-projects-h">
      <h2 id="online-projects-h" className="mb-3 text-base font-semibold">
        Online projects
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <li key={project.id}>
            <a
              href={onlineProjectAddress(project)}
              className="flex items-center justify-between gap-3 rounded-lg border border-ed-line bg-ed-panel px-4 py-3 text-sm hover:border-ed-line-strong focus-visible:outline-2 focus-visible:outline-ed-accent"
            >
              <span className="min-w-0 truncate font-medium">
                {project.name}
              </span>
              <span className="shrink-0 text-xs text-ed-text-2">
                {project.role}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
