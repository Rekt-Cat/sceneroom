# SceneRoom: instructions for Claude Code

Real-time collaborative 3D scene editor in the browser ("Figma for 3D"). The owner is learning modern web
development with this project, so correctness, clear structure and documentation matter more than speed hacks.

## Read first in a new session

1. `docs/PLAN.md` ("Current status" block at the top = where we are and the next action)
2. `docs/DECISIONS.md` (why things are the way they are)
3. `docs/WHAT-WE-USED.md` (running list of tools and libraries)

## Repo layout

- `apps/web`: Next.js 16 app (App Router, Turbopack, Tailwind 4). Read `apps/web/AGENTS.md`: Next.js docs for the installed version are in `apps/web/node_modules/next/dist/docs/`. Check them before writing Next.js code.
- `packages/shared`: types and constants shared by the web app and (later) the collab server.
- Planned: `apps/collab-server`, `packages/db`.

## Commands (run from the repo root)

- `pnpm install`: install everything
- `pnpm dev`: start dev servers through Turborepo (web app at http://localhost:3000)
- `pnpm build`, `pnpm lint`, `pnpm check-types`: run through Turborepo
- Node is pinned in `.node-version` (24, managed with fnm). pnpm is pinned in the root `package.json` via Corepack.

## How to work with the owner

- **Implement first, keep replies short.** Do not explain every tool after each step. Instead, append new tools,
  libraries and concepts to `docs/WHAT-WE-USED.md` (name, version, purpose, where used) using the
  `/update-what-we-used` skill whenever something new is added. Explain in full only when asked
  ("what did we use?" or "explain X"): simple words, a Unity comparison (the owner knows Unity), a tiny example,
  caveats, why chosen vs alternatives, likely interview questions.
- **Research before choosing versions or APIs**: official docs and the real latest version from the npm registry. Say what is verified and what is uncertain. Record choices in `docs/DECISIONS.md`.
- **Ask before** risky or machine-level actions (installing software, editing files outside the repo, force-pushing, deleting).
- **Commits**: small, clear messages, **no `Co-Authored-By` or "Generated with" lines**. Never commit secrets (`.env*` is ignored; `.env.example` is the template). Pushing is done by the owner with GitHub Desktop.
- The repo is **public**: keep personal or employer information out of committed files.

## Code practices

- TypeScript `strict`, no `any`. Shared types live in `packages/shared`.
- Validate all outside data (API input, WebSocket messages, uploads, env vars) with Zod.
- Keep scene logic as plain TypeScript functions; React components only display state and call them.
- Small focused functions and components, clear names, comments only for the non-obvious "why".
- Handle errors explicitly (clear user messages, details in logs, no empty `catch`).
- One source of truth for scene data; changes go through defined, undoable actions.
- Check permissions on the server, never trust the client. Limit upload and message sizes.
- Tests: Vitest for logic, Playwright for key flows; write a test with each bug fix.
- Run `pnpm check-types && pnpm lint` before committing.

## Diagrams

After a tool or feature is implemented and working (not after every step), draw a whiteboard-style diagram of its flow
and save it in `docs/diagrams/` (self-contained SVG or HTML).
