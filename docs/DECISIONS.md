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
