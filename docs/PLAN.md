# Plan

## Current status

- **Phase:** 2 (scene model and editing tools) done and tested in the browser on branch `feature/object-actions`; Phase 3 next
- **Done:** Phase 0; Phase 1 (3D viewport, live at https://sceneroom.vercel.app); Phase 2: scene schema (Zod), pure scene operations with Vitest tests, Zustand store, click-to-select with outline, multi-select (Shift + click, Ctrl/Cmd + drag box), transform gizmo for one object or a group (move/rotate/scale, optional snapping, smooth by default), camera controls (left pans, right rotates, Shift swaps), add / numbered duplicate / delete / rename. A git pre-push hook runs type-check, lint, test and build before every push. `main` has everything up to the gizmo; the object actions and multi-select are on `feature/object-actions`, waiting for a pull request.
- **CI:** last seen green on `b33fe6b`; not yet checked on newer commits (CI runs on pushes to `main` and on pull requests only).
- **Next action:** open a pull request `feature/object-actions` into `main` (starts CI, last seen green on `b33fe6b`) and merge it. Then Phase 3 on new branches: Hierarchy panel, Inspector (a multi-selection shows only a count), undo/redo. Still open: test `SETUP-SECOND-PC.md` on the second PC; try the pre-push hook from GitHub Desktop; optional `/code-review` of the Phase 0-1 diffs.

Update this block at the end of every sub-phase and commit it.

## Goal

A browser-based, real-time collaborative 3D scene editor ("Figma for 3D"). MVP is a scene/environment editor with
multiplayer. Mesh modeling and sculpting come later. Everything runs on free hosting.

## Stack

TypeScript, Next.js (React), Tailwind, Three.js with React Three Fiber, Zustand, Zod, Yjs with a Hocuspocus
WebSocket server (Node), PostgreSQL with Prisma, Docker, GitHub Actions, Vitest, Playwright, Cloudflare R2 (S3 API).
Monorepo: pnpm workspaces + Turborepo. See `WHAT-WE-USED.md` for installed versions and `DECISIONS.md` for reasons.

## Phases

### Phase 0: Foundation

- [x] Tools: Node 24 (fnm), pnpm via Corepack, git
- [x] GitHub repo, `.gitignore`, README
- [x] Monorepo with `apps/web` and `packages/shared`
- [x] `docs/WHAT-WE-USED.md`, `docs/DECISIONS.md`, `CLAUDE.md`
- [ ] `docs/SETUP-SECOND-PC.md` verified on the second PC, `.env.example`
- [x] Prettier, GitHub Actions workflow (format check + lint + type-check + build); green on GitHub
- [x] First Claude Code hook (Prettier after edits) written and pipe-tested; firing still to confirm after `/hooks` reload
- [x] Skill to update WHAT-WE-USED.md (`/update-what-we-used`); loading still to confirm after `/reload-skills`
- [x] First diagram (repo, CI and Claude Code setup): `docs/diagrams/dev-workflow.html`

### Phase 1: 3D viewport

- [x] Three.js + React Three Fiber + drei; canvas, grid, lights, cube, orbit controls, FPS overlay (confirmed in a browser; drag feel tuned)
- [x] `docs/TUNING.md`: settings the owner can adjust
- [x] Deploy the early version to Vercel: https://sceneroom.vercel.app (HTTP 200, served by Vercel)
- [x] Architecture diagram (built parts solid, planned parts dashed): `docs/diagrams/architecture.html`
- [ ] Optional: `/code-review` pass on the Phase 0-1 diffs

### Phase 2: Scene model and editing tools

- [x] Scene schema in `packages/shared` (types + Zod)
- [x] Pure scene operations (add, remove, duplicate, update, transform) with Vitest tests; Zustand store; render nodes from the store
- [x] Click to select (raycasting) with outline; multi-select (Shift + click, Ctrl/Cmd + drag box) with a group gizmo
- [x] Transform gizmo (move/rotate/scale) and snapping
- [x] Add (cube, sphere, cylinder, plane, cone), delete, duplicate, rename

### Phase 3: Editor panels and undo/redo

- [ ] Layout: toolbar, Hierarchy, Inspector, Viewport (shadcn/ui)
- [ ] Hierarchy tree with re-parenting and visibility; Inspector with transform, color, material values
- [ ] Undo/redo (command history) and keyboard shortcuts; Vitest tests for store and commands

### Phase 4: Lights, materials, environment

- [ ] Point/spot/directional lights; materials and textures; HDRI sky; shadows, fog; camera nodes

### Phase 5: Import/export and local save

- [ ] GLB/glTF import and export; scene JSON with schema version; autosave (IndexedDB); asset panel; validation

### Phase 6: Docker, database, project backend

- [ ] docker-compose with Postgres; Prisma schema (User, Project, ProjectMember, Asset); API routes with Zod; seed script

### Phase 7: Real-time collaboration

- [ ] Yjs document as the source of truth; `apps/collab-server` (Hocuspocus, Dockerfile); persistence to Postgres
- [ ] Presence (names, colors, live 3D cursors, selections); per-user undo/redo
- [ ] Token check on connect, read-only enforcement, message size limit; test two windows, two devices, offline and reconnect

### Phase 8: Accounts, sharing, uploads

- [ ] Login (OAuth) and route protection; dashboard; share links with roles; R2 uploads via presigned URLs

### Phase 9: Testing, CI/CD, deployment

- [ ] Playwright test with two browser contexts; more unit tests; CI builds Docker image
- [ ] Deploy web (Vercel), collab server, database (Neon), files (R2); performance and security pass; monitoring

### Phase 10: Polish and extras

- [ ] README with demo GIF and live link; docs completed; extras (comments, version history, mesh tools)

## Milestones

- **A** after Phase 3: polished single-user 3D editor, live since Phase 1.
- **B** after Phase 7: real-time multiplayer works.
- **C** after Phase 9: accounts, sharing, tests, CI/CD, stable deployment.
