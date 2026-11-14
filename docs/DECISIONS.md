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

## 2026-11-13: Add menu fits the panel width

Found from a screenshot: with the Scene panel dragged narrow, the 256px Add menu (aligned to the Add button) stuck out past the left edge of the screen and its text was cut off.
The menu is now placed against the whole Scene panel (`left-3 right-3`, at most 18rem wide) instead of against the button, so it fits any panel width; item hints are cut with an ellipsis. The small round "N" in the bottom-left corner of dev builds is Next.js's own dev indicator, not part of the app; it does not appear in the production site.

## 2026-11-13: Locking objects

A locked object cannot be edited. What "edited" means is decided in one place, the store, so no panel, shortcut or drag can get around it (the interface also greys things out, but that is only for the user).

- **Blocked:** move / rotate / scale (gizmo, group gizmo, Inspector fields, dragging a value), rename, recolour, delete, moving it under another object, and putting anything inside it.
- **Still allowed:** selecting it from the scene list (so it can be looked at and unlocked), hide / show (a display choice, not an edit), duplicate (the copy is a new object, and is locked too because it copies the flag), and lock / unlock itself.
- **Inherited:** like hiding, locking a parent locks everything inside it (`isEffectivelyLocked` walks up the parents). A child locked this way shows a padlock that cannot be clicked; unlock the parent.
- **In the 3D view:** locked objects get no gizmo and do not catch clicks or the selection box, so you cannot grab them by accident and can pick what is behind them. They can still be selected from the list.
- **Mixed selections:** delete and the group gizmo skip the locked objects and act on the rest; locked ones stay selected. With only locked objects selected the Delete button is off and no gizmo appears.
- **Data:** `locked: z.boolean().default(false)` on each node. The default means scenes without the flag load as unlocked, so the schema version stays 1 (nothing is saved to files yet).
- **Undo:** lock and unlock are undo steps ("Lock", "Unlock"); several objects at once is one step.
- **Not done:** a lock does not stop other people in Phase 7 (collaboration); there it should be enforced on the server too.

## 2026-11-13: Move-gizmo arrow direction fixed; Add menu sits under the Add button

- **Arrow pointing at the object.** drei's `TransformControls` (three-stdlib 2.36.1) flips an axis to face the camera. When the camera is on the far side of an axis, it hides the normal arrowhead ("fwd") and shows a second one ("bwd"),
  mirrored to the other side. That second arrowhead is built pointing toward the object, so after the mirror it sits on the outside and points back at the object (seen as the red X arrow; Y and Z have the same bug).
  Checked by building the real controls in a script: before the fix `bwd` is inward for X, Y and Z; after giving each `bwd` arrow the shape of its `fwd` arrow it is outward.
  `Gizmo.tsx` wraps `TransformControls` and does this once after it mounts. It reads the library's private `gizmo.gizmo.translate` group (and does nothing if it is missing), so re-check it when three-stdlib or drei is updated. Both the single and the group gizmo use it.
- **Add menu placement (corrects the entry above).** Anchoring the menu to the whole panel (`left-3 right-3`) fixed the narrow case but made it open on the left of a wide panel, away from the Add button.
  Now its right edge is under the Add button (`right-3.5`, the header padding) and it is 18rem wide but never wider than the panel (`max-w-[calc(100%-1.75rem)]`), so it follows the button in a wide panel and shrinks to fit in a narrow one.

## 2026-11-13: Proposed: advanced editing roadmap (deformers first)

A plan only, in `docs/ADVANCED-EDITING.md`; nothing is built or verified yet. The key proposals:

- **Deformers (modifiers) come first** (Bend, Twist, Taper, Noise, Mirror, Array, Subdivide): they are non-destructive and the data is a few numbers, so they fit our undo and later collaboration with no new mesh storage.
  They also give the "bending" asked for, and "Apply" is the bridge to real mesh data.
- **Edit mode and sculpting need a foundation first:** a real editable-mesh object, big meshes stored as separate binary assets (the scene holds only an id), undo by difference (not whole snapshots), modes (Object / Edit / Sculpt), updates that bypass React,
  and a first collaboration rule of "one editor per mesh". Choosing the mesh format is a Phase 5 task, because saving and export must carry custom meshes.
- **Order:** Phase 11 Deformers (can move right after Phase 5), 12 environment tools, 13 edit mode, 14 sculpting, 15 characters. Phase 10 stays "polish and extras".
- **Not decided:** which libraries to use (BVH, boolean, half-edge, skinning). Each needs the usual research (official docs, real latest version, licence) before choosing.

## 2026-11-13: Proposed: importing outside models and assets

A plan only, in `docs/ASSETS-AND-IMPORT.md`; nothing is built or verified yet.

- **GLB first.** One file holds shapes, materials, textures and animation, and most free model sites offer it. glTF with separate files, then OBJ, later; FBX probably never (closed format).
- **A "model" object kind** that stores only an asset id plus the normal object data, so the gizmo, Inspector, undo, lock and parenting all work on it unchanged. Its inner parts stay inside the file at first (one object); showing and editing them comes with the mesh tools.
- **One asset system** for imported files and for big editable meshes: the scene holds an id, the bytes live in separate storage (IndexedDB first, object storage later), content-addressed (id = hash of the contents, so a duplicate is stored once).
  A missing asset shows a placeholder with a message instead of failing.
- **Outside files are untrusted:** size and triangle limits, check the file's first bytes (not only the extension), never fetch addresses inside a `.gltf`, explain every failure, validate our own asset records with Zod.
- **Licences:** each asset records its source and licence. Because the repository is public, no third-party model is added to it without checking its licence.
- **Order:** import and the Assets panel (steps 1 and 2) need no database or accounts, so they can be built right after materials, ahead of the rest of Phase 5.

## 2026-11-13: Materials start with roughness and metalness

- **Two numbers per object**, 0 to 1, in the scene data (`roughness`, `metalness`) next to `color`. They map straight onto three.js's standard material, which is also what glTF uses, so import and export (Phase 5) will line up.
  Texture maps, emissive colour and transparency are later steps.
- **Defaults 0.6 and 0.1** (from the design), not three.js's own 1 and 0, so new objects look slightly satin instead of fully matte. Objects made before this change load with the same defaults, so they look a little different than before.
  Old scenes need no migration (`.default(...)` fills the values in), so the schema version stays 1.
- **Dragging a slider is one undo step**, using the begin / preview / end mechanism from value dragging; arrow keys and typed numbers are one step each. The preview is ignored for locked objects and when no edit is in progress.
- **Known limit:** metal needs an environment to reflect. With only the two lights we have now, high metalness looks dark. A reflection environment (generated in code, no download) belongs to the environment step.
- **Reset buttons** next to each slider put the value back to the default in one undo step; they are greyed out when the value is already the default, and for locked objects.
- **Not built:** a colour picker for non-hex input, per-material presets (plastic, gold, glass), and materials shared between objects.

## 2026-11-13: Convention: every changeable value has a reset button

Asked for as a standing rule. Any control that changes a value gets a reset button that restores its default: one undo step, greyed out when already at the default or when the object is locked, with a tooltip naming the value it resets to.
Done so far: Colour, Roughness and Metalness each have their own, and so does each row of the Transform (Position, Rotation, Scale), which resets only that row. The old "reset all three" button in the Transform header was removed on request, once the per-row ones existed (one reset per thing; do not keep a second button that does the same job).
The default always comes from one named constant (`IDENTITY_TRANSFORM`, `DEFAULT_COLOR`, `DEFAULT_ROUGHNESS`, `DEFAULT_METALNESS`) so the button and the "new object" code cannot disagree; `DEFAULT_COLOR` moved to `scene.ts` for that reason. `resetTransformGroup` (pure, tested) resets one part of a transform and leaves the rest.
Left without one: the name (no starting value), the Parent list (a choice), and the panel widths (double-click the edge). Future controls (light intensity, fog, modifier amounts, brush size) follow the same rule.

## 2026-11-13: Colour picker uses the browser's own chooser

The Appearance swatch became a native `<input type="color">`: free choice of any colour with no new library, accessible by default, and it works with the hex box, the quick colours and the reset button.

- **One undo step per pick.** The picker sends a stream of `input` events while you drag inside it. The first one starts an edit (`beginEdit`), each one previews (`previewNodeColor`, which ignores bad colours, locked objects and calls with no edit in progress), and the browser's `change` or `blur` ends it (`endEdit(true)`). If the panel goes away in the middle (another object is selected) the cleanup ends the edit, so Undo is never left blocked.
- **Trade-off:** the chooser looks different in each browser and operating system, and on some it only reports the final colour when closed. A custom picker (saturation square, hue bar, alpha) would look the same everywhere and could sit inside the panel; it is a possible later upgrade.
- **Not verified:** how each browser fires `change` and `blur` around the picker. Needs a check in Chrome, Safari and Firefox; the worst case is two undo steps for one pick, not lost changes.

## 2026-11-13: Proposed: "Surface and shading" step, and a `material` section in the scene data

Agreed in principle (the name was chosen by the owner's request; "Appearance 2" was rejected as unclear). A plan only; nothing is built.

- **What:** Emissive, Opacity (solid / see-through / cut-out), Double-sided, Smooth or flat shading with an angle limit, Cast and Receive shadow switches, Reflection strength. Built after model import and before lights. Each control gets a reset button, a named default and a row in `TUNING.md`.
- **Move `roughness` and `metalness` into a `material` object** on each node, in the same step. With a dozen or more surface values, flat fields on the node get crowded, and later features need a place for them: shared materials (an id instead of inline values) and material slots (a list of materials per mesh).
  Old scenes need no migration (Zod `.default(...)` fills the new section in), so the schema version can stay at 1, but this must be tested with an old-format scene.
- **Order of the bigger ideas:** texture maps, presets and shared materials after the asset system (Phase 5); advanced surfaces and material slots after that; viewing aids (matcap, wireframe, normals, X-ray, UV checker) with Edit mode and Sculpting. Details in `ADVANCED-EDITING.md`, section F.
- **Not verified:** that three.js's installed material class supports every advanced surface listed, and how each maps to glTF export; checked before building.

## 2026-11-13: Model import, step 1 (import a GLB)

Built as planned in `ASSETS-AND-IMPORT.md`, with these choices. Not yet tried in a browser; the loader and the limits are covered by tests that use a GLB built by hand (one triangle, so no licence question).

- **Loader:** three.js's own `GLTFLoader` (version 0.187.0, in `three/examples/jsm`), `parseAsync(bytes)` from memory, no extra package. drei's `useGLTF` was NOT used: by default it downloads Draco decoders from a Google address, and it takes web addresses, not bytes in memory.
- **No network from a model.** A `.glb` can still point at outside files (by web address). The loader's loading manager is given a URL filter that only lets `data:` and `blob:` addresses through; anything else is counted and the import is refused with "needs N files from outside itself". Tested.
- **Not supported yet, with a plain message:** Draco, Meshopt and KTX2 compression (the loader's own errors are recognised), `.gltf` with separate files, OBJ and FBX.
- **Checks before parsing:** extension `.glb`, not empty, under 50 MB, then the first 12 bytes (`glTF`, version 2, a length that fits) so a renamed text file is refused. After parsing: at least one shape, under 500,000 triangles. A refused file is not stored.
- **Scene data:** new object kind `"model"` with `assetId`; `scene.assets` holds `{ id, name, type, bytes, triangles, boundsMin, boundsMax }` per file (Zod-checked; both new fields have defaults, so older scenes load; schema version stays 1).
  An object with kind `"model"` but no asset record shows a red placeholder instead of failing.
- **Where files live:** an `AssetStorage` interface with an in-memory version for now. Files are lost on reload, as the scene is (no saving yet). IndexedDB comes with saving (Phase 5).
- **Same file twice:** the id is the SHA-256 of the bytes, so the file and its loaded scene are stored once; each object gets its own clone (`SkeletonUtils.clone`).
- **Placing:** a new model is scaled so its longest side is 4 units and stands with the middle of its bottom face at the origin (`fitScale`, `modelOffset`, tested), selected, as one undo step ("Import <name>").
- **In the 3D view:** a model is a group, so (a) selection shows an amber box around it (a shape's outline trick needs one mesh), (b) hidden and locked models get no click handler (an object without one is not tested for clicks), (c) box select uses the box around everything in the group, (d) the gizmo, group gizmo, lock, hide, duplicate, delete, parenting and undo work as for any object.
  The Inspector shows the file's details instead of Colour and Roughness / Metalness (a model has its own materials).
- **Dropping files:** drop on the 3D view imports the first file (others are mentioned and skipped). Anywhere else on the page a dropped file is cancelled, because the browser would otherwise open it and replace the editor (and the scene is not saved).
- **Not done / risks:** the Assets panel; model animation (shown still); very large models are parsed on the main thread and can freeze the page for a moment (a Web Worker is a later option); memory use is not measured; behaviour in Safari and Firefox is unchecked.

## 2026-11-13: Linked scale switch

Asked for as "a link in Transform": linked, changing one of X, Y, Z changes all three; unlinked, only that one.

- **Scale only.** Linking Position or Rotation has no useful meaning (it would move an object along a diagonal, or spin it on all axes at once), so the switch is on the Scale row only. Say if other rows should have it.
- **Proportional, not equal.** Linked means "change the other two by the same factor" (`editScaleProportionally`): a box 1 x 2 x 4 with X typed as 2 becomes 2 x 4 x 8, keeping its shape. Setting all three to the same number would flatten a stretched object. Negative (mirrored) scales keep their mirroring; a scale of 0 is still refused; a result above the 100,000 limit is refused as a whole.
- **Default on** (a start value in `layoutStore.ts`): scaling an imported car or a cube usually means "bigger or smaller", not "stretch it". It is a screen setting, kept while you select other objects but not saved with the scene or across reloads. Making it a per-object setting would need a field in the scene data (and undo steps for toggling it), which seemed too heavy for a convenience.
- **Where it applies:** typing, arrow keys and dragging an axis letter all go through the same function, and a drag stays ONE undo step. The gizmo's Scale handles, the Reset button and the group gizmo are unchanged.
- **Reset-button rule:** the switch is a toggle, not a value with a default, so it has no reset.
- **Layout:** the Scale row's label now holds three small buttons (reset, link), so the label column grew from 68 to 76px and the Inspector's smallest width from 260 to 280px (`RIGHT_PANEL_LIMITS`).

## 2026-11-13: Autosave in the browser (IndexedDB)

Prompted by the scene and imported models vanishing on every page reload (the scene lived only in memory). Not yet tried in a browser; the storage and the autosave logic are covered by tests (`fake-indexeddb`, fake timers).

- **IndexedDB, no library.** It holds big binary files (localStorage cannot) and is built in. A small wrapper turns its requests into promises and waits for the transaction to complete (data really written), not just for the request to be accepted. Version 1: two stores, `scenes` (key `current`) and `assets` (key = file fingerprint).
  `fake-indexeddb` 6.2.8 (Apache-2.0, Node 18 or newer) is a dev-only test helper.
- **Order matters.** Saving starts only after the saved scene has been restored. Otherwise the starting scene (one cube) could overwrite the real one in the first moments. If the saved scene cannot be READ (an error, not bad data), saving stays off, so a temporary problem cannot destroy the saved copy; reloading tries again.
- **Saved data is outside data.** It is parsed with the scene's Zod schema when read, so scenes saved by an older version load with the new fields' defaults, and damaged or hand-edited data is refused. Refused data is copied to `unreadable-backup` before anything can overwrite it, and the user is told.
- **When it saves:** 500 ms after the last change to the scene (not for selecting things or changing the gizmo mode), again right away if a change arrives during a write, immediately when the tab is hidden or the page is left. A failed write (full or blocked storage) is shown in the top bar and as a message, is remembered as "unsaved", and is retried on the next change. If something is still unsaved when the page is closed, the browser asks to confirm.
- **Imported files** are written to storage at import time, before the object appears; if that fails the import is refused with a clear message (usually "the browser storage is full"). If IndexedDB is not allowed at all (some private windows), files and the scene stay in memory and a message says they will be lost.
- **What is NOT saved:** the undo history (a reload starts fresh), the selection, panel state. Panel widths were already saved separately.
- **Limits and open questions:** one scene only (named projects come with the backend); two SceneRoom tabs would overwrite each other (last write wins); stored files that no object uses are never deleted; the browser may delete site data under storage pressure unless the site asks for "persistent storage" (not requested yet); the starting cube appears for a moment before a saved scene replaces it; behaviour in Safari and Firefox is unchecked.
- **Correction to an earlier note:** I said running `pnpm build` while `pnpm dev` is running could leave the dev server serving stale files. Next.js 16 keeps dev output in `.next/dev` and build output in `.next`, so they should not clash, and that explanation is doubtful. What did reset the scene was restarting the dev server (a reload). Builds are run without touching the dev server from now on.

## 2026-11-13: Copy, cut, paste and the right-click menu; range selection in the list

- **Clipboard is inside the app, not the system clipboard.** Objects can contain imported models, whose files cannot travel as text, and the scene data is private to the app. So Ctrl/Cmd + C does not put anything on the computer's clipboard and cannot paste into another app or tab. A real clipboard (JSON for plain shapes) is a possible later step. The clipboard is cleared by a reload.
- **Snapshot semantics.** Copy takes the objects and everything inside them (and the records of the imported files they use) at that moment. Editing or deleting the originals afterwards does not change what will be pasted. It is not part of undo (copying changes nothing in the scene).
- **Paste rules:** every paste makes NEW objects; a top object goes back into its old parent if that still exists and is not locked, otherwise the top level; a name already in use is numbered ("Cube (1)"), a free name is kept (so cut-and-paste restores the name). A copy lands one `DUPLICATE_OFFSET` beside the original and each further paste one step further, so copies do not stack; a cut comes back exactly where it was, then moves along.
- **Cut and locks.** Cut = copy + delete, as one undo step ("Cut"). Locked objects cannot be deleted, so they are not cut and not copied by Cut; Copy and Paste of a locked object work and the copy is locked too (same as Duplicate).
- **Shortcuts do not fight the browser.** Ctrl/Cmd + C and X only act when something is selected and no text is selected on the page; Ctrl/Cmd + V only when there is something to paste; typing in a box is never touched (as for the other shortcuts).
- **Right-click menu.** One menu for the 3D view and the scene list. It acts on the selection: right-clicking an object outside the selection selects it first, inside keeps the selection. Right-clicking empty space shows only Paste (and only if there is something to paste). The right button also rotates the camera, so in the 3D view the menu opens when the button is released without having moved more than 4 pixels; the browser's own context-menu event is only cancelled (on a Mac it arrives at press time and cannot tell a click from a drag). Hidden and locked objects are skipped when picking, like for left clicks.
  Items: Cut, Copy, Paste, Duplicate, Rename (focuses the name box), Hide / Show, Lock / Unlock, Reset transform, Delete. Items that cannot apply (for example Delete when everything is locked) are greyed out. Opening with the keyboard (the context-menu key) is not handled yet. The menu closes on Escape, a click elsewhere, a scene or selection change, or a window change.
- **Range selection in the scene list**, like a file browser: Shift + click selects every row between the anchor and the clicked row as the list is shown now (folded children and rows filtered out by search are not in it); Ctrl/Cmd + click adds or removes one row; Ctrl/Cmd + Shift + click adds the range. The anchor is the last row clicked or Ctrl/Cmd-clicked, or the only selected object however it was selected. This changes the old behaviour where Shift, Ctrl and Cmd all toggled one row. Shift + click on an object in the 3D view still toggles it.
- **Not done:** keyboard range selection in the list (Shift + arrows), Ctrl/Cmd + click to toggle in the 3D view, pasting into several selected objects at once.

## 2026-11-13: Cut marks, paste moves; where a paste goes (replaces the cut rules above)

Feedback after testing: cut deleted the object at once, and it was unclear how to paste a cut child somewhere else (for example as a top-level object). Now:

- **Cut only marks.** The cut objects (and everything inside them) are shown greyed: faded in the list, drawn at 40 percent opacity in the 3D view (a grey wireframe box for imported models, whose materials are shared between copies and so cannot be faded). Nothing is deleted, moved or recorded for undo. Locked objects cannot be cut. Copying or cutting something else replaces the mark; Escape cancels it.
- **Pasting a cut MOVES the same objects** (they keep their ids, so selection and anything pointing at them stay valid), as one undo step "Paste", keeping their place in the 3D view (the same world-position maths as dragging in the list). The clipboard is then emptied: the objects are no longer where they were cut from. This replaces the earlier rule that cut = copy + delete.
- **Where a paste goes** (`pasteTarget`, pure and tested):
  - plain Paste (Ctrl/Cmd + V, "auto", `resolveAutoPlacement`; changed 2026-11-14 after the owner asked for "cut A, click B, paste = A becomes B's child"): INSIDE the single selected object, unless that object is part of what was copied or cut (then beside it, so a copy never goes inside itself). Nothing selected: the top level. Several selected: beside them. Applies to copy and cut alike.
  - Ctrl/Cmd + Shift + V or the menu's "Paste beside": BESIDE the selected object, in its parent (several selected sharing a parent: that parent; otherwise the top level). The menu's plain Paste reads "Paste into <name>" when it will go inside.
  - the menu's "Paste at top level" (and Paste on empty space): the top level.
  - Refused with a message in the bar over the 3D view: a locked parent (or one inside a locked object), and, for a cut, an object that is one of the cut objects or inside one (an object cannot go into itself).
- **Copies keep their place when the parent changes.** A copy pasted into a different parent than the original's gets a transform worked out from the original's real 3D object (`localTransformUnder`), so it appears where the original is (plus one step), not at the parent's origin. Pasting beside the original keeps its local transform (plus one step).
- **Not done:** greying every cut object's materials for models, pasting into several selected objects at once, a visible "paste" cursor or preview, cut and paste across tabs.

## 2026-11-13: Taking an object out of its parent by dragging; space between rows

Feedback: dragging a child in the scene list could not make it a top-level object again, and the rows had no space between them.

- **Top-level drop targets.** There was only a small zone at the very end of the list, and dropping in other empty space did nothing. Now (a) while dragging something that has a parent, a dashed bar stays at the TOP of the list ("Drop here to make it a top-level object"), always in view even in a long, scrolled list, and (b) ALL the empty space under the rows is a drop target (a dashed area while dragging). Both mean "top level". The Parent list in the Inspector ("None") and cut-then-paste at the top level do the same without dragging.
- **A selected child of a selected parent now drags on its own.** A move acts on the top objects of a selection, so dragging such a child used to move nothing (it was assumed to follow its parent). If the dragged row is not one of the selection's top objects, only that row moves.
- **Spacing:** the list is a flex column with `gap-1` (4px) between rows; the bottom drop area takes the remaining height.
- **Still not possible:** putting a dragged object at a chosen position among its siblings. The order of siblings is the order they were created in (it would need an order field in the scene data), so "drop between two rows" would not do what it looks like. Dropping on a row means "make it a child of that row".

## 2026-11-14: Order of siblings, and dropping between rows

Asked for: put a child right under its parent, and rearrange the hierarchy.

- **`order` in the scene data.** Before, siblings were shown in the order they were created (the order of the keys of the node map), which cannot be changed and would not survive the shared Yjs document (Phase 7). Each node now has `order: number` (Zod `.default(0)`): smaller first, and equal numbers keep creation order, so scenes saved before this load unchanged (every order is 0). The schema version stays 1.
- **Whole-list renumbering on a move.** Placing an object renumbers its new siblings 0, 1, 2... (`placeAmongSiblings`) instead of using fractions between neighbours. Lists are short and it avoids number drift. The cost is that a move touches every sibling in that parent (fine for undo snapshots); for real-time collaboration (Phase 7) fractional ordering would conflict less, and can replace this later without changing the interface.
- **A move that changes nothing returns the same scene** and each node keeps its object identity, so "drop before yourself" or "already last" records no undo step. The store decides this by comparing objects, not by looking at the move.
- **Where new objects go:** `addNode` always puts the object at the end of its parent (the order it carries is ignored), which covers adding, importing, pasting and moving into a parent. Duplicates keep the original's number, so they appear right after it (equal numbers: creation order). Subtrees are read in display order, so copies keep the order of what is inside them.
- **Drop zones in the scene list.** The top quarter of a row = just before it, the bottom quarter = just after it, the middle = inside it (last child). The bottom of an OPEN parent that has children = its first child, which is the place right under it (that is where the list shows the next row). Closed parent or a row without children: after it, in its parent. A blue line, indented to the level the object would get, shows the place; the middle shows the outline and "Make a child" as before. The top bar and the empty space still mean "top level, last".
- **No dead strip between rows.** The space between rows is padding on each row's `<li>` (4px in total) and not a gap in the list, so the pointer is always over some row while dragging through the list.
- **Dragging several selected rows** puts them in front of the same place in the order they are listed. Dropping a row next to itself is not offered.
- **Moves between parents keep the world position** as before; a reorder inside the same parent keeps the transform exactly as it is (no recomputing, so no rounding noise).
- **Also:** Move up and Move down in the right-click menu (one place among the siblings, single object, not locked). Keyboard reordering (Alt + arrows) is not done.

## Assets panel (2026-11-14)

- **A tab in the left panel** next to Scene (each tab shows a count; the Add button only shows on the Scene tab; Import is on both). It first was a folded section under the scene list, which the owner did not like, so it became a tab. With no imports the tab says how to import. Each file shows its name, triangles, size and how many objects use it. Buttons: place another copy, source and licence note, delete.
- **Rename** changes the file's name in the panel only; objects keep their own names. **Note** (up to 500 characters) lives on the asset record in the scene, so it is saved with the scene. Old scenes load with an empty note.
- **Deleting a file also deletes every object that shows it** (and their children) as ONE undo step, after a confirmation when objects use it. An object without its file would only be a placeholder. Undo brings all of it back.
- **Known gap:** the file's bytes stay in the browser's IndexedDB after delete (so Undo can restore it). Cleaning up files no scene uses is not done yet.
- **Thumbnails** are drawn in the browser with one shared small three.js renderer (128 px, transparent background, one asset at a time in a queue), from a copy of the loaded model, framed by `thumbnailFraming` (pure, tested). They are kept in memory for the visit, not saved: they are cheap to draw again and would only make the scene bigger. While one is being drawn, or if it fails, a model icon shows.
- **Dragging an asset into the 3D view** uses the browser's own drag and drop (the whole asset card is the handle, except while pressing in a text box, so typing and selecting text still work; the label is `application/x-sceneroom-asset`, value = asset id). `AssetDropController` (inside the Canvas, because it needs the camera) turns the drop point into a ray and `groundHit` (pure, tested) finds where it meets the floor at height 0; the object stands there. A drop above the horizon puts it at the middle. While the pointer is over the 3D view a see-through copy (40% opaque, its own copies of the materials so the real objects are not faded; `AssetPreview.tsx`, `PREVIEW_OPACITY`) follows it, and on drop the solid object takes its place. One undo step "Place <name>".
- **Not done:** search and folders in the Assets tab; drop onto a specific object to make it a parent.

## Surface and shading (2026-11-14)

Built from the plan "Surface and shading" (2026-11-13), with these choices.

- **`material` section.** `roughness` and `metalness` moved off the node into `node.material`, with the new values: `emissiveColor`, `emissiveIntensity`, `opacity`, `doubleSided`, `flatShading`, `castShadow`, `receiveShadow`. Colour stays on the node. Every field has a Zod default, so the schema version stays 1. `sceneNodeSchema` first runs `migrateLegacyMaterial`: an older saved object with flat `roughness` / `metalness` gets them moved into `material` (and an older plane becomes double-sided, because it was always drawn from both sides). Tested with the old shape, with a missing section, with a half-filled section, and with out-of-range values (still refused, also in the old flat shape).
- **The migration also covers the browser's autosave**, so a scene saved before this change opens normally.
- **Opacity is one slider.** The plan had "solid / see-through / cut-out". Cut-out needs a texture with transparent parts, which we do not have until texture maps, so it waits for them. 1 = solid, below 1 = see-through (`transparent`, no `depthWrite`). A cut object is still drawn at 40% (or less if the object is already more see-through).
- **Flat shading, without the angle limit.** A switch (`flatShading`). The angle limit (smooth edges below an angle, hard above) needs normals recalculated on the geometry; left for later.
- **Reflection strength postponed** until the environment step: with no environment map it would change nothing you can see.
- **Shadows.** The canvas has shadows on; the one directional light casts them (2048 map, a 15-unit area around the middle); an invisible 200-unit ground (`shadowMaterial`, no clicks) catches them. Default is cast ON and receive ON, so existing scenes now show shadows. Models take the two switches too (applied to every part of the model); their own materials are left alone, so a model shows only the two shadow switches in the Inspector.
- **Changing a shader setting rebuilds the material** (`key` on flat shading, double-sided and solid / see-through), because three.js builds its shader for those. Bug found in testing: without solid / see-through in the key, lowering opacity did nothing until double-sided was toggled, because a material first drawn solid is compiled with an `OPAQUE` switch that forces full opacity.
- **One undo step per glow-colour pick**, as for the main colour; each slider drag is one step.
- **Not done:** the angle limit, cut-out, reflection strength, shadows from lights other than the one sun (lights come next), shadows beyond 15 units.

## Lights (2026-11-14)

First half of the plan line "point / spot / directional lights; HDRI sky and environment; shadows, fog". The second half (environment, fog) is its own next step, because it is scene-wide settings and not objects.

- **Lights are scene objects**, with three new kinds (`directional`, `point`, `spot`) and a `light` section on the node (colour, intensity, range, angle, softness, cast shadow). `light` is `null` for every other object, so older scenes load unchanged. Because lights are ordinary objects, everything already built works on them: selecting, the gizmo, hide, lock, rename, duplicate, copy and paste, parenting, drag and drop in the scene list, undo and autosave. A light inside a parent moves and turns with it.
- **A light shines along its own -Z (its front).** A new light is aimed at the middle of the scene by `aimRotation` (pure, tested by turning the front vector back and checking it points at the target, including straight up and down). To aim it, rotate it with the gizmo; a target object is not exposed. Internally, directional and spot lights use a target one unit in front that moves with the object.
- **Markers.** A light is drawn as a small ball in its colour, plus an arrow (directional) or a wire cone showing the beam width (spot). The marker takes the clicks and gets the amber outline when selected. Markers do not cast shadows.
- **Strength units.** three.js measures a point or spot light in candela that fades with the square of the distance, but sunlight as a plain strength. So the ranges differ per kind (`MAX_LIGHT_INTENSITY`): 10, 300 and 600. Defaults were chosen to light a unit cube a few units away about as strongly as the built-in sun; to be tuned by eye.
- **The built-in sun and soft light stay** until the environment step, so an empty scene is not black. New lights add to them.
- **Shadows:** each light has a switch. Point lights start off (six shadow pictures each) and use smaller pictures. Many shadow-casting lights get slow: this is not limited yet.
- **Inspector:** lights get a "Light" section instead of Appearance and Surface (a light has no surface). `ValueSlider` (the slider with number box and reset) and `ColorRow` (swatch, hex, reset) were pulled out of the material controls so lights reuse them.
- **Not done:** a visible handle for the aim of a point light is not needed; a "look at" tool; light helpers for shadow areas; IES profiles; area lights; limiting the number of lights.

## Shadow fixes (2026-11-14)

The owner found the shadows "kinda bad", and worse after adding and moving a light. Causes found and fixed:

- **The shadow area of sunlight was never applied.** React Three Fiber sets `shadow-camera-left` and the others as plain numbers but never tells three.js to rebuild the shadow camera's projection, and three.js only does it by itself for spot lights. So for the built-in sun (and for my first directional light) the shadow area stayed at three.js's default, about 5 units each way: anything further out had no shadow. Now `useShadowCamera` sets near, far and the box and calls `updateProjectionMatrix`.
- **Two suns.** The built-in sun kept casting its own shadow next to the one from a light the owner added, so shadows crossed. The built-in sun now stops casting shadows as soon as the scene has a visible light of its own (it still lights the scene).
- **A directional light's shadow depended on where its marker stood.** The picture was taken from the marker, so moving the marker sideways made the shadows miss the scene. A directional light has only a direction, so now its shadow picture is taken from 30 units behind the middle of the scene along the light's direction (position set every frame in `LightObject`), and moving the marker changes nothing but where it is drawn.
- **No bias.** Surfaces shadowed themselves in stripes and acne. Every light now has `bias`, `normalBias` and a shadow `radius` (see `SHADOW_QUALITY`), and near and far planes that fit the scene instead of three.js's 0.5 to 500.
- **Shadow type.** `shadows` was on the default "soft" mode, which this three.js version (0.187) has removed; it fell back to the standard one with a console warning every frame. Now `shadows="percentage"` (the standard one), with softness from each light's `radius`.
- **Not done:** shadows beyond 15 units of the middle; contact shadows; a setting for the scene's shadow area (it belongs with the environment settings).

## Environment (2026-11-14)

Second half of the lights step: the world around the objects, as scene-wide settings (`scene.environment`, Zod defaults so older scenes load with the starting look; the schema version stays 1).

- **Where:** the right panel shows the scene settings when nothing is selected (like a World panel), instead of the old "nothing selected" hint. Undo covers every change; sliders and colour pickers are one undo step per drag.
- **Background:** a colour or a sky. The sky is a small canvas gradient (top, horizon, ground) used as an equirectangular texture, so it is drawn behind everything and can also be reflected. No image downloads.
- **Reflections:** off, "studio" (three.js's `RoomEnvironment`, built in code, run through `PMREMGenerator`), or the sky picture. Default is studio at strength 0.6: dark metal now has something to reflect, and every older scene looks a little brighter. The generated pictures are remade only when their kind or the sky colours change, not for strength or fog changes.
- **Per-object Reflection strength** (the postponed item from Surface and shading). three.js ignores a material's own `envMapIntensity` when the environment comes from the scene, so each shape material gets the environment picture itself (`envMap`) and `envMapIntensity` = its own strength times the scene's. Imported models keep their own materials and use the scene's environment and strength.
- **Fog:** linear fog (colour, start, full distance). Off by default.
- **Base lighting:** the always-on ambient light and sun are settings now (strength, sun on or off, sun compass direction and height). The sun still stops casting shadows once the scene has a light of its own (see "Shadow fixes"). `sunPosition` (pure, tested) turns direction and height into a position; the defaults reproduce the old fixed sun.
- **Not done:** a shadow-area setting for the built-in sun; HDRI files (they need the asset system and a licence check); a sun disc or clouds in the sky; per-object fog; camera objects (a separate item in the plan, they need a "view through camera" mode).

## Build the 3D editing tools before multiplayer (2026-11-14)

The owner wants to design trees, bushes and characters (NPCs) in the editor, and chose to do the editing tools first.

- **New order:** Phase 5 (what the tools need: mesh format, save and export) then Phase 11 (modifiers), 12 (scatter, splines, a plant generator, prefabs), 13 (edit mode), 14 (sculpting), 15 (characters); then Phases 6 to 10 (database, real-time collaboration, accounts, deployment). The phase numbers stay, the order changes.
- **Why it works:** the editor is single-user for now, so mesh tools do not have to be built on a shared document yet. **Cost:** later, edits to meshes must be made to work with the shared Yjs document (big meshes live outside it, as `ADVANCED-EDITING.md` already says), and per-user undo will need to cover mesh edits. Keeping mesh data in separate binary assets from the start keeps that cost low.
- **Added to the plan:** a **plant generator** (trees and bushes from settings such as trunk height, branches, leaf density and a random seed, built on splines, scatter and modifiers) in Phase 12, and **prefabs** (a saved, reusable group). NPCs that move are Phase 15 (modelling, skeleton, posing); animation and behaviour stay later.
- **First step:** Phase 11, modifiers, because it needs no new storage: the object keeps its shape and a short list of settings.

## Modifiers, step 1: segments, bend, twist, taper (2026-11-14)

First step of Phase 11. Non-destructive: an object keeps its plain shape and a short list of settings; nothing new is stored as mesh data.

- **Data:** `segments` (1 to 32) and `modifiers` (up to 8) on each node, both with Zod defaults (older scenes load with 1 and an empty list; schema version stays 1). A modifier is `{ id, type, enabled, axis, ... }` in a discriminated union: bend (angle -360..360), twist (angle -720..720), taper (amount -1..1). New kinds are added by extending the union. Only the built-in shapes support modifiers (`supportsModifiers`); models and lights do not.
- **The maths is pure** (`deformPoints` works on a list of x, y, z numbers, so it is tested without three.js): it measures the shape as it is when each modifier's turn comes, so the order matters (and the card has move up and down). Bend lays the shape along a circular arc and keeps its length along the centre; twist turns each slice in proportion to its place along the axis (right-hand rule, like three.js rotation); taper scales the two directions across the axis from 1 at the near end to `1 - amount` at the far end. A shape with no length along the axis (a plane edge-on) is left alone. Tested with exact points (an arc's end, a quarter turn, a half-size top), and for the order.
- **Rendering:** `buildShapeGeometry` makes the plain shape with the chosen segments and, if any modifier is on, moves its points, recomputes normals and bounds (needed for clicking). It is rebuilt only when kind, segments or modifiers change (`useMemo`), and the old geometry is freed. Cost grows with segments; a cube at 32 segments is about 6,000 points, which is fine.
- **Segments:** apply to cubes (all three directions), planes, cylinders and cones (along the length); a sphere is already cut finely and ignores it. Round shapes have a fixed 32 pieces around.
- **Inspector:** a "Shape" section with Segments, then one card per modifier (on / off, move up, move down, remove, axis, one slider), and the Add buttons. Slider drags are one undo step; each value has a reset button. `ValueSlider` got a `min`, because angles go negative.
- **Smooth shading:** normals come from the faces (`computeVertexNormals`). A cylinder or cone shows a faint seam where the round side meets itself, because the points there are doubled; merging them is a later improvement.
- **Not done:** Stretch, Noise, Mirror, Array, Subdivide (step 2); Apply, which bakes the result into an editable mesh (step 3, needs the mesh format from Phase 5); modifiers on imported models; limit lines or a gizmo to drag the bend.
- **Axis clarity (same day, after the owner asked):** one modifier still works along ONE axis (a per-axis row set would hide that a bend has two directions, the one it runs along and the one it curves towards, six combinations). Instead the card is made clearer: the axis buttons are coloured like the axes in the editor (X red, Y green, Z blue, the `--color-ed-x/y/z` colours), the card title shows the axis ("Bend · Y"), a plain sentence under the title says what it does (`describeModifier`, pure and tested, with axis names such as "Y (up)"), a Duplicate button puts a copy right after the card so a second bend along another axis is one click (`duplicateModifier`), and a tip under the Add buttons says each modifier works along one axis. Several of the same kind are allowed (up to 8) on purpose.
