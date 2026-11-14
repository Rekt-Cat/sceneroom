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

| What                   | Where                                                                     | Our value                              | What it does                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Scroll bars            | the `*` rule at the end of `globals.css`                                  | thin, thumb `#343d48`, track `#14181d` | Scroll bar width and colour for every panel.                                                                                  |
| Panel and text colours | the `@theme` block in `apps/web/src/app/globals.css`                      | `--color-ed-*`                         | Every editor colour. Use as `bg-ed-panel`, `text-ed-text-2`, `border-ed-line`. Change a value here and it changes everywhere. |
| Selected colour        | `--color-ed-select` in `globals.css`, `OUTLINE_COLOR` in `SceneNodes.tsx` | amber `#ffb020`                        | The highlight in the list. Keep it equal to the outline in 3D so the two read as the same thing.                              |
| Action colour          | `--color-ed-accent` in `globals.css`                                      | indigo `#5667e8`                       | Primary buttons, active tool, focus ring.                                                                                     |
| Axis colours           | `--color-ed-x`, `-y`, `-z` in `globals.css`                               | red, green, blue                       | Reserved for the X, Y, Z axes (used by the Inspector fields when they arrive).                                                |
| Left panel width       | `w-72` in `HierarchyPanel.tsx`                                            | `18rem` (288px)                        | Width of the Scene list. If you change it, also change `left-[300px]` in `Viewport.tsx` (the FPS counter).                    |
| Right panel width      | `w-76` in `InspectorPanel.tsx`                                            | `19rem` (304px)                        | Width of the Inspector.                                                                                                       |
| FPS counter position   | `className` on `<Stats>` in `Viewport.tsx`                                | `top-[60px]! left-[300px]!`            | Pixels from the window corner: panel width + 12 across, top bar (48) + 12 down.                                               |
| Number keys            | `useEditorShortcuts.ts`                                                   | `1` to `5`                             | Add Cube, Sphere, Cylinder, Plane, Cone (same order as the Add menu). `/` focuses the search box.                             |

## Resizable panels and dragging values

| What                     | Setting                                                | Our value                                     | What it does                                                                                                            |
| ------------------------ | ------------------------------------------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Scene panel width        | `LEFT_PANEL_LIMITS` in `packages/shared/src/layout.ts` | min `220`, max `480`, start `288`             | Drag the edge of the panel to resize it. Double-click the edge to go back to the start width.                           |
| Inspector panel width    | `RIGHT_PANEL_LIMITS` in `layout.ts`                    | min `280`, max `520`, start `304`             | Same for the right panel.                                                                                               |
| Smallest 3D view         | `MIN_VIEWPORT_WIDTH` in `layout.ts`                    | `360`                                         | The panels cannot be dragged so wide that the 3D view gets narrower than this.                                          |
| Resize with the keyboard | `KEY_STEP_PX` in `PanelResizer.tsx`                    | `16` (Shift: 4 times that)                    | Focus the edge (Tab) and press the left or right arrow.                                                                 |
| Remembered widths        | `STORAGE_KEY` in `apps/web/src/store/layoutStore.ts`   | `sceneroom.layout.v1`                         | Widths are saved in this browser. Clear that key in the browser tools to forget them.                                   |
| Drag speed of X / Y / Z  | `perPixel` in `ROWS` in `InspectorFields.tsx`          | position `0.02`, rotation `0.5`, scale `0.01` | How much the value changes per pixel when you drag an axis letter. Hold Shift for 10 times more, Alt for 10 times less. |

## Right-click menu, copy / cut / paste and selecting in the list

| What                       | Setting                                                      | Our value                       | What it does                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Right-click or drag        | `CLICK_MOVE_LIMIT_PX` in `ViewportContextMenuController.tsx` | `4` pixels                      | A right-button press that moves more than this is a camera rotate, not a click, so no menu opens.                                                                                                                                                                          |
| Where a copy lands         | `DUPLICATE_OFFSET` in `apps/web/src/store/sceneStore.ts`     | `[1, 0, 0]`                     | A pasted COPY is placed this far from the original; each further paste one more step. A paste of a CUT does not move the objects by this (it only moves them to the new parent).                                                                                           |
| Copy, cut, paste keys      | `useEditorShortcuts.ts`                                      | Ctrl/Cmd + C, X, V; + Shift + V | C copies, X cuts (marks), V pastes INSIDE the single selected object (nothing selected: top level; the selected object is what was copied: beside it), Shift + V pastes BESIDE the selected object. Escape cancels a cut. Not while typing in a box or with text selected. |
| Menu items                 | `items` in `ContextMenu.tsx`                                 | -                               | Cut, Copy, Paste (reads Paste into "name" when it goes inside), Paste beside, Paste at top level, Duplicate, Rename, Hide / Show, Lock / Unlock, Reset transform, Delete. Add or remove a line there.                                                                      |
| Selecting rows in the list | `selectRow` in `HierarchyPanel.tsx`                          | -                               | Click: one row. Shift + click: every row between the last one clicked and this one. Ctrl/Cmd + click: add or remove one row. Ctrl/Cmd + Shift + click: add the range.                                                                                                      |

## Linked scale

| What          | Setting                                              | Our value | What it does                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starts linked | `scaleLinked` in `apps/web/src/store/layoutStore.ts` | `true`    | The link switch next to "Scale" in the Inspector. Linked: changing X, Y or Z scales all three by the same factor, keeping the proportions. Unlinked: only that value changes. Set to `false` to start unlinked. |

The switch is a setting of the screen, not of the object: it stays as you left it when you select another object, and is not saved when the page is reloaded. It affects typing, the arrow keys and dragging an axis letter. The gizmo's own scale handles and the Reset button are not affected.

## Saving in the browser (autosave)

| What                  | Setting                                                          | Our value                      | What it does                                                                                           |
| --------------------- | ---------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Wait before saving    | `AUTOSAVE_DEBOUNCE_MS` in `apps/web/src/persistence/autosave.ts` | `500` ms                       | How long after your last change the scene is written. A drag makes many changes; they become one save. |
| Database name         | `DB_NAME` in `persistence/idb.ts`                                | `sceneroom`                    | The browser database that holds the scene and the imported files. Change it to start with a clean one. |
| Scene and backup keys | `SCENE_KEY`, `BACKUP_KEY` in `persistence/sceneRepository.ts`    | `current`, `unreadable-backup` | Where the scene is stored, and where unreadable saved data is copied before it could be overwritten.   |

To clear everything that is saved (start from the one starting cube): in Chrome open the developer tools (Cmd+Option+I), go to **Application**, then **IndexedDB**, right-click `sceneroom` and choose **Delete database**, then reload.

## Importing models

| What                 | Setting                                                         | Our value                 | What it does                                                                                                                     |
| -------------------- | --------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Largest file         | `MAX_MODEL_BYTES` in `packages/shared/src/assets.ts`            | `50 MB`                   | Bigger files are refused with a message that shows both sizes.                                                                   |
| Most triangles       | `MAX_MODEL_TRIANGLES` in `assets.ts`                            | `500,000`                 | A model with more triangles is refused (the browser would get slow).                                                             |
| Size of a new import | `TARGET_IMPORT_SIZE` in `assets.ts`                             | `4` units                 | A new model is scaled so its longest side is this long, whatever size it came in. Use Scale in the Inspector to change it later. |
| Accepted files       | `importGlbFile` in `apps/web/src/assets/loadModel.ts`           | `.glb` only               | Other formats (glTF with separate files, OBJ) are later steps.                                                                   |
| Thumbnail size       | `THUMBNAIL_SIZE_PX` in `apps/web/src/assets/thumbnail.ts`       | `128` px                  | Size of the picture drawn for each asset (shown at 48 px).                                                                       |
| Thumbnail angle      | `THUMBNAIL_VIEW_DIRECTION` in `thumbnail.ts`                    | `[1, 0.75, 1.2]`          | Which side and how high the camera looks from when the picture is drawn.                                                         |
| Preview opacity      | `PREVIEW_OPACITY` in `AssetPreview.tsx`                         | `0.4`                     | How solid the see-through preview looks while dragging an asset over the 3D view (1 = solid, 0 = invisible).                     |
| Furthest drop        | `groundHit` `maxDistance` in `packages/shared/src/placement.ts` | `200` units               | A drop on the ground further away than this (looking along the horizon) is placed at the middle instead.                         |
| Note length          | `ASSET_NOTE_MAX_LENGTH` in `packages/shared/src/scene.ts`       | `500` characters          | Longest source / licence note on an imported file (Assets panel).                                                                |
| Where it appears     | `createModelNode` in `packages/shared/src/sceneOps.ts`          | the middle, on the ground | The model's origin is the middle of its bottom face (`modelOffset`), at position 0, 0, 0.                                        |

## Reset buttons (the starting values)

Every value you can change in the Inspector has a reset button (the circular arrow) that puts it back to its starting value. It is greyed out when the value is already there, and for locked objects. Each is one undo step.

| Value                                                  | Starting value comes from                                        | Our value                         |
| ------------------------------------------------------ | ---------------------------------------------------------------- | --------------------------------- |
| Position, Rotation, Scale (each row has its own reset) | `IDENTITY_TRANSFORM` in `packages/shared/src/inspectorValues.ts` | `0, 0, 0` / `0, 0, 0` / `1, 1, 1` |
| Colour                                                 | `DEFAULT_COLOR` in `packages/shared/src/scene.ts`                | `#5cc4e0`                         |
| Roughness, Metalness                                   | `DEFAULT_ROUGHNESS`, `DEFAULT_METALNESS` in `scene.ts`           | `0.6`, `0.1`                      |

Not given a reset button on purpose: the name (free text, no starting value), the Parent list (a choice, not a value), and the panel widths (double-click the panel edge to reset them).

## Materials (roughness and metalness)

| What               | Setting                                                               | Our value | What it does                                                                                                       |
| ------------------ | --------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| Starting roughness | `DEFAULT_ROUGHNESS` in `packages/shared/src/scene.ts`                 | `0.6`     | How rough new objects are (0 = smooth and shiny, 1 = matte like chalk). Scenes saved without the value use it too. |
| Starting metalness | `DEFAULT_METALNESS` in `scene.ts`                                     | `0.1`     | How metal new objects look (0 = plastic or wood, 1 = bare metal).                                                  |
| Slider step        | `step` on the range input in `MaterialSlider` (`InspectorFields.tsx`) | `0.01`    | How fine the slider is; also the step of the arrow keys on it.                                                     |

Each slider has a small reset button that puts it back to the starting value above (greyed out when it is already there).

Metal needs something to reflect. Until the environment step adds reflections, high metalness looks dark rather than shiny.

## Surface and shading (glow, opacity, sides, shadows)

All of these live in each object's `material` section (`materialSchema` in `packages/shared/src/scene.ts`) and have a reset button in the Inspector's "Surface" section.

| What                   | Setting                                    | Our value                                               | What it does                                                                                                                                     |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Starting glow colour   | `DEFAULT_EMISSIVE_COLOR` in `scene.ts`     | `#000000`                                               | Black = no glow. Pick another colour and the object glows with it.                                                                               |
| Starting glow strength | `DEFAULT_EMISSIVE_INTENSITY` in `scene.ts` | `1`                                                     | Multiplies the glow colour. Only matters once the glow colour is not black.                                                                      |
| Strongest glow         | `MAX_EMISSIVE_INTENSITY` in `scene.ts`     | `5`                                                     | The right end of the Glow slider.                                                                                                                |
| Starting opacity       | `DEFAULT_OPACITY` in `scene.ts`            | `1`                                                     | 1 = solid, 0 = invisible, in between = see-through. A see-through object stops hiding what is behind it from the depth buffer (no `depthWrite`). |
| Starting switches      | `DEFAULT_MATERIAL` in `scene.ts`           | cast on, receive on, double-sided off, flat shading off | A new plane starts double-sided (`createNode` in `sceneOps.ts`).                                                                                 |
| Built-in sun sharpness | `SHADOW_MAP_SIZE` in `Viewport.tsx`        | `2048`                                                  | Pixels of the shadow picture per side. Higher is sharper and slower.                                                                             |
| Shadow area            | `SHADOW_AREA` in `Viewport.tsx`            | `15` units                                              | Objects further than this from the middle get no shadow (the light sees a square this wide).                                                     |
| Shadow darkness        | `SHADOW_OPACITY` in `Viewport.tsx`         | `0.35`                                                  | How dark shadows are on the ground, 0 to 1.                                                                                                      |
| Ground size            | `GROUND_SIZE` in `Viewport.tsx`            | `200` units                                             | The invisible floor that catches shadows.                                                                                                        |

Not here yet: Reflection strength (needs the environment step) and the angle limit for smooth shading.

## Lights

Lights are objects you add from the Add menu (Directional, Point, Spot). Their starting values and limits live in `packages/shared/src/lights.ts`; each value has a reset button in the Inspector's "Light" section that goes back to the starting value of that kind.

| What                 | Setting                                                    | Our value                                                            | What it does                                                                                                                                                                                     |
| -------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Starting strength    | `DEFAULT_LIGHTS` in `lights.ts`                            | directional `1.5`, point `40`, spot `80`                             | How strong a new light is. Bulbs and torches fade with distance, so they need far bigger numbers than sunlight.                                                                                  |
| Strongest strength   | `MAX_LIGHT_INTENSITY` in `lights.ts`                       | `10` / `300` / `600`                                                 | The right end of the Strength slider, per kind.                                                                                                                                                  |
| Starting cone        | `DEFAULT_LIGHTS.spot` in `lights.ts`                       | angle `40` degrees, softness `0.3`                                   | Half the width of a spot light's beam, and how soft its edge is.                                                                                                                                 |
| Starting range       | `DEFAULT_LIGHTS` in `lights.ts`                            | `0` (no limit)                                                       | How far a point or spot light reaches. 0 means it fades out naturally and never stops.                                                                                                           |
| Shadows on at start  | `DEFAULT_LIGHTS` in `lights.ts`                            | directional on, spot on, point off                                   | A point light needs six shadow pictures, so it starts without shadows.                                                                                                                           |
| Where new lights go  | `LIGHT_POSITIONS` in `lights.ts`                           | sun `[4, 6, 3]`, bulb `[0, 3, 0]`, torch `[0, 4, 2]`                 | New lights are aimed at the middle of the scene (`aimRotation`).                                                                                                                                 |
| Longest range slider | `MAX_RANGE` in `LightSection.tsx`                          | `100` units                                                          | The right end of the Range slider.                                                                                                                                                               |
| Shadow quality       | `SHADOW_QUALITY` in `LightObject.tsx`                      | sun `2048` / spot `2048` / point `1024` px; softness `3` / `3` / `2` | Per kind: sharpness (pixels per side), `bias` and `normalBias` (cure stripes on a surface that shadows itself; too big and shadows float away from objects) and `radius` (how soft the edge is). |
| Sun shadow area      | `SUN_SHADOW_AREA`, `SUN_DISTANCE` in `LightObject.tsx`     | `15` units, `30` units                                               | A directional light shadows objects within 15 units of the middle of the scene, however its marker is moved (the shadow picture is taken from 30 units behind the middle).                       |
| Shadow reach         | `SHADOW_NEAR`, `SHADOW_FAR_UNLIMITED` in `LightObject.tsx` | `0.3`, `80` units                                                    | How close and how far a point or spot light draws shadows (its Range, if set, is used instead of the far number).                                                                                |
| Marker size          | `MARKER_RADIUS`, `GUIDE_LENGTH` in `LightObject.tsx`       | `0.18`, `1.2` units                                                  | The size of the ball that marks a light, and of the arrow (directional) or beam cone (spot).                                                                                                     |

The always-on sun and soft light in `Viewport.tsx` are still there, so a scene is never dark. They become settings in the environment step.

## Scene settings (background, reflections, fog, base lighting)

Shown in the right panel when nothing is selected. The starting values are `environmentSchema` in `packages/shared/src/scene.ts` (the defaults of each field); every value has a reset button back to them.

| What                | Setting (in `environmentSchema`)              | Our value                       | What it does                                                                                                      |
| ------------------- | --------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Background          | `backgroundMode`, `backgroundColor`           | colour `#14191d`                | A flat colour, or "Sky" (a gradient from top, through the horizon, to the ground).                                |
| Sky colours         | `skyTop`, `skyHorizon`, `skyGround`           | `#3f6fb5`, `#bcd6ea`, `#3a3f45` | The three colours of the sky. The reflections can use the same sky.                                               |
| Reflections         | `reflections`                                 | `studio`                        | What shiny surfaces reflect: off, a generated studio room (no download), or the sky.                              |
| Reflection strength | `reflectionStrength` (scene)                  | `0.6`                           | How strong the reflected light is. Each object also has its own Reflect slider in Surface, which multiplies this. |
| Fog                 | `fogEnabled`, `fogColor`, `fogNear`, `fogFar` | off, `#14191d`, `10`, `60`      | Things fade into the fog colour between the near and far distance (in units from the camera).                     |
| Ambient light       | `ambientIntensity`                            | `0.6`                           | The soft light that comes from everywhere.                                                                        |
| Built-in sun        | `sunEnabled`, `sunIntensity`                  | on, `1.6`                       | The always-on sun. It stops casting shadows once the scene has a light of its own.                                |
| Sun direction       | `sunAzimuth`, `sunElevation`                  | `51`, `51` degrees              | Compass direction and height of the sun. `51`, `51` is where the old fixed sun stood.                             |
| Object reflection   | `MAX_REFLECTION_STRENGTH` in `scene.ts`       | `3`                             | The right end of an object's Reflect slider (default 1).                                                          |
| Studio softness     | `STUDIO_BLUR` in `SceneEnvironment.tsx`       | `0.04`                          | How blurred the studio reflections are (0 sharp, 1 very soft).                                                    |
| Sky picture size    | `SKY_PICTURE_SIZE` in `SceneEnvironment.tsx`  | `8 x 256` pixels                | The strip the sky gradient is drawn on. It is smooth, so a thin strip is enough.                                  |
| Sun distance        | `SUN_DISTANCE` in `environment.ts`            | `12` units                      | How far from the middle the built-in sun stands (only its direction matters for the light).                       |

## Shape: segments and modifiers (bend, twist, taper)

In the Inspector's "Shape" section for the built-in shapes. Each value has its own reset button. The maths is in `packages/shared/src/modifiers.ts`.

| What                   | Setting                                                                        | Our value                        | What it does                                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Segments               | `segments` (default `1`), `MAX_SEGMENTS` in `scene.ts`                         | `1`, up to `32`                  | How many pieces a straight side of a shape is cut into. More pieces let a bend or twist curve smoothly; too many slows the editor. Not used by a sphere.                                                                                                |
| Most modifiers         | `MAX_MODIFIERS` in `scene.ts`                                                  | `8`                              | How long an object's list of modifiers can be.                                                                                                                                                                                                          |
| Bend starting angle    | `createModifier` in `modifiers.ts`                                             | `45` degrees, range `-360..360`  | How far the shape curves from end to end. Negative bends the other way.                                                                                                                                                                                 |
| Twist starting angle   | `createModifier` in `modifiers.ts`                                             | `90` degrees, range `-720..720`  | How far the far end is turned compared with the near end (the middle stays). Follows the right-hand rule about the axis, like rotation.                                                                                                                 |
| Taper starting amount  | `createModifier` in `modifiers.ts`                                             | `0.5`, range `-1..1`             | How much thinner the far end gets: 0 no change, 1 a point, below 0 wider.                                                                                                                                                                               |
| Starting axis          | `createModifier` in `modifiers.ts`                                             | `y` (up)                         | The direction of the shape the modifier works along. Bend curves towards the next direction (x, y, z, x, ...).                                                                                                                                          |
| Stretch factor         | `createModifier` in `modifiers.ts`, `MIN_STRETCH`, `MAX_STRETCH` in `scene.ts` | `1.5`, range `0.1..5`            | How much longer (above 1) or shorter (below 1) the shape gets along the axis. "Keep volume" makes the other two directions thinner as it gets longer.                                                                                                   |
| Noise strength         | `createModifier` in `modifiers.ts`                                             | `0.1`, range `0..1`              | How far points are pushed, as a fraction of the size of the shape.                                                                                                                                                                                      |
| Noise scale            | `createModifier` in `modifiers.ts`                                             | `2`, range `0.1..10`             | How many bumps fit across the shape. Higher is finer and busier.                                                                                                                                                                                        |
| Noise seed             | `createModifier` in `modifiers.ts`                                             | `1`, range `0..9999`             | A different number gives a different, repeatable pattern.                                                                                                                                                                                               |
| Mirror axis and offset | `createModifier` in `modifiers.ts`, `MAX_MIRROR_OFFSET` in `scene.ts`          | `x`, offset `0.5`, range `-3..3` | Which direction the flipped copy goes, and where the mirror plane stands: this many shape-lengths from the object's origin. 0 = through the origin (a centred shape lands on itself); 0.5 = at the side of a centred shape, so the copy sits beside it. |
| Array count, spacing   | `createModifier`, `MAX_ARRAY_COUNT`, `MAX_ARRAY_SPACING` in `scene.ts`         | `3`, `1.2`; up to `20`, `5`      | How many copies in a row (the original included) and the gap, as a multiple of the shape's length (1 = touching, 0 = on top of each other).                                                                                                             |
| Most points            | `MAX_DEFORMED_POINTS` in `modifiers.ts`                                        | `400000`                         | Mirror and array are skipped if they would make a shape with more points than this (keeps the editor from freezing).                                                                                                                                    |
| Round shape detail     | `ROUND_SEGMENTS` in `apps/web/src/components/viewport/shapeGeometry.ts`        | `32`                             | Pieces around a sphere, cylinder and cone (they are not controlled by Segments).                                                                                                                                                                        |

## Saving and opening scene files

Details of the file: `docs/SCENE-FILE-FORMAT.md`.

| What           | Setting                                                      | Our value                    | What it does                                                            |
| -------------- | ------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| Largest file   | `MAX_SCENE_FILE_BYTES` in `packages/shared/src/sceneFile.ts` | `250 MB`                     | A bigger file is refused before it is read into memory.                 |
| File extension | `SCENE_FILE_EXTENSION` in `sceneFile.ts`                     | `.sceneroom`                 | What Save writes and what Open and drag-and-drop look for.              |
| File name      | `sceneFileName` in `sceneFile.ts`                            | `scene-YYYY-MM-DD.sceneroom` | The name Save suggests (from today's date).                             |
| Save shortcut  | `useEditorShortcuts.ts`                                      | Ctrl or Cmd + S              | Saves the scene as a file (instead of the browser saving the web page). |
| Format version | `SCENE_FILE_VERSION` in `sceneFile.ts`                       | `1`                          | Raised only when the layout of the file changes.                        |

## Exporting a GLB

| What            | Setting                                             | Our value              | What it does                                                                                                       |
| --------------- | --------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------ |
| File name       | `glbFileName` in `apps/web/src/export/exportGlb.ts` | `scene-YYYY-MM-DD.glb` | The name the download suggests.                                                                                    |
| Transform style | `trs` in `sceneToGlb`                               | `true`                 | Each object is written with position, rotation and scale (easier to read in other programs) instead of one matrix. |
| Hidden objects  | `onlyVisible` in `sceneToGlb`                       | `true`                 | Hidden objects are left out. Set to `false` to export them too.                                                    |
| Light decay     | `buildObject` in `export/buildExportScene.ts`       | `2`                    | How fast point and spot lights fade with distance (the physical value, as in the editor).                          |

## Locking objects

| What               | Setting                                                                                              | Our value | What it does                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lock shortcut      | `useEditorShortcuts.ts`                                                                              | `L`       | Locks the selected objects, or unlocks them if all of them are already locked.                                                                        |
| Lock buttons       | `HierarchyPanel.tsx`, `InspectorPanel.tsx`                                                           | -         | The padlock on a row of the scene list (shown on hover, always shown when locked) and the padlock in the Inspector.                                   |
| What a lock blocks | `isEffectivelyLocked` / `editableIds` in `packages/shared/src/sceneTree.ts`, used by `sceneStore.ts` | -         | Move, rotate, scale, rename, recolour, delete, re-parent, and putting things inside it. Hide, Show, Duplicate and selecting from the list still work. |

## Putting things in order (drag in the scene list)

| What               | Setting                                       | Our value | What it does                                                                                                                                                                                                        |
| ------------------ | --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Edge of a row      | `EDGE_ZONE_FRACTION` in `useRowDrag.ts`       | `0.25`    | While dragging, the top quarter of a row means "just before it", the bottom quarter "just after it" (on an open parent: as its first child, right under it), and the middle "inside it". Raise it for bigger edges. |
| Auto-scroll edge   | `AUTO_SCROLL_EDGE_PX` in `useRowDrag.ts`      | `48`      | While dragging, the list scrolls by itself when the pointer is this close (px) to its top or bottom edge.                                                                                                           |
| Auto-scroll speed  | `AUTO_SCROLL_MAX_SPEED_PX` in `useRowDrag.ts` | `18`      | Fastest scroll, in pixels per frame, reached at the very edge (slower the further from the edge).                                                                                                                   |
| Drop line indent   | `DROP_LINE_INSET_PX` in `HierarchyPanel.tsx`  | `22`      | Where the blue line that shows the drop place starts, from the row's left edge.                                                                                                                                     |
| Move up, Move down | `items` in `ContextMenu.tsx`                  | -         | Right-click an object: one place up or down among the objects in the same parent.                                                                                                                                   |

## Parents and children

| What                | Setting                                               | Our value                                    | What it does                                                                                                                                                                           |
| ------------------- | ----------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag start distance | `DRAG_START_DISTANCE_PX` in `useRowDrag.ts`           | `5`                                          | How far (pixels) the mouse must move on a row before it counts as a drag and not a click.                                                                                              |
| Space between rows  | `py-0.5` on each row's `<li>` in `HierarchyPanel.tsx` | `0.125rem` top and bottom (4px between rows) | The space between rows in the scene list. It is padding that belongs to the row, so dropping in it still counts as dropping on that row. Try `py-px` for tighter or `py-1` for airier. |
| Row indent          | `INDENT_PX` in `HierarchyPanel.tsx`                   | `14`                                         | Space per level of nesting in the scene list.                                                                                                                                          |

## Undo and redo

| What             | Setting                                             | Our value                                    | What it does                                                                         |
| ---------------- | --------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Steps remembered | `HISTORY_LIMIT` in `packages/shared/src/history.ts` | `100`                                        | How many changes Undo can go back. Older ones are forgotten.                         |
| Shortcuts        | `useEditorShortcuts.ts`                             | Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z, Ctrl + Y | Undo and redo. Not active while typing in a box, where the browser's own undo works. |

## Inspector fields

Files: `apps/web/src/components/viewport/InspectorFields.tsx` (rows, steps, colours) and `packages/shared/src/inspectorValues.ts` (limits).

| What                 | Setting                                      | Our value                                 | What it does                                                                                                                                                      |
| -------------------- | -------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arrow-key step       | `step` in `ROWS`                             | position `0.1`, rotation `5`, scale `0.1` | How much one Up or Down press changes a value. Shift makes it 10 times bigger.                                                                                    |
| Decimals shown       | `decimals` in `ROWS`                         | position `2`, rotation `1`, scale `2`     | How many digits after the point a field shows.                                                                                                                    |
| Largest typed number | `MAX_ABS_VALUE` in `inspectorValues.ts`      | `100000`                                  | Bigger numbers (positive or negative) are refused.                                                                                                                |
| Reset buttons        | `IDENTITY_TRANSFORM` in `inspectorValues.ts` | position 0, rotation 0, scale 1           | What the reset button of each row (Position, Rotation, Scale) sets that row to. Note the origin is the ground level, so a reset cube sinks halfway into the grid. |
| Quick colours        | `QUICK_COLORS` in `InspectorFields.tsx`      | 7 colours                                 | The round colour buttons under the hex box. Add, remove or change a `{ name, hex }` line.                                                                         |

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
