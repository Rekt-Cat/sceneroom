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

## Modifiers, step 2: stretch, noise, mirror, array (2026-11-14)

- **Four new kinds** in the same union (`stretch`, `noise`, `mirror`, `array`); old scenes and the three earlier kinds are unchanged. Subdivide is not here: it needs real mesh topology work and belongs with the editable-mesh step.
- **The pipeline now carries triangles.** `deformMesh` takes `{ positions, indices }`. Bend, twist, taper, stretch and noise only move points (the triangles stay); mirror and array add points and triangles. `deformPoints` stays as the points-only wrapper used by the earlier tests. In the web part `buildShapeGeometry` writes the new points and triangles back, clears the material groups, drops the picture coordinates (`uv`) when the number of points changed, and recomputes normals.
- **Mirror** copies the shape reflected through the middle plane of the axis (the origin of the object, not the middle of the shape) and reverses the order of each copied triangle's corners, because a reflection turns triangles inside out. To mirror an off-centre half, build the half off-centre. A "merge points on the plane" option and "only keep one side" are later options.
- **Array** puts the original first and the copies further along the axis, `spacing` times the shape's length apart. It measures the shape as it is when its turn comes, so an array after a stretch repeats the stretched shape.
- **Noise** is smooth "value noise" from a small repeatable random function (a hash of the grid corner and the seed, blended with smoothstep); the push depends only on where a point is, so points on the same spot (cube corners, cylinder seams) move together and no gaps open. Strength is a fraction of the shape's biggest size, so it behaves the same on a small and a large shape. Tested for repeatability, the size limit, smoothness and twin points.
- **Limit:** a modifier that would make more than 400,000 points is skipped (the card stays, nothing happens), so a high Segments cube with a 20-copy array cannot freeze the editor. There is no message in the Inspector for that yet.
- **Inspector:** one table (`SLIDERS`) lists each kind's sliders, so adding another kind is a data change; the axis buttons are hidden for noise (it has no axis), and stretch has a "Keep volume" switch. Every value has a reset button.
- **Not done:** Subdivide; Apply (bake into an editable mesh); a message when a modifier is skipped for too many points; mirror options (merge, one side only); noise that follows the surface direction (it moves points in x, y and z independently now).
- **Mirror needed an offset (found in testing).** Mirroring through the origin made a plain cube, which is centred there, land exactly on itself, so nothing seemed to happen. Mirror now has an **Offset**: the plane stands that many shape-lengths from the origin along the axis (default 0.5, at the side of a centred shape, so the flipped copy sits beside it; 0 is the old behaviour, through the origin; range -3 to 3). The copy is also useful once the shape is asymmetric (taper then mirror gives a spindle). A true "symmetry while editing" comes with edit mode and sculpting.

## Save and open scene files (2026-11-14)

First piece of the foundation for the editing tools (Phase 5): scenes can leave the browser.

- **A container, not a zip and not one big JSON.** Layout in `docs/SCENE-FILE-FORMAT.md`: letters, version, header length, a JSON header (the scene and a list of the model files), then the model files as raw bytes. A zip would need a library (and its own security checks for odd paths and sizes); base64 inside JSON makes a 50 MB model 67 MB and slow. The container is about 60 lines, easy to check completely and easy to read from a server later.
- **Everything about the scene is in the header** and goes through the same `sceneSchema` as the autosave, so a file from an older version fills in new settings with defaults, and bad values are refused with the place they are wrong. Old files keep opening; a newer file in an older app says "update the app".
- **Nothing in the file is trusted.** Size limit before reading; every length checked against the file; each model must be a real GLB; and (in the web part, because it needs a hash) each model file must match its id, which is the SHA-256 of its contents. A file that fails any check changes nothing.
- **Open replaces the scene.** It asks first, because it cannot be undone (the undo history is cleared, like the first load); the current scene can be saved as a file first. The autosave then saves the opened scene as usual. Merging a file into the open scene is not done.
- **Drop and button.** Open (top bar) and dropping a `.sceneroom` file on the 3D view both go through `openSceneFromFile`; Save (top bar) and Ctrl or Cmd + S download the file. Messages use the bar over the 3D view.
- **Tested** by saving a scene with a model, clearing the editor, swapping in an empty model store (a fresh browser), and opening the file: the scene, the model file, the notes and the settings all come back. Also: bad files, a model file that does not match its id, a missing model file (it opens, models show as red boxes), a declined question, and dropping.
- **Not done:** a file name for the scene (it still says "Untitled scene"), remembering the last file, a "save as" with a chosen name (the browser decides where the download goes), merging a file into the open scene, export to GLB for other programs (next), saving to the cloud (Phase 8).
- **Big models and file size (decided with the owner):** a scene file is as big as the models inside it (about 250 MB at the limit; most free models are 1 to 10 MB, and a model used many times is stored once). The real fix is cloud storage in Phase 8: models upload once and scenes only point to them, so scene files stay tiny and sharing is a link. Until then the limits stay as they are. Ideas kept for later if they are needed before Phase 8: "Save without models" (scene only, a few KB; models taken from the browser if present), gzip with the browser's `CompressionStream`, and reading the file in pieces to save memory.

## Export to GLB (2026-11-14)

- **A clean scene, not the screen.** `buildExportScene` builds a fresh three.js scene from the scene data (not the live canvas, which holds light markers, outlines, the grid and the shadow ground) and `GLTFExporter` (in three.js's own `examples/jsm`, no new package) writes it as a `.glb` with positions, rotations and scales per object (`trs: true`).
- **What is written:** the hierarchy; shapes with their modifiers APPLIED (a bent tube is exported bent: the geometry comes from `buildShapeGeometry`, the same function the screen uses, so the two cannot drift apart); a standard material per shape (colour, roughness, metalness, glow colour and strength, opacity as `BLEND`, double-sided); flat shading as faceted triangles (a glTF material has no flat-shading switch, so each triangle gets its own points); the three kinds of light (`KHR_lights_punctual`, aimed along the object's front, which is how glTF aims lights too); imported models (a copy of the loaded file inside the object, shifted by `modelOffset` like on screen).
- **What is left out, and said so in the message after the export:** hidden objects; models whose file cannot be loaded; and, because a GLB cannot hold them, the background, fog, reflections and the built-in sun and ambient light. A reflection strength per object is also not written.
- **Units of light:** the numbers go out unchanged. three.js uses physical units for point and spot lights (candela) and a plain strength for sunlight, and glTF's light extension uses the same units, so they should look similar in other programs; programs differ in their own exposure, so a Unity scene may need its light intensities tuned.
- **Tested for real**: the tests write a GLB and read its JSON back (the exporter needs a browser's `FileReader`, so the test supplies a small stand-in): hierarchy, transforms (a quarter turn becomes the right quaternion), hidden left out, material values, bent geometry bigger than plain, faceted triangles, the three lights with their cone angle, a model whose file is missing, and that freeing the export scene does not free a model's own parts (they are shared with the screen).
- **Not done:** export of only the selected objects; textures (there are none yet); animation; saving the glTF as separate files (`.gltf` + `.bin`); a "bake" option that merges everything into one mesh; reading back what was exported (import of a whole scene GLB is the import of a model, not a scene).

## Editable meshes, step 1: the foundation (2026-11-14)

The first of the "foundation" decisions in `ADVANCED-EDITING.md`, built so that everything after it (edit mode, sculpting, the plant generator, characters) has somewhere to stand.

- **A new object kind, "mesh".** Its points and triangles are NOT in the scene JSON: the object holds an `assetId` and the data is a separate binary blob (layout in `docs/SCENE-FILE-FORMAT.md`), stored by `assetStorage` (IndexedDB) next to imported model files, under the fingerprint (SHA-256) of its bytes. The asset record (`type: "mesh"`, triangles, box) is in `scene.assets`. This reuses everything the models already had: storage, the file format, fingerprint checks, copy and paste (copies share the blob), autosave.
- **A stored mesh never changes.** An edit makes a NEW blob under a new id and the object points to it; the old one stays. That makes undo cheap with no new machinery: the undo history holds scenes, and a scene only holds the id. The price is memory: every version stays in storage. Two things limit it: meshes that no object uses are not saved in a file (`pruneUnusedMeshAssets`), and a clean-up of unused versions in the browser's storage is still to do. **Per-stroke undo by difference** (store only the points a sculpt stroke changed) is still needed for sculpting and is NOT built; the plan is unchanged.
- **Apply modifiers and Convert to mesh** (the same action, named by whether modifiers are on): `bakeNodeToMesh` builds the geometry the object looks like now (`buildShapeGeometry`, or the mesh with its modifiers), copies out its points and triangles (`geometryToMesh`), stores them, and the store turns the object into a mesh IN PLACE (`bakeToMesh`: same id, position, parent, children, colour and surface; modifiers and segments cleared). One undo step brings back the shape and its modifiers. A mesh can get modifiers again and be applied again, making a new version.
- **Modifiers work on meshes too** (`supportsModifiers` is true for shapes and meshes): the mesh's own points are never changed; the modifiers are applied on top, and Apply bakes them in. Segments do not apply to a mesh (it has its own points).
- **Showing a mesh:** `MeshGeometry` reads the data once (cached, since it never changes), builds the geometry with normals computed from the triangles, and frees it when it changes. While it loads, nothing is drawn; if the data is missing or damaged, a plain box stands in and the Inspector says the record is missing.
- **In files and exports:** a mesh travels in the `.sceneroom` file like a model (checked on opening: layout, sizes against the header before allocating, finite numbers, triangles inside the point range, fingerprint) and is exported to GLB like any shape, with its modifiers applied. It is not listed in the Assets tab (the tab is for imported models).
- **Flat shading** still works on a mesh (it is a material setting). Normals are not stored, so a baked cube keeps its sharp edges because its corners are separate points, as before.
- **Not done:** edit mode (select and move points, edges, faces), a clean-up of old mesh versions in the browser's storage, undo by difference, UV coordinates (there are no textures yet), merging touching points (the "open edges" 3D-printing check from the GLB test), a "Make a copy of the mesh" that does not share data (not needed: data never changes).
- **Bug found in testing, and why an object must never have an empty geometry:** selecting an object and pressing Apply crashed the whole 3D view ("Cannot read properties of undefined (reading 'count')"). The selection outline (drei's `Outlines`, whose default `angle` is π) works out smoothed normals with `toCreasedNormals`, which needs a `position` attribute; while a mesh's data was being read, `MeshGeometry` rendered nothing, so the object had three.js's default EMPTY geometry. Now it shows `PLACEHOLDER_GEOMETRY` (one triangle with no area, shared, never disposed) while loading. The same would have crashed a reload with a mesh selected. **Rule for new object kinds:** an object that is drawn with the outline must always have a geometry with points. `meshGeometry.test.tsx` mounts the real components in React Three Fiber with a stand-in for the WebGL renderer and checks every mesh through the swap, the loading moment, missing data and a missing id; with the fix removed, 4 of its 5 tests fail with the exact error.
- **Clearer button and a record (after the owner found the two names confusing):** the Inspector button is now ONE fixed label, **"Make mesh"**, at the TOP of the Shape section (it used to be "Apply modifiers" or "Convert to mesh" at the bottom, where each new modifier card pushed it out of sight). A plain line under it says which case this is: with modifiers on it names them and says they are baked in for good; without, that the shape becomes points and triangles. Pressing it still makes the mesh either way; modifiers only change what the shape looks like when it is made. A mesh with nothing to bake does not show it.
- **A written record of how a mesh was made.** The sliders are gone after baking, so the values are written into the mesh's notes (`note` on its asset record, shown in the Inspector under "How it was made"): `Made from a cube (12 segments)` and `Applied: Bend along Y 45°, Twist around Y 90°` (only modifiers that were switched on, in order; `summariseModifiers`, pure and tested). Making a mesh from a mesh adds a new "Applied" line below the old ones and does not repeat where it came from; when the 500-character limit is reached the oldest lines go first (`appendNoteLine`). The record is part of the scene, so it is saved in the `.sceneroom` file. It is a record only: the values cannot be changed afterwards (Undo right after is the way back). Keeping the original shape and modifiers inside the mesh for a "Back to modifiers" button was considered and not done.

## Edit mode, step 1: select and move points (2026-11-14)

The first piece of Phase 13. What it does: Tab (or the Inspector's "Edit points" button) on a shape or mesh shows the wire lines and a dot on every point; click, Shift + click or Ctrl-drag a box to select points; the move handle appears on them; dragging reshapes the mesh live; letting go stores the result.

- **A shape is made into a mesh first** (`startEditing` bakes it with the same action as "Make mesh", so the sliders it had are baked in and noted). A mesh with modifiers on it is refused with a message saying to bake them first: the points on screen would not be the stored ones. Locked objects and lights are refused.
- **Edit mode is screen state** (`editStore`: which object, which points), not scene data: not saved and not in undo. It ends by itself (`watchEditMode`) when the edited object is no longer the one selected object, is deleted, or stops being a mesh (Undo of the conversion). Edits and their Undo keep the same object selected, so they do not end it (tested).
- **The overlay is drawn on the mesh object itself and shares its point list.** `buildEditOverlay` adds lines (the unique edges, `meshEdges`) and dots as children of the mesh, using the very same position attribute as the mesh geometry. Moving a point on the mesh therefore moves the line end and the dot with no extra work; only the dot colours are the overlay's own. The overlay takes no clicks (its `raycast` does nothing) so it does not get in the way of the pointer or of the right-click menu.
- **Dragging is live, storing is on release.** While the handle is dragged, `moveSelectedLive` writes `start + delta` into the geometry's own point list (always measured from where the points were when the drag began, so there is no drift) and recomputes normals and bounds. On release `commitMeshPositions` stores the points as a NEW mesh version (same triangles, same name and notes) and `replaceNodeMesh` makes the object use it: ONE undo step "Move point" or "Move N points". Storing the same points again makes no step. Undo and Redo just swap the id; both versions stay in memory, so either is shown at once.
- **No flash after an edit.** A stored or re-read mesh is also kept in a plain map (`peekMeshData`), so `MeshGeometry` has the new geometry in the very same render instead of showing the loading placeholder for a frame (a mesh with nothing to draw would also lose its selection outline).
- **Screen maths is pure and tested** (`packages/shared/src/meshEdit.ts`): nearest point to a click, points inside a box, what a click or a box does to the selection (with Shift), the middle of the selection, translating from the start. Only the projection of points onto the screen uses three.js (`projectPoints`).
- **Picking ignores hidden-ness on purpose.** Points are drawn without a depth test (you can see and click points on the far side) and picking uses the screen position only, so what you can see is what you can pick. Selecting only the visible side (as other modelling programs do by default) is a later option.
- **Keys while editing:** Tab and Escape leave; A selects all points; undo, redo and save work as usual; the keys that act on whole objects (delete, duplicate, copy, cut, paste, add, lock ...) do nothing, so Delete cannot remove the object you are editing. The object-level move handle is hidden for the edited object, and a click on its surface does nothing (so Shift + click cannot toggle it out of the selection and end edit mode). A click on empty space only clears the point selection.
- **Tested:** all the pure maths; starting, refusing and leaving edit mode; ending by itself; storing an edit and its Undo and Redo; the overlay (shared points, colours, no clicks, dispose); projection with a real camera; live moves; and, in a React Three Fiber test with a stand-in renderer, that a new stored version is shown at once with the outline on it and the overlay can be put on it again. **Not tested here:** the move handle itself and the mouse picking (they need a browser: the handle is drei's `TransformControls`).
- **Not done:** selecting edges and faces (points only), rotate and scale of selected points, delete / extrude / inset / bevel / loop cut, mirror editing, selecting only visible points, soft selection, undo by difference for very big meshes, a point-count readout (the bar shows triangles).

## Edit mode, step 2: turn, scale, delete, extrude, select faces (2026-11-14)

- **Bug fixed first: points on the same spot move together.** In step 1 a click picked ONE point, but a cube corner is three points (one for each face, so faces can have sharp edges) and a cylinder seam is two. Moving one tore a gap in the surface. `weldGroups` finds the points that sit on the same spot (a grid of 0.0001 units; copies made by three.js are bit-for-bit equal) and a click now selects, adds or removes the whole spot (`selectionAfterWeldedClick`). Box select needed no change (points on one spot project to the same pixel).
- **Turn and scale** use the same W / E / R keys as for objects. All three modes go through one path: the change of the handle in the 3D view is turned into a matrix in the mesh's own space (`inverse(object) * change * object`, so a turned, scaled or parented object works) and applied to the selected points measured from the start of the drag (`transformSelected`, tested with translate, scale around a pivot, a quarter turn, and no drift).
- **Delete** removes the selected points, every triangle that uses any of them, and the points nothing uses any more, then renumbers (`deletePoints`). The points on the same spot are included first, so no stray point is left behind. It refuses to delete everything. The Delete and Backspace keys do this in edit mode and NEVER delete the object.
- **Extrude** (Shift + E or the button) works on faces: a face is a triangle whose three points are all selected. The faces are copied and pushed `0.25 x size` along their average direction, the copy becomes the new face (and the new selection, so you can drag it further or extrude again), the old position gets walls on the edge of the group, and neighbouring faces stay (`extrudeFaces`). The edge of the group is found by SPOT, not by point number, so the join between two selected faces made with separate points gets no wall. The walls get their own points so they have sharp edges. Checked with exact geometry: every wall faces away from the group (the sign of its normal against the middle of the face), a cube side becomes a taller box with the right triangle counts, and an extrude of an extrude works.
- **Alt + click selects a whole flat face** (`flatFacePoints`): the triangle under the pointer plus every connected triangle in the same plane (within 1 degree), walking across shared edges by spot. A cube side is its two triangles; a subdivided plane is all of it; a round surface is just the triangle. It uses a three.js raycast against the edited mesh, so it picks the face you can see. This was added because boxing a face in a see-through view is clumsy and extrude needs whole faces.
- **Locked objects:** if the object is locked while it is being edited the handle is hidden and extrude and delete say so (found by a test: they used to report success and do nothing).
- **Each operation stores a NEW mesh version** (`commitMesh`, which also covers changed triangles) and is one undo step with a clear name ("Extrude", "Delete 12 points", "Rotate 4 points"). After an operation the points are numbered again, so the selection is set from the operation's result.
- **Not done:** selecting edges, selecting only the visible points, inset, bevel, loop cut, knife, merge or weld points on purpose, bridge, fill a hole, flip normals, mirror editing, an extrude that follows the normal while dragging in one go (extrude and drag are two steps), a numeric distance for extrude.

## Plant generator, step 1: trees, pines, bushes and forests (2026-11-14)

The first piece of the plant generator planned for Phase 12 (the owner wants to design trees, bushes and later NPCs).

- **A plant is an object kind, "plant", with a `plant` section of numbers (and no shape).** Like a modifier, the settings are saved and the shape is worked out from them, so everything stays editable and tiny: a scene with a hundred trees saves a hundred short lists of numbers. Old scenes load with `plant: null`.
- **The generator is pure and seeded** (`generatePlant` in `packages/shared/src/plant.ts`): the same settings always give exactly the same plant (tested point for point), another seed grows a similar but different one. It uses a small repeatable random generator (mulberry32). It returns two meshes, the wood and the leaves.
- **How it grows.** The trunk is a short chain of points whose direction wanders a little (crookedness) and, for branches, leans down or up (droop). Branches start along the middle and outer part of their parent, spread round it by the golden angle (so they do not line up), tilted by the branch angle, shorter than the parent (and shorter near the tip), up to 3 generations. Each branch is a round tube whose rings are carried along without twisting; the tip is closed with a point and the trunk's base with a flat cap. Leaves sit at the tips of the last generation of branches and, with higher density, a little way back from them. Leaves are either faceted lumps (an icosahedron, 20 triangles, turned and squashed at random) or flat crossed cards drawn from both sides (the back has its own points so it lights correctly).
- **Three starting kinds** (`PLANT_PRESETS`): tree, pine (tall, drooping layers of short branches) and bush (low, many branches from the ground). They are only starting numbers: the kind buttons in the Inspector set the numbers and trunk colour and keep the seed; every number can be changed afterwards.
- **Two colours, one surface.** The trunk uses the object's own colour, the leaves their own `leafColor`; roughness, metalness, glow, opacity and shadows are the object's (shared with shapes through the new `SurfaceMaterial` component). New plants start with flat shading, which suits the lumps.
- **Forests (`Scatter copies`).** `scatterSpots` picks spots in a circle by throwing darts and keeping those far enough from the others (fewer if the circle is crowded), with a turn, a size within the variation, and a seed of its own for each copy; `scatterPlants` adds the copies as ordinary plant objects around the original, in the same parent, as ONE undo step. A copy is a full plant object, so it can be moved, restyled or deleted on its own. Copies cost their own generation (about 2 ms each).
- **Make mesh turns a plant into editable meshes** (`bakePlantToMeshes`): the object becomes the wood mesh in place (position, name, colour, children kept) and a new mesh object holding the leaves is added INSIDE it at its origin, in the leaf colour, so they move together. The plant settings are gone afterwards; the notes of each mesh record the seed and size. One undo step brings the plant back. A bug found by the test: the new leaves object copied a cube's starting height (half a unit up), so the leaves would have floated; it now starts at the wood's origin.
- **Export to GLB:** a plant is exported as two meshes, "<name> wood" and "<name> leaves", each with its own colour; no leaves means only the wood.
- **Inspector:** a "Plant" section (kind buttons, seed with a "new random seed" button, trunk, branches, leaves, colours, roughness and metal, detail, forest, make mesh), every value with its own reset button.
- **Tested:** the generator (determinism, valid meshes, height and width, more levels or branches make more triangles, the tubes and lumps face outwards, caps, leaves only near the top, presets differ as expected), the clean-up of settings, scatter (inside the circle, spacing, size range, unique seeds, crowding, deterministic), the store actions and Undo, baking, saving and reopening a forest, GLB export, and, with a stand-in renderer, that a selected plant with its outline keeps valid geometry through changes (the area that crashed before).
- **Not done:** leaves that follow the branch direction (lumps are placed, not turned to face anywhere), seasons or wind, a trunk base flare or roots, other kinds (palm, willow, cactus), growing along a curve you draw (needs splines), level of detail for big forests (every tree is its own object and its own geometry; hundreds will be slow), wood bark colours that vary, and NPCs (Phase 15).

## My plants and Randomise (2026-11-14)

The owner asked whether a user can create their own tree. They already could (sliders, then Make mesh and edit mode); what was missing was keeping a designed plant and rolling variations.

- **Save as my plant.** The Plant section has a name box and a Save button. It keeps the plant's numbers and trunk colour (NOT the seed: each new one gets its own, so a saved "oak" grows differently every time) under a name. Saved plants show in the Add menu's Plants tab under "My plants", one click to add, with a trash button to forget one. Saving a name that is already used (ignoring capitals) REPLACES it, so tuning and saving again updates it instead of piling up copies. At most 24; the oldest are dropped.
- **Kept in the browser, not in the scene.** The list is in `localStorage` (`sceneroom.plants.v1`), so it is there in every scene and after a reload. It is NOT in the `.sceneroom` file: a scene always carries the numbers of the plants in it, so it opens correctly anywhere; only the convenient list of saved ones stays in the browser. (When prefabs arrive with the Assets tab, a saved plant can also travel with a scene.) The list is outside data, so it is checked when read: items that are not valid are dropped and the rest kept, a list that is not a list gives an empty one, duplicates are ignored, and storage that is blocked, full or damaged never crashes anything (the list still works for that visit).
- **Randomise.** One button that varies the shape numbers by up to a quarter and picks a new seed (`varyPlant`, pure, seeded by a random number from the button so each press differs, and tested: same stream gives the same variation, always inside the allowed ranges even from the extremes, a pine stays tall and drooping after many presses, 50 presses in a row still make valid plants). Levels, sides, rings, leaf style and colours are kept because they change how heavy or how styled the plant is, not just its shape. One undo step.
- **Not done:** renaming a saved plant (save under the new name and forget the old); saving the seed too; applying a saved plant to a plant already in the scene (add a new one instead); sharing saved plants between browsers or with other people (needs prefabs and accounts); a preview picture in the list.
- **Randomise drifted towards small plants (found by the owner), fixed two ways.** (1) The size factor was `1 + or - 0.25`; those do not cancel (x 1.25 then x 0.75 is x 0.94), so every press leaned smaller and, with the minimum height of 0.2 clamping the result, plants piled up near 0.3 to 0.4. Sizes are now multiplied by `1.25 ^ (-1..1)` (between 0.8 and 1.25), which balances out (tested: the average of the logarithms over 4000 variations is within 0.01 of 0). (2) Even a balanced chain of variations is a random walk (measured: 60 presses from height 3 ranged from 0.2 to 27), so each press is now a variation of the plant the button STARTED from, not of the last result (`createPlantRandomiser`): 60 presses stay between 2.4 and 3.75 with a median of 3.06. A new starting plant is taken as soon as the plant is not what the last press made (a slider, a kind, Undo). Measured for the record: the old rule gave a median of 1.43 after 60 presses from 3, with many at the 0.2 minimum. Tests: 1000 presses never go below 2.4 and the average stays within 5% of the start; every press stays within the range of the starting plant; a value already at an end stays valid; changing a slider or using Undo starts from the new plant.

## Characters, step 1: a skeleton you can pose, NPCs and crowds (2026-11-14)

The first piece of Phase 15, for the owner's goal of designing NPCs.

- **A rigid skeleton, not skinned skin.** A character is a 16-bone humanoid skeleton (hips, spine, neck, head, and for each side an upper arm, forearm, hand, thigh, shin and foot) with low-poly body parts attached to the bones. A part follows its bone exactly, like a robot or a game character of the early 3D days. Smooth skinning (skin bending over a joint, with weights per point) is a much bigger step and is NOT done; rigid parts with a ball at each joint (so a bent elbow has no gap) look right for the low-poly style and give a real bone hierarchy to export. Unity and Blender can animate the exported bones.
- **A character is an object kind, "character", with a `character` section of numbers (and no shape)**, like a plant: proportions (height, build, head size, leg and arm length), hair, sleeves and trousers, five colours, and a pose. The body is worked out from them (`buildParts`, pure: 18 parts, about 900 triangles, 0.5 ms). Old scenes load with `character: null`.
- **The pose is three angles per bone: swing, out, twist, in degrees**, with signs chosen so that a positive number means the same on both sides of the body (swing = forwards, out = away from the middle, twist = outwards; a knee bends with positive, a foot lifts its toes). Each bone has a range of what its joint can do (`BONE_MOTION`), so a knee cannot bend backwards: the pose is cleaned to those limits when it is changed and when it is read. So the same numbers on the left and right bones give a mirror image (tested), which makes symmetric poses easy and "Copy to the other side" trivial.
- **Maths and drawing agree exactly.** Bones are matrices (`boneMatrices`: a bone's matrix is its parent's, then a move to its joint, then its turn, in three.js's "XYZ" Euler order). The 3D view draws each bone as a nested group (`CharacterObject`), so posing is only a change of rotations and the geometry of the body is NOT built again (tested: the same geometry objects before and after a pose change; a pose change costs 0.05 ms). A test builds the same groups with three.js itself, in every pose preset and in random poses within the limits, and compares every bone's world matrix with ours to 9 decimals, so what is drawn, baked and exported cannot disagree.
- **Pose directions are tested with the joints' places in space**, because they are easy to get wrong and hard to see by eye: a T-pose puts the hands out to the sides level with the shoulders at the arm's length, on both sides; swinging an arm forwards moves the hand towards +z; an elbow bends the hand forwards; a knee bends the foot backwards; walking puts the left foot ahead of the right; sitting puts the knees forward at hip height; raising an arm out reaches above the shoulder; turning the head moves nothing below it.
- **Standing on the ground.** With "Stand on the ground" on (the default) the body is lifted or lowered so its lowest point is at height 0, whatever the pose: a sitting character lowers its hips onto the ground, and a character with a lifted foot is held by the other. It is calculated from the posed points (`groundLift`).
- **Looks and poses.** Four kinds (Person, Child, Stocky, Tall; a kind button keeps the pose) and six poses (Stand, T-pose, Wave, Walk, Run, Sit), all only starting numbers. The pose controls: a pose button, or pick any bone and set its swing, out and twist (a channel a joint cannot do has no slider), "Copy to the other side", "Reset pose". A "Show skeleton" switch draws the bones and joints over the selected character (a view aid kept in `characterViewStore`, not saved and not undoable).
- **Randomise look and crowds.** Randomise picks colours from natural palettes (skin tones, hair colours, clothes), a hair style, sleeves and trousers, and changes height and head size by up to 12% (by a factor that balances up and down) and build a little. It is anchored like the plant Randomise (every press varies the character you started from), after the owner's drift report for plants. "Make a crowd" puts copies around the character using the same dart-throwing spots as forests, each with its own randomised look, size and turn and the SAME pose, as one undo step; every copy is a full character object.
- **Make mesh** bakes the pose into points (`bakeCharacter`): the skin mesh becomes the object itself and a mesh for each other colour (hair, shirt, trousers, shoes, eyes) is added inside it at its origin, in that colour. The skeleton and the sliders are gone afterwards; the notes record how many bones were posed. One undo step.
- **Export to GLB** writes a real bone hierarchy: a node for every bone (named like the bone: `hips`, `upperArm.L` ...), at its joint, turned by the pose, with the body part meshes as children, each in its own colour. The hips carry the ground lift. Other programs can rotate `upperArm.L` and the arm turns. It is rigid parts on bones, NOT a skinned mesh (no skin or weights are written).
- **Tested:** the maths (skeleton, every part is a closed outward-facing shape by its signed volume, each pose direction, the ground lift, symmetry, baking, settings clean-up, randomise without drift, crowds), the three.js comparison above, the 3D view with a stand-in renderer (nested groups, parts and colours, no rebuild on a pose or colour change, sitting grounded, selection box, skeleton overlay), the store actions and Undo, Make mesh, saving and reopening a crowd, and the GLB hierarchy. A bug found by a test: the limb tubes ran downwards and came out inside-out (negative volume), now built as upward tubes with their ends swapped.
- **Not done:** skinned meshes and weights; animation (a timeline, walk cycles, retargeting: planned as a separate later project); morph targets and face expressions; clothes other than sleeves and trousers; fingers; a base mesh to sculpt from; reference images; picking a bone by clicking it in the 3D view; inverse kinematics (drag a hand and the arm follows); saving your own characters like "my plants"; level of detail for big crowds (every part is its own mesh: 60 characters is about 1,100 meshes).

## Product direction: friendly AND professional (2026-11-14)

The owner wants professionals to use SceneRoom too, and wants it to be much friendlier than Maya or Blender while keeping the advanced features. Recorded in `PLAN.md` ("Product principles" and Phase 16) and here.

- **The rule: easy by default, deep on demand.** The first thing a new user sees must work with no manual and produce a result in minutes; every professional feature must still be reachable, never hidden behind a missing option. Depth is added as folded "advanced" areas, shortcuts, numbers you can type, a command palette and keymap presets, not by making the first screen harder.
- **A checklist every new tool must meet before it is called done:**
  1. **Discoverable:** a visible button or menu entry with a tooltip in plain words (what it does, then the shortcut), and a line in the mode's hint bar.
  2. **Reachable by keyboard:** a shortcut shown in the tooltip, listed in the controls table; and (once it exists) an entry in the command palette.
  3. **Undoable:** one undo step with a clear name ("Extrude", "Delete 12 points"); never an action that cannot be taken back without a confirmation.
  4. **Safe:** nothing is lost silently; a refused action says why in plain words and what to do; heavy actions warn first.
  5. **Sensible defaults and resets:** it works with no settings changed; every changeable value has a reset button (an existing rule) and its default is in `TUNING.md`.
  6. **Consistent:** the same key and the same gesture mean the same thing everywhere (W / E / R move, turn, scale; Escape leaves; Tab changes mode; Shift adds to a selection; Alt picks a whole element); a mode always shows how to leave it.
  7. **Plain words with the professional term:** the label a beginner understands, and the standard term where a professional would look for it ("Loop cut: add a ring of edges"); never jargon alone.
  8. **Fast and forgiving:** no tool freezes the page; long work shows progress; previews while dragging.
  9. **Tested with exact checks** (as for geometry and poses) and with a message for every failure case.
  10. **Precise when needed:** numeric entry, snapping and a way to be exact, even if the default is by eye.
- **Where we are strong, and why it matters to professionals:** non-destructive building (modifier stacks, generators, meshes that are never overwritten), undo everywhere, real-time multiplayer (planned), nothing to install, and clear errors. **Where we must not pretend:** Maya and Blender have decades of tools (animation, simulation, rendering, UVs and texturing, scripting). The aim is the 20% of features that give 80% of the value, done well, plus standard file formats (glTF, FBX, OBJ, USD) so professionals can use SceneRoom next to their usual tools instead of instead of them.
- **Edit mode order (decided with this):** a topology layer first (welded points, edges with neighbours, quads from coplanar triangle pairs), because edge loops, loop cut, bevel, inset, bridge, mirror editing and subdivision all depend on it; then edge selection and edge loops (Alt + click an edge); then loop cut; then the other modelling tools; then selection power tools; then UVs and difference-based undo (see `PLAN.md`, Phase 13, steps 3 to 8).
- **Risks, stated plainly:** (1) scope: this is a very large product and the order of work must keep it usable at every step; (2) loops on triangle meshes are only reliable where quads can be found, so meshes made of arbitrary triangles (some imports, sculpts) will not have loops until a remesh tool exists; (3) friendliness is a design discipline, not a feature: it is checked tool by tool with the list above, and by watching a new person use the app.

## Project structure: projects, scenes and components (2026-11-16)

The owner described the shape of the whole app: **a project, in which many people work; a project holds several scenes** (for example one to create NPCs, one for buildings, one for the environment, and one that puts everything together). Recorded in `PLAN.md` ("Product structure" and Phase 5b).

- **Project, scene, library.** A project owns its members (with roles), its scenes and a shared library. Scenes are independent documents; the library holds what scenes share: model and mesh files (already stored by a fingerprint of their contents, so a file used in five scenes is stored once), saved plants and characters, materials and components. Today's single scene, the file format and autosave are the special case of a project with one scene.
- **How scenes are put together: components with linked instances (decided).** Three ways were weighed. (1) COPY objects from one scene to another: simple, but a later change to the NPC must be repeated by hand everywhere. (2) Make a whole scene an object inside another scene: coarse, and you cannot pick one NPC out of a crowd scene. (3) **Publish any object or group as a component and place linked instances of it** (chosen): what Unity calls prefabs, Maya references and Blender linked libraries, which is what professionals expect. An instance has its own place, turn and size, can be unlinked into a copy, can jump to its source ("Open source") and, later, can override a colour or a pose. Rules that must hold: a scene can never contain itself (checked directly and through other scenes); deleting a component that is in use asks first and says where it is used; the instance must keep rendering if its source scene is not loaded.
- **Why this comes BEFORE the database and multiplayer, and even before more edit tools.** It decides how saving (a project, not a scene), undo (history per scene), assets (a shared pool) and later collaboration (one shared document per scene, plus one for the project) are organised. Built later it would mean changing the store, the file format, autosave, export and all of the tests under the feet of every new feature. Built now it is local-only and cheap. The plan therefore gets a Phase 5b, "Projects and scenes (local first)", with four steps: several scenes with their own history; project files (format version 2; old files open as a one-scene project); components and instances; project-level tools.
- **Per-scene undo, per-project assets.** Each scene keeps its own undo history and selection (switching scenes does not mix them); the file pool is shared; an operation that changes the project (delete a scene, publish a component) is its own undoable step in a project history. The collaboration design follows: one Yjs document per scene so people building different scenes never clash, and a small project document for members, the scene list and the library.
- **Roles.** Owner (everything, including members and deleting the project), editor (edit scenes and the library), commenter (comment only), viewer (look only). Enforced on the server (Phase 6 and later); locally there is one owner.
- **Templates.** A new scene can start from Blank, Characters (grid floor, neutral light, a character), Buildings, Environment (ground, sky, fog set) or Assembly (empty, with the project's components panel open). They are only starting contents.
- **Risks, stated plainly:** (1) linked instances need care for performance (many instances of one component should share geometry: instancing is part of Phase 16's performance work); (2) editing a component while others use it needs the multiplayer rules (who may edit the source) and a "this component changed" notice in scenes that use it; (3) exporting a project to GLB means choosing: one file per scene, or one file for a chosen scene with its instances expanded (both will be offered); (4) the file format changes (version 2), so old files must keep opening: this is tested like the first version change.
- **Not decided yet:** whether instances of the same component should share one loaded geometry on screen from the start (yes, as an optimisation, not a rule); how overrides are stored (a small list of changed properties on the instance); naming of the file type once it holds a whole project (`.sceneroom` stays).

## Modelling gaps added to the plan (2026-11-16)

Compared with how Maya and Blender build characters and complex objects (box modelling, subdivision surfaces, sculpting, retopology, booleans, modifier stacks, node-based generators, curves, scanning), five gaps were added to `PLAN.md`: **subdivision smoothing and Solidify** (Phase 11, step 4), **boolean cleanup** and **recipes** (a simple node system for generators, Phase 12), **retopology helpers** (Phase 13, step 9) and **texture baking and painting** (Phase 13, step 10).

- **Beginner-first rule (owner's request):** these tools must be easy to understand and not cluttered like Maya and Blender. The rule is written in `PLAN.md` (Phase 16): at most three controls at first, plain words with the professional term in brackets, an "Advanced" fold for the rest, a before/after preview or live count, a reset on every value, one hint line, and a tool appears only in the mode where it makes sense. This adds to the 10-point checklist above.
- **Recipes use the same idea as the modifier stack:** a short list of steps first (easy), the same steps as connected boxes later (for branching). No second engine: recipes reuse modifiers and scatter, and are saved as validated data.
- **Order stays:** these come after the topology layer (subdivision, retopology and baking need adjacency or UVs). Nothing here changes Phase 5b.

## 2026-11-16: Phase 5b step 1, a project with several scenes (built)

Not yet tried in a browser; the rules and the store are covered by tests (`project.test.ts`, `projectStore.test.ts`, the repository tests with `fake-indexeddb`). Diagram: `docs/diagrams/projects-and-scenes.svg`.

- **The open scene stays in the scene store; the others are parked.** The scene store (and the 40 or so actions, tools, panels, edit mode and undo that use it) did not change shape. A new `projectStore` holds the list of scenes and, for every scene that is not open, its contents, selection and undo history ("parked"). Switching swaps them with one action (`restoreScene`). Alternatives weighed: a store per scene (every component would have to know which store), or a `scenes` map inside the scene store (every action would need a scene id). Parking touches no existing code, so nothing already working can break.
- **Pure rules in `packages/shared/src/project.ts`:** the `Project` shape (Zod), add, rename, delete (never the last; a neighbour opens), move, unique names ("Town (2)"), limits, and the templates. The store only applies them.
- **Undo is per scene** (each scene has its own history, kept while it is parked, empty after a reload as before). Project-level changes (new, rename, delete, move) are not undoable for now; deleting asks first. A project history comes with the project file work.
- **Saving:** the autosave now writes the whole project as ONE record (`project`) in the browser storage, so scenes can never be out of step with each other. A scene saved before this change (`current`) is read once and becomes a project with one scene; the old record is left in place (never written again) so going back to an older build still finds it. Damaged data is copied to the backup record as before. The model and mesh files were already shared (stored once by fingerprint), so a file used in five scenes is stored once.
- **Switching scenes** ends a drag in progress and leaves edit mode (that mode belongs to an object of the scene being left). **Copy and paste work between scenes**, because the clipboard keeps the objects and the records of their files. A **cut** waiting in the clipboard becomes a copy when the scene changes (cut means "move", which cannot happen between scenes; the original stays in its scene and can be deleted).
- **Templates** are only starting contents: Blank; Characters (a floor and a person); Buildings (a big floor and a block, sky); Environment (a very large green floor, sky, fog); Assembly (floor and sky). Values in `TUNING.md`.
- **Interface:** the project name and one tab per scene in the top bar. Click opens, double-click renames, right-click or the `...` button on the open tab gives Rename, Duplicate, Move left, Move right, Delete scene; the `+` button gives the templates, each with a one-line description. Menus are drawn with `position: fixed` so the scrolling tab strip cannot clip them. A refused action (empty or used name, too many scenes) is explained in the bar over the 3D view.
- **Not done yet (on purpose):** saving as a file, opening a file and GLB export still work on the OPEN scene only (step 2 makes the file a whole project); the project name cannot be renamed; no keyboard shortcut to switch scenes; tabs cannot be dragged to reorder (use Move left / right); no scene thumbnails (step 4).
- **Risk, stated plainly:** each parked scene's undo history keeps its older versions in memory, as the open scene's already did, so a project with many large scenes uses more memory than one scene; mesh data is shared by fingerprint, so the heavy parts are not copied.

## 2026-11-16: Phase 5b step 2, the file is a project (built)

Not yet tried in a browser; the format is covered by tests in `sceneFile.test.ts` (packing, every refusal, several scenes, a file used by two scenes stored once, version 1 files) and `sceneFileActions.test.ts` (saving and opening in a browser-like store). Format details: `docs/SCENE-FILE-FORMAT.md`.

- **One format, version 2, always a project.** The header holds `project` (name, open scene, every scene) instead of `scene`. A file with ONE scene is just a project with one scene, so "Save this scene as a file" needs no second format and a scene file and a project file open the same way. Version 1 files (one scene) still open, as a project with one scene; this is tested with a hand-built version 1 file.
- **Files are shared, so the file is small:** a model or mesh used by five scenes is in the file once (the list of files is by fingerprint, collected over all scenes). Opening checks each file against its fingerprint and against what the scenes say it is, as before. A mesh no object uses is left out of every scene.
- **Open and "Add scenes" are different on purpose.** Open REPLACES the project (it asks if anything is in it, in any scene, and clears every undo history). "Add scenes from a file" (the `+` menu) ADDS the file's scenes next to the existing ones and replaces nothing, so it asks nothing; the scenes get new ids (they cannot clash) and unique names, and it is refused up front, before any file is stored, if the project would pass 50 scenes. Together they are how a scene made in one project reaches another, until the project library and components (step 3) exist.
- **Save is the whole project (Ctrl or Cmd + S).** "Save this scene as a file" is in the scene tab's menu; file names come from the project or scene name and the date (`my-game-2026-11-16.sceneroom`), made safe by `fileSafeName` (letters, digits, dashes).
- **GLB export:** the Export button still exports the OPEN scene; the scene tab's menu has "Export this scene (GLB)" and "Export every scene (GLB)" (one file per scene; a scene that is empty is skipped and named; two scenes whose names make the same file name are numbered). Several downloads at once: the browser may ask once to allow them. One GLB holding every scene was not done: GLB has no scenes-as-tabs, and merging scenes into one file is what the assembly scene with components (step 3) is for.
- **Not done:** the project name still cannot be renamed (it is always "Untitled project", so file names start with that); no project-level undo; a project is still one record in this browser (no list of projects until the backend).

## 2026-11-16: Project-wide assets and prefabs (Phase 5b step 3, first version)

Prompted by the owner: the Assets tab showed 0 in scene 2 while scene 1 had 2 models; imported assets must belong to the whole project; and objects a user builds should become prefabs, usable in other scenes and listed in the Assets tab. Not yet tried in a browser; covered by tests (`prefab.test.ts`, `libraryActions.test.ts`, the file tests).

- **Imported models are project-wide, without moving data.** Each scene still keeps a record of the files IT uses (`scene.assets`), because the clipboard, the file, export and thumbnails already work from it. The Assets tab shows the UNION of every scene's records (`collectProjectModels`; the open scene's wins) and counts use over all scenes (`projectAssetUsage`). Placing a model that the open scene has not used yet adds its record to the scene in the same undo step (`placeModel`). The model's bytes were already shared by fingerprint. Alternative weighed: one project-level list of records that scenes refer to (cleaner on paper, but it would have changed the file, undo, paste and export all at once). **Known limit:** renaming, noting and deleting a model change every scene, but only the open scene gets an undo step for it (the others are changed directly), so Undo can bring back the old name in the open scene only.
- **Prefabs are what the plan called components.** A prefab is stored once in the project (`project.prefabs`, part of the file): an object and everything inside it. Placed copies are **instances** (`node.prefab = { id }` on the top object). The inside of an instance is made of ordinary objects (so rendering, selecting, export, bounds and saving needed no new code), locked, with the link only on the top object. Clicking the inside selects the instance (clicks bubble to the nearest object that can be clicked).
- **Editing a prefab: open it (replaces the first design, which had a "master" object and an Update button).** Double-click the prefab's card in the Assets tab, or press Edit prefab (card or Inspector): the prefab opens as a scene of its own, a tab marked with ◆ (`ProjectScene.prefabId`). Its contents are exactly the prefab; edit it with every normal tool. A moment after each change (300 ms) the prefab is read back from the scene and every copy in every scene is rebuilt, so copies follow live; leaving the tab applies the last change at once, and "Done editing prefab" (tab menu) applies it and closes the tab. A rebuilt copy keeps its id, parent, name, place, turn, size, visibility, lock and order. Why this replaced the master: there is one place where a prefab is changed (the prefab itself), nothing in a scene that can be deleted and strand the prefab, and the copies are always consistent. The editing scene is saved with the project, and applied once after a load, so a change that was not applied before the page closed is not lost. Rules: the top object is the prefab (found by its id); other top-level objects in that scene are NOT part of it (a message says so, once per count); if the top object is deleted, the prefab is left unchanged and the message explains; a copy of a prefab inside a prefab is refused (no cycles). Known limit: undoing in an ordinary scene after a prefab changed can bring back an older look for its copies until the prefab changes again.
- **What the Inspector shows:** a plain object offers Make prefab (the object becomes the first copy, in place, as one undo step); a copy shows only Transform and the Prefab section (Edit prefab, Unlink), since its inside is managed. A duplicate or paste of a copy is still a copy.
- **Deleting:** a prefab can be deleted; its copies become ordinary, editable objects in every scene, and its editing tab closes. A model used inside a prefab cannot be deleted until the prefab is (refused with the prefab's name).
- **Files:** prefabs travel in the project file (`.sceneroom`, still version 2; a project without them loads with none). Files only a prefab uses are packed and checked like any other. "Save this scene as a file" brings the prefabs its objects are linked to; "Add scenes from a file" brings the file's prefabs and keeps the project's own copy when the id is already there.
- **Limits:** a prefab cannot contain another prefab yet (refused with a message, so there are no cycles); 200 prefabs per project; 5000 objects per prefab. Both are in `TUNING.md`.
- **Not done, on purpose:** thumbnails for prefabs (an icon shows), a see-through preview while dragging a prefab (models have one), overrides beyond the transform, search and tags, nested prefabs, and moving "My plants" and saved characters into this library.

## 2026-11-16: Topology layer, edge and face selection, edge loops (Phase 13, steps 3 and 4)

Built on `feature/edge-loops`. Not yet tried in a browser; the logic is covered by tests on hand-made boxes, planes, tubes and fan caps (`topology.test.ts`) and on the editor's own cube, plane, cylinder and sphere (`topologyPrimitives.test.ts`).

- **Derived, never stored.** The mesh stays a plain list of points and triangles (storage, undo, saving, GLB export and every existing tool are unchanged). `buildTopology` works the structure out when it is needed (on a click, about 10 ms for 20 000 triangles); nothing is cached, so it is always right after any edit or while a drag is under way.
- **Vertices, faces, edges.** A vertex is a spot (all the points on it; a cube corner has three). A face is a QUAD, found in two passes. **Pass 1, by the list:** two triangles that are next to each other in the mesh's list and share an edge are a square (this is how every shape, extrusion and tube is built: two triangles in a row per square); they stay a quad however the points are pulled about, unless the fold between them is over 80 degrees. This was added after the first version (shape only: flat within 30 degrees, shared edge the longest side, convex) lost every quad as soon as the owner moved a few points on a cube, so loops and rings stopped working on any mesh that had been edited. **Pass 2, by shape,** for the triangles left over (a mesh whose triangles are in another order): flat within 30 degrees, the shared edge is the longest side of both (the diagonal, not a side of the square), and convex. Anything left is a triangle. Edges are the sides of the faces; the diagonal of a quad is not an edge.
- **Loop and ring, defined properly.** A **loop** runs straight on at every vertex where four quads meet (to the edge that shares no face with the one it came by), follows the border of an open surface, and stops at a triangle, a pole (a vertex with more or fewer than four edges) or a seam. A **ring** goes across quads, edge to opposite edge. (The first version of the plan text described the ring as the loop; `ADVANCED-EDITING.md` is corrected.) A loop cut (next step) goes across a ring.
- **Edges and faces are selected through points.** The selection is still a list of points: selecting an edge selects the two vertices' points; a face, its corners; a loop, every point on it. So move, turn, scale, delete and extrude work unchanged, and nothing about undo or the handle needed to change. An "edge is selected" when both its ends are, and is drawn in the selection colour (also in point mode). Alternative weighed: a separate selection list per mode (cleaner for mixed selections, but every tool would need three code paths).
- **Interaction.** Points / Edges / Faces in the edit bar and on keys 1, 2, 3 (outside edit mode 1 to 5 still add shapes). Edge mode: click the nearest edge (12 px), Alt + click its loop, Shift adds or removes; the bar's Loop and Ring buttons grow the selected edges to their loops or rings (a ring has no click shortcut yet because Ctrl is the box). Face mode: click a face (a quad is one face); Alt + click still selects the whole flat area. In edge and face mode only the selected points have dots, so the wire is not buried in dots.
- **Loop and Ring work from ONE edge and replace the selection.** The first version grew every selected edge to its loop or ring; pressing Loop and then Ring selected the whole cube (the ring of each edge of a loop is the whole surface). Now the edit store remembers the edge that was clicked last (`anchorEdge`, the first point at each end) and the buttons select the loop or ring of that edge, replacing the selection, so Loop then Ring show the two sets for the same edge. If the anchor is no longer selected (the selection was changed another way) a single selected edge is used; with none, or with several and no anchor, a message says what to do. Alt + click sets the anchor too.
- **Telling the person why a loop did not grow.** If Loop or Ring would add nothing (the edge is next to triangles, or at a corner where three edges meet), a message says so and what to try. Loop and Ring are always enabled (a disabled button cannot say why); pressing one switches to edge mode and, with no edge selected, says to click an edge first.
- **The edit bar** was rebuilt after the first browser check: it had been squeezed to half the width of the view (text wrapped and buttons were cut off). It now has a header (what is edited, how many points are selected, Done), a row with three labelled groups (Select: Points / Edges / Faces with their number keys; Grow: Loop, Ring; Change: Extrude, Delete) and a line of plain-words help for the mode that is on.
- **Known limits, stated plainly:** a fan-shaped cap (a cylinder's end) is joined into kites, so its middle can look like a four-spoke point on a small cylinder (4 kites) and a pole on a bigger one; loops stop at poles and say nothing yet (showing where and why a loop stopped is still to do); an irregular mesh (a sculpt, a scan) has few quads, so loops there are short. A mesh with several triangles on one edge (non-manifold) is not joined.
- **What this prepares:** loop cut (a ring gives where to cut), bevel, inset, bridge, mirror editing and subdivision all need exactly this adjacency.

## 2026-11-16: Four-view peek (hold Space), design only

Asked for by the owner. Recorded in `PLAN.md` (Phase 16, "Friendly"); not built. The owner's description: with an object selected, hold Space to see four views at once; three are pinned views of the object's sides, one is the normal 3D view that moves with the mouse; letting go of Space opens the chosen view big; pinned views stay pinned (only the normal view moves).

- **Why it is in the plan, not built now:** it is a change to how the whole 3D view is drawn (several cameras in one canvas), independent of the edit tools that are half-finished (loop cut, edge extrude), and it is worth doing carefully rather than squeezed in. It also needs decisions from the owner (below). Order: loop cut, then the rest of the modelling tools, then this.
- **What it needs technically:** one canvas drawn four times with different cameras and screen rectangles (three.js `scissor` and `viewport`; react-three-fiber's `View` helper from drei is one way); three orthographic cameras (front, right, top: flat, no perspective, so sizes can be compared); the object framed in each; a key-hold overlay (Space is not used by any shortcut yet); picking and the gizmo must use the camera of the view the pointer is in; cost: the scene is drawn four times, so it must stay light (hidden edit overlays, no shadows in the small views).
- **Decided by the owner (2026-11-16):**
  1. **Sides:** Top, Front and Right are the three pinned views shown at first. Left, Back and Bottom (and Perspective) can be chosen from a **drop-down in the top-left corner of every view**, so any tile can show any side.
  2. **Flat (orthographic)** for every side view, so lengths can be compared. Only the normal view has perspective.
  3. **In the big view a pinned side stays pinned:** it cannot be turned and cannot be panned, but it can **zoom**. (It is still possible to select and edit in it. Nothing moves it sideways, so what you see stays centred on the object.)
  4. **The view under the pointer when Space is released** is the one that opens big.
  5. **Getting back (suggested, to be confirmed):** the same drop-down, in the top-left corner of the big view, always lists Perspective (the normal view) first, so one click returns, and it is visible so nobody has to know a shortcut. For people who do know it: hold Space again and release over the Perspective tile. A plain tap of Space does nothing (a tap is easy to do by accident while typing). No other key is taken.
- **Still to settle when it is built:** whether the drop-down also changes the little tiles while Space is held (yes: so Left can replace Right), whether each tile remembers its choice for next time (suggested: yes, per project, not per object), and what the Escape key does in the big view (suggested: nothing special, it keeps its normal job).
- **Technical notes for later:** the three side views are orthographic cameras looking along an axis; they frame the selected object's box with a margin (the same `framingDistance` idea, for a flat camera); zoom changes the camera's size, not its place; pan is switched off by not mapping a mouse button to it. The drop-down is the same component in every view.
- **Easy by default:** it is invisible until Space is held, so it adds nothing to the screen for a beginner, and is a shortcut a professional already knows.

## 2026-11-16: Flying the camera (hold right-click and press W A S D)

Asked for by the owner ("move around the scene using WASD", and swap Move to Q). The owner agreed to the alternative below. Not yet tried in a browser; the movement maths is covered by tests (`fly.test.ts`), the flags by `viewStore.test.ts`; the feel of it needs a hand check.

- **Why not plain WASD and Q for Move.** W, E and R are Move, Rotate and Scale in Unity, Maya and Blender; A is "select all" in edit mode; the other shortcuts (F, X, 1 2 3, Alt + Z) would all need re-checking. Taking W away from Move would clash with every other 3D program the owner or a professional uses.
- **What was built: the Unity and Unreal scene view way.** While the right mouse button is held in the 3D view: **W / S** fly forward and back (along where the camera looks, also up and down), **A / D** slide left and right (level with the ground), **E / Q** go up and down the world, **Ctrl or Cmd** is faster. Speed grows with the distance to what is being looked at (2 to 60 units a second), so flying is slow close up and quick when zoomed out; a stalled frame cannot throw the camera (a step is at most 0.1 s). The keys do nothing else while the button is held (the controller takes them first, and the shortcut handler also ignores them).
- **Turning while flying.** Dragging with the right button still turns the view. Plain right-drag is the usual ORBIT round the object (unchanged). Once a fly key is pressed during the hold, the camera turns ON THE SPOT instead (the point it turns round moves to 5 cm in front of it), as in a game, and letting go puts the orbit point back in front of the camera at the distance it had, so orbiting round an object works again. The camera and the orbit point always move together while flying.
- **Shift is not the fast key** because Shift in the middle of a camera drag already swaps rotate and pan (`CameraModifierSwitch`); Ctrl or Cmd is free in a right-drag.
- **Letting go of the button after flying does not open the right-click menu** (a flag in `viewStore` says a fly key was used during this hold).
- **Known limits:** a trackpad without a right button needs two-finger-click-and-hold; on a laptop the fast key is Cmd on a Mac; the planned four-view peek will have to leave this alone in its pinned flat views.

## 2026-11-16: X-ray in edit mode

Asked for after trying edit mode: hide the lines of faces the camera cannot see, with a toggle for the old see-through look. Not yet tried in a browser; the visibility test is covered by `visibility.test.ts`.

- **X-ray.** The edit overlay (lines and dots) used to be drawn on top of everything, so the far side of a cube showed through. Now it is hidden by the solid by default; an **X-ray** button in the edit bar (and Alt + Z) shows the old see-through look. Hidden lines and points also cannot be CLICKED or BOXED any more unless X-ray is on: a click tries the nearest points (or edges, by their middle) in order and takes the first the camera can see (a ray from the camera to the spot is not blocked by a face in front). A box tests the points inside it, up to 4000 of them (a bigger box takes everything, as with X-ray). Lines lying exactly on the surface would fight with it in the depth buffer, so while X-ray is off the mesh is pushed back a little (`polygonOffset`), and put back when X-ray is turned on or edit mode ends. Faces mode already took the first face under the pointer, so it was already right.
- **Limits:** the visibility test uses the camera's own position, which is right for the perspective view; the flat views of the planned four-view peek will need the test along their direction instead.

## 2026-11-16: Extrude settings in edit mode

Asked for after trying edit mode: "like Maya, more options after extruding". Not yet tried in a browser. Covered by tests (`extrude.test.ts`, `editOperations.test.ts`).

- **Extrude settings panel.** After Extrude, a panel under the edit bar shows **Distance**, **Divisions** (1 to 12 bands along the length), **Scale** (5% to 400%: smaller makes a tapering stalk, bigger a flare) and **Twist** (-360 to 360 degrees), each with a slider, a number box and a reset button. They apply while you change them. The panel stays until anything else is done (the undo history grows), then the extrusion is final.
- **How a change is applied (smooth).** While a slider is dragged the extrusion is only SHOWN: it is made again from the mesh as it was before it (kept in the edit store with the points that were extruded) and the new geometry is put on the object on the screen; nothing is stored, the scene and the undo history are not touched, and only the edit overlay is rebuilt. When the slider is let go (mouse, finger, arrow key, or leaving it), or a number is typed or reset, the result is stored ONCE as a new mesh version in place of the extrusion made before: `replaceNodeMesh(..., amend)` swaps the mesh without a new undo step, so it is still ONE undo step. The first version did the whole thing on every tick (take the undo step back, hash and store a new mesh, rebuild the scene twice), which made the whole scene flicker while dragging. Scale and twist happen round the middle of the faces, across the direction they face, and grow step by step along the divisions, so walls taper and twist evenly. Walls keep their own points (sharp bands) and face outwards at every setting (tested).
- **Why this answers "extrude a cylinder out of the face".** Modellers build columns, legs, horns and branches by extruding, scaling the new end smaller, and extruding again. Scale 50% then Extrude again on the new end does exactly that; the panel says so. A truly ROUND column needs a round face to start from, which needs Inset and Bevel (step 6 of the plan); until then, use a Cylinder shape for round parts.
- **Not done:** extruding edges and points, extruding faces individually (each its own way), and a negative distance (pushing in): the walls would be inside out; Inset is the tool for it.
