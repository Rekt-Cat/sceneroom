# Plan

## Current status
- **Phase:** 0 (foundation)
- **Done:** tools installed; GitHub repo; monorepo (pnpm + Turborepo); Next.js app in `apps/web`; `packages/shared`; `docs/WHAT-WE-USED.md`; `docs/DECISIONS.md`; `CLAUDE.md`
- **Next action:** Prettier + first GitHub Actions workflow (lint, type-check, build); first Claude Code hook; then Phase 1.

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
- [ ] Prettier, GitHub Actions workflow (lint + type-check + build)
- [ ] First Claude Code hook (format/lint after edits) and a skill to update WHAT-WE-USED.md
- [ ] First diagram (repo, CI and Claude Code setup)

### Phase 1: 3D viewport
- [ ] Three.js + React Three Fiber + drei; canvas, grid, lights, cube, orbit controls, FPS overlay
- [ ] Deploy the early version to Vercel (live link from now on)

### Phase 2: Scene model and editing tools
- [ ] Scene schema in `packages/shared` (types + Zod)
- [ ] Zustand store; render nodes from the store
- [ ] Click to select (raycasting) with outline; transform gizmo (move/rotate/scale) and snapping
- [ ] Add (cube, sphere, cylinder, plane, cone), delete, duplicate, rename

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
