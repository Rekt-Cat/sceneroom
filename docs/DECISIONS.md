# Decisions

Short records of choices and why. Newest at the bottom.

## 2026-11-11: Node 24 LTS, not Node 23

Node 23 is end-of-life (nodejs.org releases page). Node 24 and 26 are both LTS; 24 chosen for wider ecosystem testing.
Switching later is one `fnm` command plus editing `.node-version`.

## 2026-11-11: pnpm 12.18.0 pinned through Corepack

Pinned in the root `package.json` `packageManager` field so every machine uses the same version. Verified that Corepack honors it.

## 2026-11-11: TypeScript 5.9.3 (not 7.x)

`typescript-eslint` 8.72.2 declares support for `typescript >=4.8.4 <6.1.0`, so TypeScript 7.0.2 is outside its range.
Revisit when typescript-eslint supports 7.

## 2026-11-11: Monorepo layout: `apps/*` and `packages/*`

`apps/` holds things that run, `packages/` holds shared code. Turborepo docs use this convention.
Repo root is `MyProg/sceneroom` (not `MyProg`) so other projects stay out of this history.

## 2026-11-11: Next.js "Cache Components" off

`create-next-app --yes` enabled `cacheComponents` and `partialPrefetching`. Removed: extra caching rules not needed for a client-heavy 3D editor.

## 2026-11-11: Workspace packages need no `transpilePackages`

Bundled Next.js docs say Turbopack transpiles monorepo workspace packages automatically.

## 2026-11-11: Prisma 7.x planned (Phase 6)

npm's `latest` tag for Prisma is a release candidate (8.0.0-rc.x). Use the stable 7.x line until 8 is stable.

## 2026-11-11: CI uses `corepack enable`, not `pnpm/action-setup`

Same mechanism as local setup, one less third-party action. Not verified whether `pnpm/action-setup` v6 reads the `packageManager` field.
Actions use major-version tags (`@v7`); pinning to commit SHAs is a possible later hardening step.

## 2026-11-11: Prettier with default settings

Empty `.prettierrc.json`, so formatting follows Prettier defaults and matches what `create-next-app` generated.

## 2026-11-11: `check-types` runs `next typegen` first

First CI run failed at `check-types` with `Cannot find name 'LayoutProps'`. Next.js generates that type (and `next-env.d.ts`),
and both are git-ignored, so a fresh checkout does not have them. It passed locally only because earlier builds had created them.
Fix: `"check-types": "next typegen && tsc --noEmit"` in `apps/web`. Lesson: reproduce CI problems from a clean state
(delete generated files, and use `turbo run ... --force` to bypass the cache).

## 2026-11-11: Public GitHub repo under a personal account

GitHub CLI was installed then removed: its login requests broad permissions (including organisation access). Git + GitHub Desktop is used instead.

## 2026-11-13: 3D viewport is a client-only component

WebGL needs the browser, so `Viewport.tsx` is a Client Component (`"use client"`) loaded through `ViewportLoader.tsx` with
`next/dynamic` and `ssr: false`. The bundled Next.js docs say `ssr: false` is not allowed in a Server Component, which is why a
separate client wrapper exists and `page.tsx` stays a Server Component.

## 2026-11-13: Three.js stack versions

`three` 0.187.0, `@react-three/fiber` 9.8.2 (peer range `react >=19 <19.4`, we have 19.3.0) and `@react-three/drei` 10.7.9
(needs React 19, three >=0.159, fiber 9). `@types/three` matches `three`. drei pulls in 54 packages including large ones
(`hls.js`, `@mediapipe/tasks-vision`); only imported parts are bundled, but check bundle size in Phase 9.

## 2026-11-13: Hosting the web app on Vercel (Hobby plan)

Deployed to https://sceneroom.vercel.app from the GitHub repo. Vercel's docs (updated 2026-09-14) list Hobby as free with a monthly
usage allowance and no billing cycle; going over a limit means waiting 30 days for that feature, not a charge. Not verified: the
"personal, non-commercial use" wording (Vercel's fair-use page loaded without its examples) and whether signup asks for a card.
Re-read the Terms of Service before any commercial use.

Setup: import the repo, **Root Directory = `apps/web`**, framework Next.js, other settings default, no environment variables yet.
Vercel's GitHub app is limited to this one repository. These settings live in the Vercel dashboard, not in the repo, so a new Vercel
project would need them entered again. The collab server (Phase 7) and database will not run on Vercel.

## 2026-11-13: Scene data shape (Phase 2)

Schema in `packages/shared/src/scene.ts` (Zod 4.6.7; types are inferred from the schema, so there is one source of truth).

- **Flat map of nodes by id, with `parentId`**, not a nested tree. Updating one node is a simple key write, and a flat map
  maps cleanly onto a Yjs map in Phase 7. The tree for the Hierarchy panel is rebuilt from `parentId`.
- **Rotation in radians** (Euler x, y, z), matching Three.js, so no conversion in the viewport. The Inspector will show degrees.
- **`version` field** (`SCENE_SCHEMA_VERSION`) on every scene, so saved files can be migrated when the shape changes.

## 2026-11-13: Scene logic as pure functions, store as a thin wrapper

`sceneOps.ts` (add, remove with descendants, duplicate subtree, update, set transform) returns new scenes and takes ids as arguments,
so it is easy to unit-test (Vitest 5.1.0) and can later be reused by the collab server and undo/redo. The Zustand 5.1.0 store in
`apps/web` holds the scene and calls these functions. `pnpm test` is a Turborepo task and a CI step.

## 2026-11-13: Pre-push hook runs the four checks (Husky 9.1.7)

Before this, type-check, lint, test and build ran only when someone remembered to; CI (push to `main`, pull requests) and Vercel
ran after the code was already pushed, and a Vercel deploy is not blocked by CI. A git `pre-push` hook now runs
`pnpm check-types && pnpm lint && pnpm test && pnpm build` and blocks the push on failure.

- **Pre-push, not pre-commit:** the build takes seconds to tens of seconds; running it on every small commit would be slow.
- **Husky** keeps the hook in the repo (`.husky/pre-push`), so a fresh clone gets it from `pnpm install` (the `prepare` script sets `core.hooksPath`).
- **PATH handling:** GitHub Desktop does not load `~/.zshrc`, so the hook adds `/opt/homebrew/bin` and runs `fnm env` itself. Tested with a stripped environment (`env -i`): a deliberate type error exits 2, clean code exits 0. Not yet tested from GitHub Desktop itself.
- `pnpm format:check` is not in the hook (the Prettier edit hook already formats); CI still runs it.
- Escape hatch: `git push --no-verify` from a terminal.

## 2026-11-13: Gizmo writes to the store on mouse up, not every frame

drei `TransformControls` changes the three.js object directly during a drag. We read its position, rotation and scale once on `mouseUp`
and call `setTransform`, so one drag is one store change (one undo step in Phase 3) and React does no work per frame. A click on a
handle without moving looks like a click on empty space to R3F (`onPointerMissed` fires when the pointer moved 2 pixels or less, read in
the R3F 9.8.2 source), so `gizmoGuard.ts` ignores "empty click" for 300 ms after the gizmo is used. Snap steps and shortcuts are in `TUNING.md`.
Found by a test: a plain-object lookup for shortcut keys also answered to `"constructor"`, so `modeForKey` uses a `Map`.

## 2026-11-13: Snapping off by default, Shift flips it

The first gizmo version had snapping on, so every drag jumped in fixed steps (0.5 / 15° / 0.1) and fine placement was impossible.
Now the gizmo is smooth by default. `snapEnabled` (toolbar button or X) is the standing choice, and holding Shift inverts it while held
(`snapKeyHeld`), so you can snap briefly while smooth, or place something precisely while snap is on. The blur event clears Shift so it cannot stick.

## 2026-11-13: Camera mouse mapping: left pans, Shift + left rotates

Requested: only the left button moves the camera. `mouseButtons={{ LEFT: MOUSE.PAN }}` on `OrbitControls`. Read in three-stdlib 2.36.1:
with LEFT mapped to PAN, holding Shift, Ctrl or Cmd turns the drag into a rotate, so no custom code is needed. MIDDLE and RIGHT are
left undefined, which the library treats as "no action". Scroll still zooms. Shift is also the temporary-snap key for the gizmo; the
two do not clash because the gizmo pauses orbit controls while its handle is dragged (drei `dragging-changed`), but this needs a browser check.

## 2026-11-13: Shift pressed mid-drag now switches pan/rotate (CameraModifierSwitch)

three-stdlib 2.36.1 `OrbitControls` reads Shift/Ctrl/Cmd only inside `onMouseDown` and keeps that mode until the button is released, and
its state is private. `CameraModifierSwitch.tsx` listens for modifier keys during a camera drag (using the controls' `start` and `end`
events) and sends a synthetic `pointerup` (to the document) plus `pointerdown` (to `controls.domElement`) at the last pointer position
with the new modifier state, so the mode changes without a jump.

- **First attempt failed:** the `pointerdown` was sent to the canvas, but drei's `OrbitControls` listens on `events.connected`, R3F's root
  element (read in drei `OrbitControls.js`: `domElement || events.connected || gl.domElement`). The drag ended and never restarted.
  It now targets `controls.domElement`.
- **Side effect:** R3F listens on that same element, so it also sees the synthetic `pointerdown` and restarts its own "how far did the
  mouse move" measure. The click that ends the drag could then look like a plain click and select or deselect something. `gizmoGuard.ts`
  (`markCameraDragRestarted`, cleared on the next real press by checking `event.isTrusted`) makes `shouldIgnoreClick()` true for that click.
- **Known edge case:** if the cursor is over a gizmo handle when Shift is pressed, the gizmo's own pointerdown listener (same element) may
  start a handle drag. Needs a browser check.

## 2026-11-13: Right-drag rotates the camera

Mapping is now `{ LEFT: MOUSE.PAN, RIGHT: MOUSE.ROTATE }`; the middle button stays unmapped. Shift/Ctrl/Cmd swaps pan and rotate on
either button (three-stdlib 2.36.1 `onMouseDown`). `CameraModifierSwitch` now remembers which button started the drag (from the real
`pointerdown`) and uses it, with the matching `buttons` bit, when it restarts the drag; before, it always assumed the left button.

## 2026-11-13: Object actions (add, duplicate, delete, rename)

All four go through the store and the pure functions in `packages/shared`, so they can become undoable commands in Phase 3.
Adding or duplicating selects the new object; deleting clears the selection. Duplicate copies the whole subtree and offsets only the top
copy (`DUPLICATE_OFFSET`). Names are validated with the same Zod rule as the schema (`normalizeNodeName`: trimmed, 1 to 100 characters);
an invalid name in the text box is undone on blur. Found by reading my own diff: a 100-character name plus " copy" broke the limit, so the
copy's name is cut to the limit (test added). Ctrl/Cmd + D calls `preventDefault` (the browser would bookmark the page). Delete and
Backspace are ignored while typing in a text box. A temporary overlay panel holds rename/duplicate/delete until the Inspector (Phase 3).

## 2026-11-13: Planes are drawn on both sides

A three.js material draws only the front face by default (back-face culling), so a flat `planeGeometry` disappeared when viewed from behind.
Planes now use `DoubleSide`; closed shapes keep `FrontSide` (cheaper, and their inside is never seen). Not changed: a new plane stands upright
(three.js `PlaneGeometry` faces +z); lying it flat like a floor would be a rotation in `createNode`.

## 2026-11-13: Duplicates are numbered, not "copy"

`uniqueCopyName` in `sceneOps.ts`: "Cube" becomes "Cube (1)", then "Cube (2)". Duplicating "Cube (1)" strips the old number first, so you get
"Cube (2)" and not "Cube (1) (1)". It takes the lowest number no object uses yet (delete "Cube (1)" and the next copy reuses it). The base name is
shortened if needed so the result stays within 100 characters. Only the top copy is renamed; its descendants keep their names. This replaces the
" copy" suffix described in the object-actions entry above.

## 2026-11-13: Multi-select (Shift + click, Ctrl/Cmd + drag box, group gizmo)

You chose the Ctrl/Cmd + left-drag trigger because plain left-drag already pans the camera. The selection is a list (`selectedIds`) in the store.

- **Box select:** `BoxSelectController` listens in the capture phase on `window`, so it can turn `OrbitControls` off before the library sees the
  press (otherwise Ctrl/Cmd + left would rotate, which three-stdlib does for any modifier). It projects each object's 3D bounding box to the screen and
  selects those whose screen rectangle touches the box (`rectsOverlap`, tested). Shift at release adds to the selection. A drag under 4 px is a click.
  `CameraModifierSwitch` now only reacts to Shift, since Ctrl/Cmd no longer touches the camera.
- **Group gizmo:** `TransformControls` needs one object, so it is attached to an invisible pivot (a group at the average position). While dragging,
  `pivotNow x pivotAtStart^-1` is multiplied onto each object's starting matrix and decomposed back into position/rotation/scale. One store change on mouse up.
  Known limit: scaling a group of rotated objects can shear them, and rotating a group about its centre is fine but a "local space" mode is not offered.
  This assumes objects are drawn in world space; when the Hierarchy renders parenting (Phase 3) the matrices must be taken relative to the parent.
- **Delete / duplicate** work on all selected objects. `topLevelSelection` drops a selected child whose parent is also selected, so it is not copied twice.
- **No per-object details** for a multi-selection, as requested: the panel shows a count. The Inspector (Phase 3) should do the same.
- Found by lint: values from `useMemo` may not be mutated (React Compiler rule), so per-drag data lives in a `useRef`.
- Needs a browser check: the group gizmo, the box, and Ctrl+click on a Mac (Ctrl+click is a right-click there; Cmd is the intended key).

## 2026-11-13: Hierarchy panel first, re-parenting later; plain Tailwind instead of shadcn/ui for now

Phase 3 starts with the Hierarchy list (tree, select, Shift/Ctrl/Cmd + click to multi-select, Hide/Show). The panels are small, so they use plain Tailwind
like the rest of the overlays. shadcn/ui (the plan's choice) is deferred until a component really needs it (dialogs, colour picker for the Inspector);
its setup for Tailwind 4 would be checked in the docs first.

- **Why re-parenting is a separate step:** drawing children inside their parent changes the maths in `MultiSelectionGizmo` and the single gizmo
  (they assume world space), so it gets its own branch, with tests for cycle prevention and keeping the world position.
- **Tree logic is pure** (`buildSceneTree`, `flattenTree`); a node with a missing parent is shown at the top level so nothing disappears.
- **Bug found by reading the library code:** neither R3F nor the three.js raycaster skips `visible={false}` objects, so a hidden object would still
  catch clicks and block the ones behind it. Hidden meshes now use a "hit nothing" `raycast`. Box select already ignored hidden nodes.
- The Add buttons moved from their own bar into the Hierarchy panel. The left panel is 16rem wide and can overlap the centred mode toolbar on narrow windows.

## 2026-11-13: New editor look: docked panels, Add menu, tool dock

The first overlay UI looked rough, so the look was designed on a canvas first and then built. Changes: panels are docked beside the 3D view (nothing covers it);
one Add button opens a menu with a picture and a line per shape (keys 1 to 5 add a shape); the mode bar became a bottom-centre dock with icons and key hints;
a small card lists the mouse controls; the tree has shape icons, eye buttons and amber selection (the same amber as the outline in 3D); a search box filters by name
(`searchNodes`, tested; `/` focuses it); the right panel shows the name and actions for one object, a count and removable name chips for several, and a hint for none.

- **Colours as theme variables** (`--color-ed-*` in `globals.css`): one colour, one meaning (amber = selected, indigo = you can act, red/green/blue = axes).
- **Left out on purpose** (they would be fake today): undo/redo buttons, Share, collaborator avatars, project name editing, Perspective chip, Roughness/Metalness sliders.
  The top bar shows the logo and a plain "Untitled scene".
- **Fonts:** kept Geist (already loaded by Next.js, close to the design's Inter); no new font download. The body no longer forces Arial.
- **Not yet built from the design:** the Inspector's Transform and Colour fields, drag-to-re-parent. Those are the next steps.
- **Dev server note:** running `pnpm build` while `pnpm dev` is running shares the `.next` folder and left the dev server serving a stale stylesheet. Restart `pnpm dev` after a build if the page looks unstyled.

## 2026-11-13: Inspector fields

Position, Rotation and Scale fields plus colour, for one selected object (a multi-selection shows no fields, as requested).

- **Validation is pure and tested:** `parseNumberInput` accepts "1.5", "-2", ".5", "1,5" (comma) and a trailing degree sign, and rejects "1.5.2", "1e5", "abc" and anything beyond +/-100000.
  `editTransform` refuses a scale of 0 (it would flatten the object and break the gizmo) but allows a negative scale (mirroring). Hex colours go through `normalizeHexColor` (3 or 6 digits, with or without `#`).
- **Behaviour:** the box shows the scene's value until you type; Enter or clicking away saves, Escape cancels, text that is not a number turns the box red and is dropped. Up and Down arrows nudge; Shift is 10 times more.
  A scale of 0 is dropped silently on leaving the box (the live red state only checks "is it a number"); worth a visible message later.
- **Rotation** is stored in radians (matches three.js) and shown and typed in degrees.
- **Left out:** dragging the axis letter to scrub a value, the "keep proportions" link button, roughness and metalness (not in the scene data yet; Phase 4).
- **Dev server:** this time the dev server was stopped by name (`pkill -f next-server`) after `pnpm build`, not by port, because `lsof` also lists browser processes connected to the port.

## 2026-11-13: Undo / redo as snapshots with labels

History is two stacks of earlier states (`packages/shared/src/history.ts`, pure and tested). One step restores `{ scene, selectedIds }`.
Snapshots are cheap here: scenes are immutable and share every node that did not change, so 100 steps cost little memory.

- **Why snapshots, not command objects:** every change already goes through the store with a pure function, so the old scene IS the undo. Commands would need an inverse for each action (more code, more bugs).
  The cost: steps cannot be merged or replayed on another machine. Real-time collaboration (Phase 7) needs per-user undo on top of a shared Yjs document; this history will be replaced there, but its interface (labels, undo/redo, one step per user action) is what the UI uses.
- **One step per user action:** a gizmo drag is recorded once, on mouse up (group drags too). Each Inspector commit, Add, Delete, Duplicate, Rename, Hide/Show and colour change is one step.
- **Not undoable:** selection, gizmo mode, snapping, panel state (as in most editors). Undo restores the selection that existed before the change.
- **No empty steps:** a change that changes nothing (gizmo released without moving, same colour, same name) records nothing; checked with `transformsEqual` and plain comparisons, tested in the store.
- **Labels** ("Undo add cube") show in the button tooltip. Limit 100 steps.
- **Vitest added to `apps/web`** (5.1.0) so the store, which holds the history, has real tests (11).
- Known limit: pressing Undo while a gizmo drag is still in progress is not guarded; the drag's end would then record from the older state. Rare; revisit if it shows up.

## 2026-11-13: Resizable panels and dragging values (Unity-style)

- **Panel widths** are UI state in their own store (`layoutStore.ts`), not in the scene, so they are not part of undo and not shared with other people later. Limits and the "keep the 3D view at least 360px" rule are pure functions in `packages/shared` (tested).
  Widths are remembered in `localStorage` under `sceneroom.layout.v1`; what is read back is validated with Zod and clamped (the window may be smaller than last time). The saved values are read after the first render (an effect), not during it,
  so the server render and the first browser render match; the cost is a possible one-frame jump from the default width to the saved one. Storage errors are logged, not hidden.
- **The FPS counter** is placed by the page, outside the panels, so `EditorShell` publishes the left panel width as a CSS variable (`--left-panel-width`) and the counter's class uses `calc(var(...) + 12px)`.
- **Dragging an axis letter** changes the value live. Many small changes would flood the undo history, so the store has `beginEdit` / `previewNodeTransform` / `endEdit`: previews change the scene without recording, and `endEdit(true)` records ONE step
  from the state at `beginEdit` (`endEdit(false)` restores it). Undo and redo are ignored while an edit is in progress, which also closes the gap noted for gizmo drags... for the Inspector only (a gizmo drag is still not guarded).
- Value changes are accumulated per mouse movement, so pressing Shift or Alt in the middle of a drag changes the speed from then on without making the value jump. The result is rounded to the field's decimals. Scale never passes through 0 (the preview is skipped).
- The cursor over an axis letter is the standard left-right resize cursor (`ew-resize`), kept during the drag by setting it on the page body.

## 2026-11-13: Re-parenting (drag in the scene list, Parent list in the Inspector)

- **Rendering nested.** Each object is drawn as a three.js mesh INSIDE its parent's mesh, so transforms combine by themselves (a parent's scale also scales its children, as in Unity). The scene data stays a flat map with `parentId`; the tree is rebuilt for drawing.
  Moving under a new parent remounts the mesh in the React tree; refs and the mesh registry update on their own.
- **Keep the place in the 3D view.** `localTransformUnder` takes the object's world matrix, multiplies by the inverse of the new parent's world matrix and decomposes it (tested: the world position is the same before and after).
  Known limit: under a parent with uneven scale, an object turned at an angle cannot always be written as plain position / rotation / scale (it would need a shear); the nearest transform is stored.
  The maths uses the real three.js objects, so it is in the web app, not in `packages/shared`; the rules (can this move happen, loops, one undo step) are pure and tested in `shared` and in the store tests.
- **Rules.** `canReparent` refuses an object under itself or under anything inside it. Several selected objects move together, but only the top ones (children follow). If any one cannot go to the target, none move. Dropping on the same parent changes nothing and records nothing.
- **Dragging rows** uses pointer events (like the other drags), not the browser's built-in drag and drop, which does not work reliably on buttons in Firefox. A press that moves under 5px stays a click; Escape cancels; the click that follows a drag is ignored.
  There is no reordering of siblings: the order is the order they were created in (changing it would need an order field in the scene data).
- **The Parent list in the Inspector** is the keyboard and screen-reader way to do the same thing. Choices that would make a loop are greyed out.
- **Group gizmo with parents.** It moves only the top objects of the selection and works out each new local transform relative to that object's own parent; the pivot is placed from world positions after each change.
  Box select now measures only an object's own shape (not the objects inside it), and ignores objects hidden through a hidden parent (`isEffectivelyVisible`).
- **Hidden parents.** Hiding an object hides everything inside it; hidden objects, and those inside them, no longer catch clicks.
- **Not done:** per-parent "folded" memory survives undo only as UI state (it is not part of the scene); dropping onto a collapsed parent unfolds it.
