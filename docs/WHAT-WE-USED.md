# What we used

A running list of every tool, library and concept used in SceneRoom, so it is easy to look up later.
Ask Claude "explain <item>" and it will give the full explanation (what it is, a Unity comparison,
how it works, caveats, why it was chosen, interview questions).

Status column: **verified** = checked against official docs or by running it. Versions are as installed on 2026-11-11.

## Tools on the machine

| Item                    | Version | Purpose                                                         | Used where                                                                                             |
| ----------------------- | ------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Node.js (LTS)           | 24.22.2 | Runs JavaScript outside the browser (dev server, builds, tests) | `.node-version`                                                                                        |
| fnm                     | 1.39.0  | Node version manager; switches Node per project                 | one line in `~/.zshrc`                                                                                 |
| Homebrew                | 7.0.6   | Installs developer tools on macOS                               | machine setup                                                                                          |
| Corepack                | 0.36.0  | Pins the exact pnpm version per project                         | root `package.json` (`packageManager`)                                                                 |
| pnpm                    | 12.18.0 | Package manager and workspace runner                            | whole repo                                                                                             |
| git                     | 2.50.1  | Local version control                                           | `.git/`                                                                                                |
| GitHub + GitHub Desktop | -       | Online copy of the repo; GUI used to publish/push               | `github.com/Rekt-Cat/sceneroom`                                                                        |
| Vercel (Hobby plan)     | free    | Hosts the web app; builds and publishes on every push to `main` | https://sceneroom.vercel.app, Root Directory `apps/web` (set in the Vercel dashboard, not in the repo) |

## Repo and project structure

| Item                 | Purpose                                                           | Used where                 |
| -------------------- | ----------------------------------------------------------------- | -------------------------- |
| Monorepo             | One repo holding several related packages                         | repo root                  |
| pnpm workspaces      | Links packages in the repo to each other                          | `pnpm-workspace.yaml`      |
| Turborepo            | Task runner with dependency order and caching                     | `turbo.json`, root scripts |
| `.gitignore`         | Files git must never record (dependencies, build output, secrets) | root `.gitignore`          |
| `.node-version`      | Pins Node 24 for everyone who clones the repo                     | repo root                  |
| `allowBuilds` (pnpm) | Blocks dependency install scripts unless allowed                  | `pnpm-workspace.yaml`      |

## Libraries and frameworks

| Item                            | Version                    | Purpose                                                  | Used where                         |
| ------------------------------- | -------------------------- | -------------------------------------------------------- | ---------------------------------- |
| Next.js (App Router, Turbopack) | 16.4.6                     | React framework: routing, server rendering, build        | `apps/web`                         |
| React                           | 19.3.0                     | UI components                                            | `apps/web`                         |
| TypeScript                      | 5.9.3                      | Typed JavaScript (v7 not used, see DECISIONS.md)         | all packages                       |
| Tailwind CSS                    | 4.3.3                      | Utility-class styling                                    | `apps/web`                         |
| ESLint (+ eslint-config-next)   | 9.39.5 / 16.4.6            | Finds mistakes in code                                   | `apps/web`                         |
| `@sceneroom/shared`             | 0.0.0                      | Types and constants shared by web app and server         | `packages/shared`                  |
| Prettier                        | 3.9.10                     | Automatic code and Markdown formatting                   | root, `.prettierrc.json`           |
| three (Three.js)                | 0.187.0                    | 3D engine for the browser (WebGL)                        | `apps/web`                         |
| @react-three/fiber              | 9.8.2                      | Write three.js scenes as React components (`<Canvas>`)   | `apps/web/src/components/viewport` |
| @react-three/drei               | 10.7.9                     | Ready-made helpers: Grid, OrbitControls, Stats           | `apps/web/src/components/viewport` |
| @types/three                    | 0.187.0                    | TypeScript types for three                               | `apps/web`                         |
| zod                             | 4.6.7                      | Validates scene data; TypeScript types inferred from it  | `packages/shared/src/scene.ts`     |
| husky                           | 9.1.7                      | Git hooks: runs checks before every push                 | `.husky/pre-push`, root `prepare`  |
| zustand                         | 5.1.0                      | Small state store; holds the scene (single source)       | `apps/web/src/store/sceneStore.ts` |
| vitest                          | 5.1.0                      | Test runner for logic (`pnpm test`)                      | `packages/shared`                  |
| GitHub Actions (CI)             | checkout v7, setup-node v7 | Runs format check, lint, type-check, build on every push | `.github/workflows/ci.yml`         |

## Settings we changed

- Turborepo and Next.js anonymous telemetry turned off (privacy).
- Next.js "Cache Components" turned off (not needed for this app yet).
- Claude Code **hook** (`PostToolUse`, matcher `Write|Edit`) runs Prettier on files Claude edits inside this project; uses `jq` to read the file path. Lives in `.claude/settings.json`. Needs `/hooks` opened once after the file is first created.
- Claude Code **skill** `/update-what-we-used` (`.claude/skills/update-what-we-used/SKILL.md`) updates this file when something new is added. Needs `/reload-skills` once after the folder is first created.
- The 3D viewport is **browser-only**: `Viewport.tsx` is a Client Component (`"use client"`), loaded by `ViewportLoader.tsx` with `next/dynamic` and `ssr: false`. Next.js only allows `ssr: false` inside a Client Component, so `page.tsx` stays a Server Component.
- Diagrams live in `docs/diagrams/` as self-contained HTML with inline SVG (open in any browser). `dev-workflow.html` (how an edit reaches GitHub) and `architecture.html` (the system, one edit between two users, code layout).
- `create-next-app` generated `AGENTS.md` (notes for coding agents; points to the docs bundled in `node_modules/next/dist/docs/`).

- Git **pre-push hook** (`.husky/pre-push`, via Husky): runs `pnpm check-types && pnpm lint && pnpm test && pnpm build` before every `git push`, including from GitHub Desktop, and blocks the push if one fails. Skip once from a terminal with `git push --no-verify`. `pnpm install` switches it on (root `prepare` script). It adds Homebrew and fnm to `PATH` itself because GitHub Desktop does not load your shell profile.
- **Transform gizmo**: drei `TransformControls` (no new library) on the selected object. It moves the three.js object while you drag and writes the transform to the store once on mouse up (one drag = one change, ready for undo). `OrbitControls` has `makeDefault`, so drei pauses orbiting during a drag. Shortcuts: W / E / R mode, X snap, Esc deselect.
- **Resizable panels**: `PanelResizer.tsx` is a drag handle (pointer capture, double-click reset, arrow keys, `role="separator"`) on the inner edge of each side panel. Widths live in `layoutStore.ts`, are limited by pure functions in `packages/shared/src/layout.ts` (`clampPanelWidth`, `maxPanelWidth`, tested), and are remembered in `localStorage`, checked with Zod (`parseSavedLayout`).
- **Dragging values**: the X / Y / Z letters in the Inspector are drag handles (`NumberField.tsx`, `scrub`). A drag is wrapped in `beginEdit` / `previewNodeTransform` / `endEdit` in the store, so it is ONE undo step; Escape cancels and restores the old value.
- **Undo / redo**: history is two stacks of earlier states, kept by pure functions in `packages/shared/src/history.ts` (`recordChange`, `undoStep`, `redoStep`, tested). The store (`sceneStore.ts`) records one step before each scene change (gizmo drag = 1 step); selection, gizmo mode and snapping are not undoable; changes that change nothing record nothing. Buttons in `TopBar.tsx`, keys Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z, Ctrl + Y. Vitest also runs in `apps/web` now (store tests in `src/store/sceneStore.test.ts`).
- **Inspector fields** (`InspectorFields.tsx`, `NumberField.tsx`): Position / Rotation / Scale (X, Y, Z) and a colour hex box with quick swatches, for a single selected object. What you type is checked by pure functions in `packages/shared` (`parseNumberInput`, `editTransform`, `normalizeHexColor`, tested); rotation is typed in degrees and stored in radians. Edits go through the store (`setNodeTransform`, `setNodeColor`), so the gizmo and the fields always agree.
- **Editor shell** (`EditorShell.tsx`): top bar, docked Scene panel (left), 3D view (middle, with `ToolDock` and `ControlsLegend` floating over it), Inspector (right). Colours are Tailwind theme variables in `globals.css` (`bg-ed-panel` and friends); icons are inline SVG in `icons.tsx` (no icon library). `AddMenu.tsx` is a keyboard-friendly pop-up (arrows, Escape, click outside). Layout designed on a Claude design canvas first. Fonts: the existing Geist.
- **Hierarchy panel** (`HierarchyPanel.tsx`, left): the scene as a tree. The tree is built by pure functions in `packages/shared/src/sceneTree.ts` (`buildSceneTree`, `flattenTree`, tested); fold state is UI-only `useState`. Plain Tailwind, no shadcn/ui yet. Hidden objects also stop receiving clicks (`raycast` override in `SceneNodes.tsx`).
- **Multi-select**: the store keeps `selectedIds` (a list). Shift + click toggles one object; Ctrl/Cmd + left-drag draws a box (`BoxSelectController.tsx`) and selects objects whose projected bounding box overlaps it (pure rectangle maths in `packages/shared/src/screenRect.ts`). A pivot object at the group centre carries one `TransformControls`; the pivot's change is applied to every selected object (`MultiSelectionGizmo.tsx`) and written to the store once on mouse up. `meshRegistry.ts` maps node ids to the three.js objects on screen.
- **Object actions**: add / duplicate / delete / rename live in the store and call pure functions in `packages/shared`. Names are checked with Zod (`normalizeNodeName`). UI: `AddToolbar.tsx` (left), `SelectionPanel.tsx` (right, rename/duplicate/delete), shortcuts Delete or Backspace and Ctrl/Cmd + D.
- Scene logic is **pure functions** in `packages/shared/src/sceneOps.ts` (return a new scene, never mutate); the Zustand store only calls them. `pnpm test` runs Vitest through Turborepo and in CI.

## Not used yet (planned): see docs/PLAN or the plan file

Yjs, Hocuspocus, PostgreSQL, Prisma, Docker, Playwright, Auth, Cloudflare R2.
