# Plan

## Current status

- **Phase:** 4 (lights, materials, environment) is done and merged (pull requests up to #11). **Order change (2026-11-14):** the owner chose to build the 3D editing tools (Phases 11 to 15, plus what they need from Phase 5) BEFORE the database and multiplayer (Phases 6 to 10). Now in progress: Phase 11, modifiers (`feature/modifiers`).
- **Done:** Phases 0 to 4, all on `main` and live at https://sceneroom.vercel.app: 3D viewport; scene model; selection, multi-select, gizmo, camera controls; add / duplicate / delete / rename; scene list with search and drag-to-re-parent; Inspector (position, rotation, scale, colour, parent); undo/redo; resizable panels and value dragging; lock. A git pre-push hook runs type-check, lint, test and build before every push. Since then: right-click menu and clipboard, list ordering, Assets tab (thumbnails, drag into the view), Surface and shading, lights, environment.
- **CI:** green on pull requests up to #11.
- **Next action:** Phase 11 step 1: segments on primitives and a modifier stack with Bend, Twist and Taper (non-destructive, no new mesh storage). Then: Stretch, Noise, Mirror, Array, Subdivide; Apply (needs the editable-mesh format from Phase 5); then Phase 12 (scatter, splines, plant generator, prefabs). Saving a scene as a file and GLB export (Phase 5) come before Apply. Still open: test `SETUP-SECOND-PC.md` on the second PC; optional `/code-review`.

Update this block at the end of every sub-phase and commit it.

## Goal

A browser-based, real-time collaborative 3D scene editor ("Figma for 3D"). MVP is a scene/environment editor with
multiplayer. Mesh modeling and sculpting come later (see `ADVANCED-EDITING.md`). Everything runs on free hosting.

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
- [x] Hierarchy tree with visibility, search, Add menu, docked panels and tool dock (branch `feature/hierarchy`)
- [x] Inspector fields: position, rotation, scale, colour (branch `feature/inspector`); material values later
- [x] Copy, cut and paste (Ctrl/Cmd + C, X, V), a right-click menu on objects and rows, Shift-click range selection and Ctrl/Cmd-click toggling in the scene list (branch `feature/context-menu`, needs a browser check)
- [x] Lock objects: padlock in the scene list and Inspector, key `L`; a locked object cannot be edited (branch `feature/lock`, needs a browser check)
- [x] Re-parenting: drag rows in the scene list or use the Parent list in the Inspector; children are drawn inside their parents (branch `feature/reparenting`, needs a browser check)
- [x] Resizable side panels (drag the edge) and Unity-style dragging of X / Y / Z values (branch `feature/panels-scrub`)
- [x] Undo/redo (snapshot history, buttons and Ctrl/Cmd + Z) with Vitest tests for the store (branch `feature/undo-redo`)

### Phase 4: Lights, materials, environment

- [x] Materials: roughness and metalness per object, sliders in the Inspector (branch `feature/materials`, committed; waiting for the pull request)
- [x] **Surface and shading** (branch `feature/surface-shading`; done: `material` section, Emissive, Opacity, Double-sided, Flat shading, Cast / Receive shadow; waiting: Reflection strength (needs the environment), angle limit for smooth shading, cut-out opacity (needs textures)): move the material values into a `material` section of the scene data (so later shared materials and material slots fit); add Emissive (colour and strength), Opacity (solid / see-through / cut-out), Double-sided, Smooth or flat shading (with an angle limit), Cast and Receive shadow switches, Reflection strength. Each with its own reset button, a default in `TUNING.md` and tests
- [x] Point / spot / directional lights as objects (branch `feature/lights`, waiting for a browser check)
- [x] Environment: background (colour or sky), reflections (studio or sky), per-object Reflection strength, fog, base lighting settings (branch `feature/environment`, waiting for a browser check)
- [ ] Camera objects (view through a camera); angle limit for smooth shading; shadow area setting
- [ ] Later, once the asset system exists: texture maps (base colour, normal, roughness, metalness, occlusion, height, emissive) with tiling, material presets, shared materials. Advanced surfaces (clearcoat, transmission, sheen, subsurface, anisotropy, iridescence) and material slots: see `ADVANCED-EDITING.md`, section F

### Phase 5: Import/export and local save

- [x] **Import a GLB** (step 1): Import button and drag-and-drop, a "model" object, limits, clear errors (branch `feature/model-import`, needs a browser check)
- [ ] **Import models** (more): GLB first, drag-and-drop and an Import button; a "model" object kind that points to an asset id; size and triangle limits with clear error messages (see `ASSETS-AND-IMPORT.md`; steps 1 and 2 there can be built right after materials, before the rest of this phase)
- [ ] Assets panel: thumbnails, place copies, rename, delete, source and licence note
- [x] Autosave in the browser (IndexedDB): the scene and the imported files are saved after each change and restored on reload; unreadable data is backed up; a status in the top bar (branch `feature/autosave`, needs a browser check)
- [x] Saving the scene as a file and opening it (`.sceneroom`, branch `feature/scene-file`, waiting for a browser check); scene versions and migrations are covered by the Zod defaults and the file version number
- [x] GLB export (`feature/glb-export`, waiting for a browser check, then trying the file in Blender or Unity)
- [ ] glTF with separate files, compressed models, then OBJ
- [ ] Design the editable-mesh data format and where big meshes are stored (see `ADVANCED-EDITING.md`, "The foundation"), so custom meshes can be saved and exported

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

- [ ] README with demo GIF and live link; docs completed; extras (comments, version history)

### Phase 11: Deformers (can move earlier, right after Phase 5)

- [x] Step 1 (`feature/modifiers`, waiting for a browser check): segment counts on primitives; modifier stack in the Inspector with Bend, Twist, Taper
- [x] Step 2 (`feature/modifiers-2`, waiting for a browser check): Stretch, Noise, Mirror, Array. Left for the editable-mesh step: Subdivide
- [ ] Step 3: Apply (bake the modifiers into an editable mesh; needs the mesh format from Phase 5)

### Phase 12: Environment-building tools

- [ ] Boolean (union / subtract / intersect); scatter / instancing; terrain (heightmap); splines / tubes; align, distribute, snapping; groups and prefabs
- [ ] **Plant generator**: trees and bushes from settings (trunk height and bend, branch count and angle, leaf density, random seed), built from splines, scatter and modifiers; a forest from one tree
- [ ] **Prefabs**: save a group of objects as a reusable item in the Assets tab, place copies that stay linked to it

### Phase 13: Edit mode (modelling)

- [ ] Editable meshes; point / edge / face selection; extrude, inset, bevel, loop cut, knife, merge, bridge; soft selection; mirror editing; basic UVs; difference-based undo

### Phase 14: Sculpting

- [ ] Brushes (draw, smooth, grab, inflate, pinch, flatten, crease, mask); symmetry; remesh or dynamic topology; vertex-colour painting; BVH picking and Web Workers; per-stroke undo

### Phase 15: Characters and creatures

- [ ] Base meshes; skeleton and weights (auto-weights, painting); posing and IK; morph targets; reference images; character export (GLB with skeleton)

## Milestones

_Order change (2026-11-14): the editing tools (Phases 11 to 15) come before Phases 6 to 10. Milestone B and C move later; a new milestone D ("a modelling tool") comes first._

- **A** after Phase 3: polished single-user 3D editor, live since Phase 1.
- **B** after Phase 7: real-time multiplayer works.
- **C** after Phase 9: accounts, sharing, tests, CI/CD, stable deployment.
