# SceneRoom

A browser-based, real-time collaborative 3D scene editor, like Figma but for 3D environments.
Several people open the same scene and edit it together, live.

> **Status: in development.** The editor works fully on its own in the browser; the online part (sharing, accounts) runs
> locally and is not deployed yet (that is the next big step). An early version of the editor is live at
> https://sceneroom.vercel.app.

## What works today

- **The editor** (no account, no server needed): shapes, models, lights, characters and plants; modifiers; edit mode (points,
  edges, faces, extrude, bevel, loop cut and more); UV unwrapping; texture painting and baking; projects with several scenes
  and prefabs; undo and redo; import and export (`.glb`, `.sceneroom` files). Everything is saved in the browser.
- **Live collaboration:** a shared scene merges everyone's edits (Yjs); you see who is there, what they have selected and where
  their pointer is; each person has their own Undo; selecting an object holds it for everyone else.
- **Sharing and accounts:** share links (edit or view only), or sign in with GitHub, put a project online, invite people for a
  role (owner, editor, commenter, viewer) and remove them.

## Stack

TypeScript, Next.js (React), three.js via React Three Fiber, Zustand, Zod, Yjs and Hocuspocus for live sync, PostgreSQL with
Prisma (in Docker), Better Auth, Vitest and Playwright for tests, GitHub Actions. Why each tool and not its alternatives:
`docs/overview/WHY-THESE-TOOLS.md`.

## Run it

```
pnpm install
pnpm dev                                          # the editor at http://localhost:3000 (works alone)
```

The online part and accounts also need Postgres, a GitHub OAuth app and the collab server; the steps are in
`docs/dev/SETUP-ACCOUNTS.md`. Node and pnpm versions are pinned (`.node-version`, `package.json`).

## Where to read more

- `docs/README.md`: the documents, sorted by topic (plan, decisions, design of the online part, setup guides).
- `docs/diagrams/README.md`: the diagrams. `docs/diagrams/overview/whole-app.html` shows every part and how they connect;
  `docs/diagrams/overview/script-flow.html` shows which scripts run when.

## Project goals

- Learn and demonstrate a modern full-stack web stack end to end.
- Document decisions and trade-offs as the project grows (see `docs/README.md`).
