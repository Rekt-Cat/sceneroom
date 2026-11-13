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
