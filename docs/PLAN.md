# Plan

## Current status

- **Phase:** 3 (editor panels and undo/redo): scene list, Inspector fields and undo/redo are built on open branches; re-parenting is left
- **Done:** Phase 0, Phase 1 (live at https://sceneroom.vercel.app) and Phase 2 (scene model, selection, multi-select, gizmo, camera controls, add / numbered duplicate / delete / rename), all on `main`. A git pre-push hook runs type-check, lint, test and build before every push.
- **CI:** green on the merge of pull request #2 (`0e5849e`).
- **Next action:** test panel resizing and value dragging in the browser, then merge `feature/hierarchy`, `feature/inspector`, `feature/undo-redo` and `feature/panels-scrub` in that order (each builds on the one before). Then re-parenting (drag in the scene list, draw children inside parents), which finishes Phase 3. Still open: test `SETUP-SECOND-PC.md` on the second PC; try the pre-push hook from GitHub Desktop; optional `/code-review` of the Phase 0-1 diffs.

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
- [x] Hierarchy tree with visibility, search, Add menu, docked panels and tool dock (branch `feature/hierarchy`, needs a browser check)
- [x] Inspector fields: position, rotation, scale, colour (branch `feature/inspector`, needs a browser check); material values later
- [ ] Re-parenting in the Hierarchy
- [x] Resizable side panels (drag the edge) and Unity-style dragging of X / Y / Z values (branch `feature/panels-scrub`, needs a browser check)
- [x] Undo/redo (snapshot history, buttons and Ctrl/Cmd + Z) with Vitest tests for the store (branch `feature/undo-redo`, needs a browser check)

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
