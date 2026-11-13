# Things you can tune yourself

A list of settings you can change by editing a number or a colour, and exactly where. Nothing here needs new knowledge:
change the value, save the file, and look at the browser.

## How to try a change

1. Start the app: `pnpm dev` from the repo root, then open http://localhost:3000.
2. Edit the value in the file named below and save.
3. The browser updates by itself (Next.js "Fast Refresh"). If the 3D view looks stuck, reload the page.
4. Happy? Commit it. Not happy? In GitHub Desktop, right-click the file and choose **Discard Changes**, or ask Claude to revert it.

Colours are written as hex codes like `"#5cc4e0"`. Search for "hex color picker" to find one you like.
Numbers in `[x, y, z]` are positions: x is left/right, y is up/down, z is toward/away from you.

## The 3D viewport

All of these live in one file: `apps/web/src/components/viewport/Viewport.tsx`.

### Camera and background

| What              | Setting                                      | Our value   | What it does                                                                                                                                          |
| ----------------- | -------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting position | `<Canvas camera={{ position: [x, y, z] }}>`  | `[5, 4, 7]` | Where the camera starts. Bigger numbers start further away.                                                                                           |
| Field of view     | `<Canvas camera={{ fov }}>`                  | `50`        | How wide the camera sees, in degrees. Smaller zooms in and flattens the view, larger looks wide-angle.                                                |
| Background colour | `<color attach="background" args={["..."]}>` | `"#14191d"` | The colour behind the scene. Keep it equal to the `bg-[#14191d]` in `apps/web/src/app/page.tsx`, so there is no colour flash while the 3D view loads. |

### Camera controls (how dragging feels)

Our mouse mapping (`mouseButtons` in `Viewport.tsx`): **left-drag pans** the camera and **right-drag rotates** it. Holding **Shift**
swaps the two, so Shift + left-drag rotates and Shift + right-drag pans. That swap comes from the library. You can press or release
Shift in the middle of a drag and the camera switches live (`CameraModifierSwitch.tsx`). **Ctrl or Cmd + left-drag draws a selection box**
(see below), not a camera move. Scroll zooms. The middle button does nothing. To go back to the library default (left rotates, right pans, middle zooms), delete the `mouseButtons` line.
The settings below are on `<OrbitControls ... />`.

| Setting         | Our value | Library default | What it does                                                                                          |
| --------------- | --------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `rotateSpeed`   | `1.25`    | `1`             | How far the view turns per mouse movement. Higher is faster.                                          |
| `zoomSpeed`     | not set   | `1`             | Scroll-wheel zoom speed.                                                                              |
| `panSpeed`      | not set   | `1`             | Pan speed.                                                                                            |
| `enableDamping` | `false`   | `false`         | Smoothing. On means the camera keeps gliding after you stop. We first turned it on and it felt laggy. |
| `dampingFactor` | not set   | `0.05`          | Only matters when damping is on. Higher (try `0.2`) means less glide.                                 |
| `minDistance`   | not set   | `0`             | Closest the camera may get to the middle. Try `2` to stop zooming inside objects.                     |
| `maxDistance`   | not set   | `Infinity`      | Furthest the camera may get. Try `60`.                                                                |
| `maxPolarAngle` | not set   | `Math.PI`       | How far the camera may tilt down. `Math.PI / 2` stops it going under the ground.                      |
| `autoRotate`    | not set   | `false`         | Set to `true` to spin the view by itself. `autoRotateSpeed` (default `2`) sets how fast.              |

### Lights

| What                | Setting                        | Our value   | What it does                                                                                          |
| ------------------- | ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------- |
| Fill light          | `<ambientLight intensity>`     | `0.6`       | Light that hits everything equally. Raise it to brighten the sides that face away from the sun light. |
| Sun light strength  | `<directionalLight intensity>` | `1.6`       | How strong the main light is.                                                                         |
| Sun light direction | `<directionalLight position>`  | `[5, 8, 4]` | The light shines from this point toward the middle. Move it to change where the highlight falls.      |

### The scene objects (cube and others)

Objects are no longer written in `Viewport.tsx`. They come from the scene store.

| What                     | Setting                                              | Our value              | What it does                                                                                                  |
| ------------------------ | ---------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Starting object          | `createInitialScene()` in `src/store/sceneStore.ts`  | one cube               | Which objects exist when the page loads.                                                                      |
| New object colour        | `DEFAULT_COLOR` in `packages/shared/src/sceneOps.ts` | `"#5cc4e0"`            | Colour given to every new object.                                                                             |
| New object start spot    | `createNode` in `packages/shared/src/sceneOps.ts`    | position `[0, 0.5, 0]` | `y` is half the height, so a 1-unit object rests on the grid.                                                 |
| Selection outline colour | `OUTLINE_COLOR` in `SceneNodes.tsx`                  | `"#ffb020"`            | Colour of the outline around the selected object.                                                             |
| Selection outline width  | `OUTLINE_THICKNESS` in `SceneNodes.tsx`              | `3`                    | Outline width in screen pixels (the outline is drawn with `screenspace` off, so it does not scale with zoom). |

### Gizmo, snapping and shortcuts

Files: `apps/web/src/components/viewport/SelectionGizmo.tsx` (snap steps), `useEditorShortcuts.ts` (keys), `gizmoGuard.ts`.

| What                | Setting                                                | Our value     | What it does                                                                                                                      |
| ------------------- | ------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Move snap step      | `SNAP.translate`                                       | `0.5`         | Distance in world units that Move jumps by while Snap is on.                                                                      |
| Rotate snap step    | `SNAP.rotateDegrees`                                   | `15`          | Degrees that Rotate jumps by while Snap is on.                                                                                    |
| Scale snap step     | `SNAP.scale`                                           | `0.1`         | Amount that Scale jumps by while Snap is on.                                                                                      |
| Snap on at start    | `snapEnabled` in `sceneStore.ts`                       | `false`       | Whether snapping is on when the page loads. Off = smooth. Toggle with the toolbar button or X; holding Shift flips it while held. |
| Starting gizmo      | `transformMode` in `sceneStore.ts`                     | `"translate"` | Which handles show first.                                                                                                         |
| Shortcut keys       | `MODE_KEYS` in `packages/shared/src/transformTools.ts` | W / E / R     | Move / Rotate / Scale. X toggles snap and Escape clears the selection (in `useEditorShortcuts.ts`).                               |
| Ignore-click window | `IGNORE_EMPTY_CLICK_MS` in `gizmoGuard.ts`             | `300`         | After using a handle, a click on empty space does not clear the selection for this many milliseconds.                             |

### Adding, duplicating and deleting objects

| What              | Setting                                                  | Our value   | What it does                                                                               |
| ----------------- | -------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------ |
| Duplicate offset  | `DUPLICATE_OFFSET` in `src/store/sceneStore.ts`          | `[1, 0, 0]` | How far (x, y, z) a duplicate is placed from the original, so it does not overlap.         |
| Shortcuts         | `useEditorShortcuts.ts`                                  | see below   | Delete or Backspace deletes, Ctrl/Cmd + D duplicates (both only when not typing in a box). |
| Name length limit | `NODE_NAME_MAX_LENGTH` in `packages/shared/src/scene.ts` | `100`       | Longest allowed object name; longer or empty names are rejected.                           |

### Selecting several objects

| What              | Setting                                                               | Our value | What it does                                                                                            |
| ----------------- | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Selection box     | Ctrl (Windows) or Cmd (Mac) + left-drag, in `BoxSelectController.tsx` | -         | Selects every object whose outline touches the box. Hold Shift when you let go to add to the selection. |
| Smallest box      | `MIN_BOX_SIZE_PX` in `BoxSelectController.tsx`                        | `4`       | A drag shorter than this many pixels counts as a click, not a box.                                      |
| Add or remove one | Shift + click on an object (`SceneNodes.tsx`)                         | -         | Adds the object to the selection, or removes it if it was already selected.                             |
| Box colours       | `border-sky-400 bg-sky-400/15` in `BoxSelectOverlay.tsx`              | sky blue  | Outline and fill of the box while you drag.                                                             |

With several objects selected, one gizmo appears in the middle of the group and moves, rotates or scales all of them. The panel shows
only a count and Duplicate / Delete (no per-object details).

### The grid

| Setting            | Our value   | Library default | What it does                                                      |
| ------------------ | ----------- | --------------- | ----------------------------------------------------------------- |
| `cellSize`         | `1`         | `0.5`           | Size of the small squares.                                        |
| `sectionSize`      | `5`         | `1`             | Size of the bigger squares drawn with thicker lines.              |
| `cellColor`        | `"#2c3b44"` | black           | Colour of the small lines.                                        |
| `sectionColor`     | `"#5a6a75"` | black           | Colour of the bigger lines.                                       |
| `cellThickness`    | not set     | `0.5`           | Thickness of the small lines.                                     |
| `sectionThickness` | not set     | `1`             | Thickness of the bigger lines.                                    |
| `fadeDistance`     | `45`        | `100`           | How far from the camera the grid fades out. Smaller fades sooner. |
| `fadeStrength`     | `1.5`       | `1`             | How sharply it fades. Higher means a quicker fade.                |
| `infiniteGrid`     | `true`      | `false`         | `true` makes the grid appear to go on forever.                    |

### The FPS counter

`<Stats />` in `Viewport.tsx` shows frames per second in the corner. Delete that line to hide it. Higher FPS is smoother;
a steady 60 is the usual target on most screens.

## The page around the viewport

| What                      | Where                                                 | What to change                                                                                                                |
| ------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The "SceneRoom" label     | `apps/web/src/app/page.tsx`                           | Its text comes from `APP_NAME` in `packages/shared/src/index.ts`. Position and colour are the Tailwind classes on the `<h1>`. |
| The loading message       | `apps/web/src/components/viewport/ViewportLoader.tsx` | The text inside `loading: () => ...`.                                                                                         |
| Tab title and description | `apps/web/src/app/layout.tsx`                         | The `metadata` object.                                                                                                        |

## Project settings

| What                        | Where                      | What to change                                                                                      |
| --------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| Dev server port             | `apps/web/package.json`    | The `dev` script is `next dev`, which uses port 3000. Add `-p 3100` to use another port.            |
| Code style (quotes, widths) | `.prettierrc.json`         | Empty on purpose, so Prettier's defaults apply. Adding options changes how every file is formatted. |
| Files Prettier skips        | `.prettierignore`          | Add paths you never want formatted.                                                                 |
| Which tasks Turborepo runs  | `turbo.json`               | Task order and what is cached. Change with care: wrong `outputs` can cause stale results.           |
| What CI checks              | `.github/workflows/ci.yml` | The list of steps GitHub runs on every push.                                                        |
| Node version                | `.node-version`            | The Node version the project uses. Also update the notes in `docs/DECISIONS.md` if you change it.   |

## Keeping this file up to date

When a new setting you might want to adjust is added to the project, it goes into this file, with where it lives, our
value and what it does.
