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

| What              | Setting                                      | Our value   | What it does                                                                                                                                                                 |
| ----------------- | -------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting position | `<Canvas camera={{ position: [x, y, z] }}>`  | `[5, 4, 7]` | Where the camera starts. Bigger numbers start further away.                                                                                                                  |
| Field of view     | `<Canvas camera={{ fov }}>`                  | `50`        | How wide the camera sees, in degrees. Smaller zooms in and flattens the view, larger looks wide-angle.                                                                       |
| Background colour | `<color attach="background" args={["..."]}>` | `"#14191d"` | The colour behind the scene. Keep it equal to the `bg-[#14191d]` in `apps/web/src/components/viewport/EditorShell.tsx`, so there is no colour flash while the 3D view loads. |

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

## Editor look (panels, colours, sizes)

| What                   | Where                                                                     | Our value                   | What it does                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Panel and text colours | the `@theme` block in `apps/web/src/app/globals.css`                      | `--color-ed-*`              | Every editor colour. Use as `bg-ed-panel`, `text-ed-text-2`, `border-ed-line`. Change a value here and it changes everywhere. |
| Selected colour        | `--color-ed-select` in `globals.css`, `OUTLINE_COLOR` in `SceneNodes.tsx` | amber `#ffb020`             | The highlight in the list. Keep it equal to the outline in 3D so the two read as the same thing.                              |
| Action colour          | `--color-ed-accent` in `globals.css`                                      | indigo `#5667e8`            | Primary buttons, active tool, focus ring.                                                                                     |
| Axis colours           | `--color-ed-x`, `-y`, `-z` in `globals.css`                               | red, green, blue            | Reserved for the X, Y, Z axes (used by the Inspector fields when they arrive).                                                |
| Left panel width       | `w-72` in `HierarchyPanel.tsx`                                            | `18rem` (288px)             | Width of the Scene list. If you change it, also change `left-[300px]` in `Viewport.tsx` (the FPS counter).                    |
| Right panel width      | `w-76` in `InspectorPanel.tsx`                                            | `19rem` (304px)             | Width of the Inspector.                                                                                                       |
| FPS counter position   | `className` on `<Stats>` in `Viewport.tsx`                                | `top-[60px]! left-[300px]!` | Pixels from the window corner: panel width + 12 across, top bar (48) + 12 down.                                               |
| Number keys            | `useEditorShortcuts.ts`                                                   | `1` to `5`                  | Add Cube, Sphere, Cylinder, Plane, Cone (same order as the Add menu). `/` focuses the search box.                             |

## Resizable panels and dragging values

| What                     | Setting                                                | Our value                                     | What it does                                                                                                            |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Scene panel width        | `LEFT_PANEL_LIMITS` in `packages/shared/src/layout.ts` | min `220`, max `480`, start `288`             | Drag the edge of the panel to resize it. Double-click the edge to go back to the start width.                           |
| Inspector panel width    | `RIGHT_PANEL_LIMITS` in `layout.ts`                    | min `260`, max `520`, start `304`             | Same for the right panel.                                                                                               |
| Smallest 3D view         | `MIN_VIEWPORT_WIDTH` in `layout.ts`                    | `360`                                         | The panels cannot be dragged so wide that the 3D view gets narrower than this.                                          |
| Resize with the keyboard | `KEY_STEP_PX` in `PanelResizer.tsx`                    | `16` (Shift: 4 times that)                    | Focus the edge (Tab) and press the left or right arrow.                                                                 |
| Remembered widths        | `STORAGE_KEY` in `apps/web/src/store/layoutStore.ts`   | `sceneroom.layout.v1`                         | Widths are saved in this browser. Clear that key in the browser tools to forget them.                                   |
| Drag speed of X / Y / Z  | `perPixel` in `ROWS` in `InspectorFields.tsx`          | position `0.02`, rotation `0.5`, scale `0.01` | How much the value changes per pixel when you drag an axis letter. Hold Shift for 10 times more, Alt for 10 times less. |

## Reset buttons (the starting values)

Every value you can change in the Inspector has a reset button (the circular arrow) that puts it back to its starting value. It is greyed out when the value is already there, and for locked objects. Each is one undo step.

| Value                     | Starting value comes from                                        | Our value                         |
| ------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| Position, Rotation, Scale | `IDENTITY_TRANSFORM` in `packages/shared/src/inspectorValues.ts` | `0, 0, 0` / `0, 0, 0` / `1, 1, 1` |
| Colour                    | `DEFAULT_COLOR` in `packages/shared/src/scene.ts`                | `#5cc4e0`                         |
| Roughness, Metalness      | `DEFAULT_ROUGHNESS`, `DEFAULT_METALNESS` in `scene.ts`           | `0.6`, `0.1`                      |

Not given a reset button on purpose: the name (free text, no starting value), the Parent list (a choice, not a value), and the panel widths (double-click the panel edge to reset them).

## Materials (roughness and metalness)

| What               | Setting                                                               | Our value | What it does                                                                                                       |
| ------------------ | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| Starting roughness | `DEFAULT_ROUGHNESS` in `packages/shared/src/scene.ts`                 | `0.6`     | How rough new objects are (0 = smooth and shiny, 1 = matte like chalk). Scenes saved without the value use it too. |
| Starting metalness | `DEFAULT_METALNESS` in `scene.ts`                                     | `0.1`     | How metal new objects look (0 = plastic or wood, 1 = bare metal).                                                  |
| Slider step        | `step` on the range input in `MaterialSlider` (`InspectorFields.tsx`) | `0.01`    | How fine the slider is; also the step of the arrow keys on it.                                                     |

Each slider has a small reset button that puts it back to the starting value above (greyed out when it is already there).

Metal needs something to reflect. Until the environment step adds reflections, high metalness looks dark rather than shiny.

## Locking objects

| What               | Setting                                                                                              | Our value | What it does                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lock shortcut      | `useEditorShortcuts.ts`                                                                              | `L`       | Locks the selected objects, or unlocks them if all of them are already locked.                                                                        |
| Lock buttons       | `HierarchyPanel.tsx`, `InspectorPanel.tsx`                                                           | -         | The padlock on a row of the scene list (shown on hover, always shown when locked) and the padlock in the Inspector.                                   |
| What a lock blocks | `isEffectivelyLocked` / `editableIds` in `packages/shared/src/sceneTree.ts`, used by `sceneStore.ts` | -         | Move, rotate, scale, rename, recolour, delete, re-parent, and putting things inside it. Hide, Show, Duplicate and selecting from the list still work. |

## Parents and children

| What                | Setting                                     | Our value | What it does                                                                              |
| ------------------- | ------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| Drag start distance | `DRAG_START_DISTANCE_PX` in `useRowDrag.ts` | `5`       | How far (pixels) the mouse must move on a row before it counts as a drag and not a click. |
| Row indent          | `INDENT_PX` in `HierarchyPanel.tsx`         | `14`      | Space per level of nesting in the scene list.                                             |

## Undo and redo

| What             | Setting                                             | Our value                                    | What it does                                                                         |
| ---------------- | --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Steps remembered | `HISTORY_LIMIT` in `packages/shared/src/history.ts` | `100`                                        | How many changes Undo can go back. Older ones are forgotten.                         |
| Shortcuts        | `useEditorShortcuts.ts`                             | Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z, Ctrl + Y | Undo and redo. Not active while typing in a box, where the browser's own undo works. |

## Inspector fields

Files: `apps/web/src/components/viewport/InspectorFields.tsx` (rows, steps, colours) and `packages/shared/src/inspectorValues.ts` (limits).

| What                 | Setting                                      | Our value                                 | What it does                                                                                                  |
| -------------------- | -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Arrow-key step       | `step` in `ROWS`                             | position `0.1`, rotation `5`, scale `0.1` | How much one Up or Down press changes a value. Shift makes it 10 times bigger.                                |
| Decimals shown       | `decimals` in `ROWS`                         | position `2`, rotation `1`, scale `2`     | How many digits after the point a field shows.                                                                |
| Largest typed number | `MAX_ABS_VALUE` in `inspectorValues.ts`      | `100000`                                  | Bigger numbers (positive or negative) are refused.                                                            |
| Reset button         | `IDENTITY_TRANSFORM` in `inspectorValues.ts` | position 0, rotation 0, scale 1           | What the Reset button sets. Note the origin is the ground level, so a reset cube sinks halfway into the grid. |
| Quick colours        | `QUICK_COLORS` in `InspectorFields.tsx`      | 7 colours                                 | The round colour buttons under the hex box. Add, remove or change a `{ name, hex }` line.                     |

## The page around the viewport

| What                          | Where                                                 | What to change                                                                                                     |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The "SceneRoom" name and logo | `apps/web/src/components/viewport/TopBar.tsx`         | The name comes from `APP_NAME` in `packages/shared/src/index.ts`. The "Untitled scene" text is plain text for now. |
| The loading message           | `apps/web/src/components/viewport/ViewportLoader.tsx` | The text inside `loading: () => ...`.                                                                              |
| Tab title and description     | `apps/web/src/app/layout.tsx`                         | The `metadata` object.                                                                                             |

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

## Colour choices

| What            | Setting                                                                       | Our value | What it does                                                                                                           |
| --------------- | ----------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------- |
| Colour picker   | the swatch left of the hex box (`AppearanceSection` in `InspectorFields.tsx`) | -         | Click it to choose any colour. It uses the browser's own chooser, so it looks different in Chrome, Safari and Firefox. |
| Quick colours   | `QUICK_COLORS` in `InspectorFields.tsx`                                       | 7 colours | The round buttons below the hex box. Add, remove or change a `{ name, hex }` line.                                     |
| Starting colour | `DEFAULT_COLOR` in `packages/shared/src/scene.ts`                             | `#5cc4e0` | What a new object gets, and what the colour reset button goes back to.                                                 |
