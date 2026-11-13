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

Mouse mapping in this library: left-drag orbits, scroll or middle button zooms, right-drag pans. The settings below are on
`<OrbitControls ... />`.

| Setting         | Our value | Library default | What it does                                                                                          |
| --------------- | --------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `rotateSpeed`   | `1.25`    | `1`             | How far the view turns per mouse movement. Higher is faster.                                          |
| `zoomSpeed`     | not set   | `1`             | Scroll-wheel zoom speed.                                                                              |
| `panSpeed`      | not set   | `1`             | Right-drag pan speed.                                                                                 |
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

### The cube

| What     | Setting                          | Our value     | What it does                                                                      |
| -------- | -------------------------------- | ------------- | --------------------------------------------------------------------------------- |
| Size     | `<boxGeometry args={[w, h, d]}>` | `[1, 1, 1]`   | Width, height, depth. If you change the height, also change the cube's `y` below. |
| Position | `<mesh position={[x, y, z]}>`    | `[0, 0.5, 0]` | `y` is half the height, so the cube rests on the grid instead of sinking into it. |
| Colour   | `<meshStandardMaterial color>`   | `"#5cc4e0"`   | The cube's colour.                                                                |

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
