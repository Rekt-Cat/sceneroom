# Plan

## Current status

- **Phase:** 4 (lights, materials, environment) is done and merged (pull requests up to #11). **Order change (2026-11-14):** the owner chose to build the 3D editing tools (Phases 11 to 15, plus what they need from Phase 5) BEFORE the database and multiplayer (Phases 6 to 10). Now in progress: Phase 11, modifiers (`feature/modifiers`).
- **Done:** Phases 0 to 4, all on `main` and live at https://sceneroom.vercel.app: 3D viewport; scene model; selection, multi-select, gizmo, camera controls; add / duplicate / delete / rename; scene list with search and drag-to-re-parent; Inspector (position, rotation, scale, colour, parent); undo/redo; resizable panels and value dragging; lock. A git pre-push hook runs type-check, lint, test and build before every push. Since then: right-click menu and clipboard, list ordering, Assets tab (thumbnails, drag into the view), Surface and shading, lights, environment.
- **CI:** green on pull requests up to #11.
- **Next action:** `main` has everything up to the project home screen (many projects, cards with pictures, editor at `/p/[id]`), Thicken (Solidify), Bevel, edge extrude, the four-view peek, creases and Smooth. Still waiting for a browser check: the card pictures on the home screen and moving between projects without a reload. Next candidates: the small modelling tools (merge points, flip normals, fill a hole, dissolve, bridge), the rest of Phase 5b step 4 (units, default look for new scenes, scene thumbnails, search), then the backend (Phases 6 to 8) for invite links. Boolean is skipped for now. Still open: test `SETUP-SECOND-PC.md` on the second PC.

Update this block at the end of every sub-phase and commit it.

## Goal

A browser-based, real-time collaborative 3D scene editor ("Figma for 3D"). MVP is a scene/environment editor with
multiplayer. Mesh modeling and sculpting come later (see `ADVANCED-EDITING.md`). Everything runs on free hosting.

## Product principles: easy by default, deep on demand

SceneRoom is for beginners AND professionals. Tools like Maya and Blender have the depth but are hard to learn; the aim here is the same depth (over time) with a friendly surface. The rules every new tool follows (details and the checklist in `DECISIONS.md`, "Product direction"):

- **Easy first:** plain words, sensible defaults, a visible button with a tooltip, a hint bar while in a mode, undo for everything, a reset button on every value, and no way to lose work silently.
- **Deep when asked:** advanced options folded away until needed; precise numbers, snapping and pivots; keyboard shortcuts for everything (with Blender-like and Maya-like presets later); a command palette to find any action by name; standard file formats (glTF, FBX, OBJ, USD) so professionals can round-trip with their other tools.
- **Non-destructive and collaborative** (our advantage): modifier stacks, plant and character generators, a mesh that is never overwritten, and real-time multiplayer. Professionals value all three and the old tools are weak at them.
- **Do the 20% of features that give 80% of the value, and do them well.** Maya and Blender are decades of work; we win on clarity, speed to a first result and the browser (nothing to install, share with a link).

## Product structure: projects, scenes and components

How work is organised (decided 2026-11-16; reasons and details in `DECISIONS.md`, "Project structure"):

- **A project** is the unit people work on together. It has a name, **members with roles** (owner, editor, commenter, viewer), a list of **scenes**, and a **shared library**: the models, meshes and textures (stored once, however many scenes use them), plus reusable things like saved plants and characters, materials and components.
- **A project holds many scenes**, each for one job. For example: one scene to design NPCs, one for buildings, one for the environment, and one **assembly scene** that puts everything together. Scenes open as tabs next to each other; new scenes can start from a template (Characters, Buildings, Environment, Assembly, Blank).
- **Components link the scenes.** Any object or group of objects in a scene can be **published as a component** (a named item in the project library). Other scenes **place instances** of it. An instance stays **linked**: when the NPC is improved in the NPC scene, every instance in the assembly scene updates. An instance can be moved, turned and scaled on its own, and later have overrides (colour, pose); "Open source" jumps to the scene it came from, and "Unlink" turns an instance into an ordinary copy. A scene can never contain itself, directly or through other scenes (checked).
- **Many people, one project:** everyone with access works at the same time; each scene is its own shared document, so two people can build different scenes without ever clashing, and see who is in which scene. History, comments and permissions belong to the project.
- **Local first:** all of this works with no server (a project saved in the browser and as a file), and the same project model is what the database and multiplayer (Phases 6 to 8) will store and share.

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
- [x] The editable-mesh foundation (`feature/editable-mesh`, waiting for a browser check): the "mesh" object kind, its stored format, Apply modifiers and Convert to mesh, saved in the scene file and exported to GLB. Still to do for it: clean-up of old mesh versions in browser storage; undo by difference (with sculpting)

### Phase 5b: Projects and scenes (local first; next, before the edit tools continue)

The structure above, built without a server. Done first because it decides how saving, undo, assets and (later) multiplayer are organised, and it is much cheaper to do now than after more features depend on one-scene storage.

- [x] **Step 1: a project with several scenes** (`feature/projects-scenes`, waiting for a browser check). A project object that holds the scenes and the shared asset pool; scene tabs in the top bar (new, rename, duplicate, delete with confirmation, reorder); each scene has its own undo history and selection; switching scenes keeps everything; scene templates (Blank, Characters, Buildings, Environment, Assembly); the project and its scenes autosaved in the browser
- [x] **Step 2: project files** (`feature/projects-scenes`, waiting for a browser check). The `.sceneroom` file becomes a project file (all scenes plus the shared files, deduplicated; format version 2); old single-scene files open as a project with one scene; "Export this scene" still writes a single-scene file; GLB export works per scene (and for the whole project as separate files)
- [x] **Step 3 (first version, `feature/projects-scenes`, waiting for a browser check): prefabs and project-wide assets.** Models you import belong to the whole project (the Assets tab lists them in every scene). **Make prefab** (Inspector or right-click) keeps an object in the Assets tab, and the object becomes a linked copy. Drag a prefab into any scene for another copy. **Double-click the prefab (or Edit prefab)** opens it as a scene of its own; change it like any scene and every copy follows. Unlink and delete. Still to do:
- [ ] **Step 3, the rest:** prefabs inside prefabs (with a cycle check); overrides beyond the transform (colour, pose); thumbnails, search and tags in the Assets tab; a see-through preview while dragging a prefab; moving saved plants and characters ("my plants") into the library so they travel with the project
- [ ] **Step 4: project-level tools (first part built on `feature/solidify`, waits for a browser check: click the project name in the top bar for the overview: rename the project, each scene's objects, lights, prefab copies and triangles with an Open button, and removal of imported models nothing uses). Still to do: units, default environment and lighting for new scenes, scene thumbnails and last edit, cross-scene search.** A project overview (scene list with thumbnails and last edit), project settings (units, default environment and lighting for new scenes), cross-scene search, "where is this used?" for components, models and meshes, and clean-up of files no scene uses any more

### Phase 5c: Project home (the screen before a project opens)

Today the app opens straight into one project. A home screen comes first: it lists your projects with pictures, and the editor opens from it. Planned on 2026-11-17 (owner's request). Split in two: the **local part** needs no server and can be built now; the **online part** (invites, members) needs the backend of Phases 6 and 8, and is designed here so the local part does not have to be redone.

**What the owner sees** (beginner-first: one obvious button, nothing else until needed)

- A grid of **project cards**: a thumbnail of the scene, the name, "edited 2 hours ago", number of scenes, and (online part) the people on it. The newest-edited project comes first.
- One big **New project** card (starts from a template: Blank, or the scene templates that already exist), then **Open file** (a `.sceneroom` file) beside it.
- A card's **⋯ menu**: Open, Rename, Duplicate, Export file, Delete (asks first). Search box and sort (last edited, name) appear once there are more than a few projects.
- An empty first visit shows a single "Make your first project" card, nothing else.
- Opening a card goes to the editor; a **Projects** button (the logo in the top bar) comes back, after the project is saved.

**Local part (built on `feature/project-home`, waits for a browser check: home screen at `/`, editor at `/p/[projectId]`, many projects in the browser, thumbnails, rename / duplicate / export / delete, open a file as a new project; the Share item is shown disabled)**

1. **Storage for many projects.** Today one project is one record in the browser (IndexedDB, autosaved). It becomes an index (id, name, thumbnail, created, last edited, scene count) plus one record per project, with the model files shared by fingerprint across projects (a model used in two projects is stored once). A migration turns the one existing project into the first card; the old record is kept as a backup until the owner has opened the new version once. This is the riskiest step, so it comes with tests for migration, for losing nothing when a save is interrupted, and for the "storage not allowed" case.
2. **Routes.** `/` is the home screen; `/p/[projectId]` is the editor. The URL says which project is open (it can be bookmarked, and online it becomes the share link target). An unknown id shows a plain "This project was not found" page with a way back.
3. **Thumbnails.** The 3D view is drawn once to a small picture (about 480 x 270, JPEG) when the project is saved after a change and when leaving the editor, and kept in the index. A project with no picture yet shows a plain tile with the first letters of its name. Cost is small; no library needed (the canvas can make the picture).
4. **Home screen UI** as above, with keyboard use and a screen-reader label per card; the actions are plain functions, the React part only shows them.
5. **Project overview dialog** (already built) stays inside the editor for scene-level detail; it moves behind the project name as before.

**Online part (after Phases 6 and 8; designed now)**

- **Who can do what:** roles Owner, Editor, Commenter, Viewer (as in Phase 8). The server decides everything; the browser only shows what it is told.
- **Invite links:** the owner presses Share on a card (or in the editor) and chooses a role and, optionally, an expiry; the server makes a long random token, stores only its hash, and shows the link once. Opening the link asks the person to sign in, then adds them to the project with that role. Links can be revoked at any time, and each use is listed (who, when). Invites by email address are a later addition.
- **The home screen then has two groups:** "Your projects" and "Shared with you", with the people on each card (small avatars), and who is online in it now (from the presence of Phase 7).
- **Limits and safety:** the number of links and members per project, a rate limit on the link endpoint, tokens that expire, no guessable ids, a project's files only handed out to members.
- **Local projects can be moved online** with an "Upload to my account" action (with a size check and a clear progress and failure message).

**Decisions (settled by the owner, 2026-11-17)**

1. `/` is the home screen for everyone (no landing page for now).
2. Online, thumbnails live in object storage (R2) next to the project, with the small local copy as a cache.
3. A project is private by default; sharing is only ever an explicit action.
4. The editor keeps autosaving per project in the browser even when online (the offline fallback); the server copy is the source of truth when online.

**Order:** local steps 1 to 4 (about the size of Phase 5b), then Phases 6 to 8 bring the online part. Until the backend exists the Share button is shown disabled with a one-line explanation ("Sharing comes with accounts"), and "Export file" is the way to send a project.

### Phase 6: Docker, database, project backend

- [ ] docker-compose with Postgres; Prisma schema (User, Project, ProjectMember with a role, **Scene**, Asset, **Component**, Version); API routes with Zod; seed script. The data model is the Phase 5b project model, stored on a server

### Phase 7: Real-time collaboration

- [ ] Yjs document as the source of truth, **one document per scene plus one for the project** (members, scene list, library); `apps/collab-server` (Hocuspocus, Dockerfile); persistence to Postgres
- [ ] Presence (names, colors, live 3D cursors, selections) **and who is in which scene**; per-user undo/redo
- [ ] Token check on connect, read-only enforcement, message size limit; test two windows, two devices, offline and reconnect

### Phase 8: Accounts, sharing, uploads

- [ ] Login (OAuth) and route protection; **a project dashboard** (your projects, their scenes, recent activity); invitations and share links with roles (owner, editor, commenter, viewer); R2 uploads via presigned URLs; version history of a project and of each scene

### Phase 9: Testing, CI/CD, deployment

- [ ] Playwright test with two browser contexts; more unit tests; CI builds Docker image
- [ ] Deploy web (Vercel), collab server, database (Neon), files (R2); performance and security pass; monitoring

### Phase 10: Polish and extras

- [ ] README with demo GIF and live link; docs completed; extras (comments, version history)

### Phase 11: Deformers (can move earlier, right after Phase 5)

- [x] Step 1 (`feature/modifiers`, waiting for a browser check): segment counts on primitives; modifier stack in the Inspector with Bend, Twist, Taper
- [x] Step 2 (`feature/modifiers-2`, waiting for a browser check): Stretch, Noise, Mirror, Array. Left for the editable-mesh step: Subdivide
- [x] Step 3: Apply (bake the modifiers into an editable mesh), done with the editable-mesh foundation
- [x] **Edge creases** (`feature/edge-loops`, waiting for a browser check): select edges (click, Alt-click a loop, or a face) and press Sharp (Shift + C), Soft or Clear; creased edges are drawn pink and the Smooth modifier keeps them crisp (a sharp crease for every level, a soft one for part of them). Stored with the mesh (mesh format version 2), kept through moving, extruding, deleting and loop cuts, and copied by Mirror and Array. Not done: a crease slider, creases on the plain shapes before Make mesh
- [x] **Step 4a (`feature/edge-loops`, waiting for a browser check): Smooth (subdivision) modifier.** One slider, Smoothness 1 to 3 (Catmull-Clark: every face is cut up and rounded; a box becomes a rounded blob, a few-sided pipe a round pipe); extra loops from Loop cut keep an edge tight; Make mesh bakes it in. **Still to do: Solidify.** The original plan: _Subdivision surface smoothing_: a rough low-poly shape is smoothed into a curved one (Catmull-Clark), with a single "Smoothness" slider (0 to 3) and a "keep sharp" option for marked edges. Beginner view: one slider and a before/after toggle; no cage or crease jargon unless opened under "Advanced". Needs the topology layer (Phase 13, step 3). _Solidify_ gives a flat surface thickness. Both stay non-destructive until Apply

### Phase 12: Environment-building tools

- [ ] Boolean (union / subtract / intersect); scatter / instancing; terrain (heightmap); splines / tubes; align, distribute, snapping; groups and prefabs
- [x] **Plant generator**, step 1 (`feature/plants`, waiting for a browser check): trees, pines and bushes from settings and a seed, scatter copies as a forest, Make mesh, GLB export. Also done (`feature/my-plants`): Save as my plant (a list in the browser, in the Add menu) and Randomise. Not done: leaves facing along branches, seasons or wind, other kinds (palm, cactus), level of detail for big forests, growing along a drawn curve, prefabs that travel with a scene
- [ ] **Boolean cleanup** (after Boolean): after a union / subtract, offer one button, "Tidy up", that merges nearly-equal points, removes tiny faces and fills holes, and report what it did in plain words. Pairs with the open-edge warning already shown on export
- [ ] **Recipes (a simple node system for generators).** The plant and character generators are fixed programs; a recipe lets a user combine small steps (make shape, repeat, scatter, vary, bend) into their own generator and save it in the project library. Beginner view: a short list of steps you add and reorder, each with plain-word settings and a preview (like the modifier stack). Advanced view: the same steps drawn as connected boxes for people who want branching. Built on the modifier and scatter code, so no new engine; a recipe is saved as data, validated with Zod
- [ ] **Prefabs** are the **components** of Phase 5b (linked instances shared between scenes); this item only adds the extras: variants of a component, nested components, and overrides beyond the transform

### Phase 13: Edit mode (modelling)

- [x] Step 1 (`feature/edit-mode`, waiting for a browser check): enter edit mode (Tab), see points and edges, select points (click, Shift, box, A), move them with the handle, one undo step per drag
- [x] Step 2 (`feature/edit-operations`, waiting for a browser check): same-spot points move together (fixes tearing), turn and scale selected points, delete, extrude, Alt + click to select a face
- [x] **Step 3 (`feature/edge-loops`, waiting for a browser check): topology layer (the foundation for everything below).** A derived structure over the mesh (it stays a plain list of points and triangles): points on the same spot welded, edges with the triangles on each side, and QUADS found by pairing coplanar triangles that share a diagonal (cubes, cylinders, planes and extrusions are all made of them). Pure, tested, rebuilt after each edit. Edge loops need quads, and bevel, inset, bridge, mirror editing and subdivision all need adjacency, so this comes first
- [x] **Step 4 (`feature/edge-loops`, waiting for a browser check): edge selection and edge loops.** Edit mode has Points / Edges / Faces (keys 1, 2, 3, and buttons in the bar). Edge mode: click an edge, **Alt + click selects its whole loop**, Shift adds; the bar has **Loop** and **Ring** buttons that select the loop or ring of the edge you clicked. Face mode: click a face (a square made of two triangles is one face). Selected edges are drawn in the selection colour. Move, turn, scale and delete work on whatever is selected. Not done: Ctrl + Alt + click for a ring (the Ring button does it), a hover highlight, the stopping place being shown
- [x] **X-ray in edit mode** (`feature/edge-loops`, waiting for a browser check): an X-ray button and Alt + Z toggle seeing through the solid; off (the start), lines and points on faces the camera cannot see are hidden and cannot be picked
- [x] **Extrude settings** (`feature/edge-loops`, waiting for a browser check): after Extrude a panel changes Distance, Divisions, Scale and Twist in place (one undo step; a slider only previews until it is let go). Not done: extruding edges and points, extruding faces individually
- [x] **Step 5 (`feature/edge-loops`, waiting for a browser check): loop cut.** The Loop cut button (or key C) turns the tool on: moving over an edge shows a green line where the new ring would go across the whole strip of squares; a click cuts. A panel then sets the number of cuts (1 to 10) and a slide, live and in place (one undo step); the new points are selected, ready to scale or move. Works on a plain cube (no Segments needed). Refused with a reason where the strip ends at a triangle. Not done: dragging in the view to slide, scrolling to change the number of cuts (the panel does both), cuts that go through triangles, edge-ring preview across several selected edges
- [x] **Inset and pushing in** (`feature/edge-loops`, waiting for a browser check): the Inset button (key I) makes a smaller copy of the selected faces inside them, with a flat border; a Depth setting pushes it out or in; Extrude's Distance can also go negative (a recess)
- [ ] **Step 6: more modelling tools (built on `feature/modelling-tools`, waits for a browser check: Bevel, edge extrude, Merge, Weld, Flip, Fill hole and Bridge; the "Fix up" row in the edit panel).** Still to do: Bevel (edges and points, with segments and width), bridge two loops, merge points (at centre, at last, by distance), fill a hole, flip normals, knife, dissolve edges and points, grid / bridge fill, mirror editing (one half edited, the other follows), soft selection (proportional editing)
- [ ] **Step 7: selection power tools (first part built on `feature/selection-tools`, waits for a browser check: the "Adjust" row: More ( ] ), Less ( [ ), Invert, Similar; and Divide in the Change row).** "Select visible only" is the X-ray toggle (off picks only what the camera sees). Still to do: Select visible points only (not through the mesh), select more / less, select similar, invert, hide and show points, select by loop / ring / boundary, selection sets
- [ ] **Step 8: UVs and seams** (basic unwrap, seam marking, a checker view) and **difference-based undo** for big meshes (shared with sculpting). **Planned in detail in `docs/UVS-AND-SEAMS.md`; sub-steps 1 to 4 (UV checker and data, seams, one-button Unwrap with packing and the UV window, Unwrap along seams with stretch colours) are built on `feature/uvs`; 4 waits for a browser check** (what the owner sees, storage, algorithms, how every tool treats UVs, order of seven sub-steps, risks, five decisions to settle)

- [ ] **Step 9: retopology helpers.** Draw a clean new mesh over a dense one (a sculpt or a scan): a "Retopo" mode where points and quads snap to the surface of the high-poly object (shown see-through), click to place points, a strip tool that lays quad rows along a drag, and a Shrinkwrap modifier that pulls a rough mesh onto a target. Also an automatic "Simplify to N faces" (quick, for non-animated objects). Beginner view: pick the dense object, press Retopo, click points, a live face count; the snapping and the see-through target are set up for them
- [ ] **Step 10: texture baking and painting.** Needs UVs (step 8). _Painting_: brush colours straight onto the surface (colour, roughness, metalness) with a layer list, undo per stroke; saved as ordinary texture images in the asset pool. _Baking_: copy the detail of a dense object onto a low-poly one as a normal map, plus ambient occlusion and colour maps, in a background worker with a progress bar. Beginner view: one "Bake detail" button with sensible defaults (size 1024, low to high object chosen from a list); options such as ray distance and cage hidden under "Advanced"

### Phase 14: Sculpting

- [ ] Brushes (draw, smooth, grab, inflate, pinch, flatten, crease, mask); symmetry; remesh or dynamic topology; vertex-colour painting; BVH picking and Web Workers; per-stroke undo

### Phase 15: Characters and creatures

- [x] Step 1 (`feature/characters`, waiting for a browser check): a posable humanoid skeleton with a low-poly body, four kinds and six poses, randomise look, crowds, skeleton view, Make mesh, GLB export with a bone hierarchy
- [ ] Next: skinned meshes and weights (smooth bending); animation (timeline, walk cycles); inverse kinematics; click a bone in the view; morph targets and faces; clothes; save my characters; a base mesh to sculpt from; reference images

### Phase 16: Usability and professional workflow (runs alongside every phase)

The track that makes SceneRoom both friendly and professional-grade. Not one block of work: each item is done when the part of the app it touches is ready, and every new tool must meet the checklist in `DECISIONS.md`.

**Rule for every tool in this plan (beginner first, no clutter):** a tool shows at most three controls at first (a main button, one or two sliders), uses plain words with the professional name in brackets ("Smooth (subdivide)"), puts the rest under an "Advanced" fold that remembers whether it was open, has a before/after preview or a live count where it helps, a reset button on every value, one short hint line, and appears only in the mode where it makes sense (no toolbar of 80 icons). Panels show only what the current selection can use. Checked on every tool with a quick test: can a new user get a good result without reading anything?

**Friendly (learn it in minutes)**

- [ ] **Command palette** (`Ctrl or Cmd + K`): type what you want ("extrude", "add tree", "export") and run it; every action in the app is listed with its shortcut. The single biggest help for finding things in a deep app
- [x] **Fly camera** (`feature/edge-loops`, waiting for a browser check): hold the right mouse button and press W A S D (Q down, E up, Ctrl or Cmd faster); dragging still turns the view
- [x] **Zoom to an object** (`feature/edge-loops`, waiting for a browser check): double-click a row in the scene list, or press F, and the 3D view glides to it
- [x] **Four-view peek (hold Space)** (`feature/four-view`, waiting for a browser check): with an object selected, hold Space for a moment to see Top, Front, Right and the normal 3D view at once (each tile has a drop-down in its top-left corner for Left, Back, Bottom or Perspective); let go over a tile to open it big. A pinned side view can zoom but not turn or pan; its drop-down (Perspective first) goes back. Not done: remembering each tile's choice per project, a see-through box for the selection in the flat views
- [ ] **Hint bar and tool help in every mode** (started for edit mode): what the keys do right now, in plain words; a "What can I do here?" button that shows the current tool's short guide with a small animation
- [ ] **First-run tour and starter scenes**: a 2-minute guided build (add a tree, pose a person, light the scene, export) and a gallery of example scenes to open and take apart
- [ ] **Plain-language errors and warnings** everywhere (partly done), with a "why" and a fix; a warning before a heavy action (a forest of 500 detailed trees)
- [ ] **Accessibility**: full keyboard use, readable contrast, scalable text, reduced motion; tested with a screen reader for the panels

**Professional (no ceiling)**

- [ ] **Keymap presets** (SceneRoom, Blender-like, Maya-like) and fully customisable shortcuts; **pie menus or a quick menu** on one key for mode switching
- [ ] **Precise input everywhere**: type numbers or simple expressions (`2*3.5`, `45deg`) in every field; units (metres, centimetres, feet); snapping to grid, points, edges, faces and other objects; custom pivots and orientations (world, local, normal, 3D cursor)
- [ ] **Scene organisation for big scenes**: collections / layers, search and filter in the outliner, isolate, hide and lock by group, selection sets, linked copies (instances), prefabs
- [ ] **Materials and textures**: PBR texture maps (base colour, normal, roughness, metalness, occlusion, emissive), tiling, a material library, shared materials, image import
- [ ] **Rigging and animation**: skinned meshes with weights (auto and painted), inverse kinematics, a timeline with keyframes, a graph editor, pose library, walk cycles, retargeting (the skeleton and poses of Phase 15 are the start)
- [ ] **Interchange**: glTF (done), then FBX, OBJ, USD and Alembic; import with options and a report of what was kept and dropped; round-trip tests with Blender and Unity
- [ ] **Scripting and plugins**: a documented API to automate and extend the editor (a safe, sandboxed scripting panel first), custom tools and generators like the plant generator
- [ ] **Performance for big scenes**: instancing, level of detail, frustum and occlusion culling, background workers for heavy operations (remesh, bake), progress bars, a performance panel
- [ ] **Safety and history**: version history with named versions and restore, crash recovery, autosave (done), per-user undo in multiplayer

## Milestones

_Order change (2026-11-14): the editing tools (Phases 11 to 15) come before Phases 6 to 10. Milestone B and C move later; a new milestone D ("a modelling tool") comes first._

- **A** after Phase 3: polished single-user 3D editor, live since Phase 1.
- **B** after Phase 7: real-time multiplayer works.
- **C** after Phase 9: accounts, sharing, tests, CI/CD, stable deployment.
- **D** a modelling tool people can pick up in minutes and professionals can rely on: the edit tools of Phase 13 (loops, loop cut, bevel, inset), characters and generators (Phases 12 and 15), and the friendly and professional track of Phase 16 (command palette, keymaps, precise input, interchange).
