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

## 2026-11-11: Public GitHub repo under a personal account
GitHub CLI was installed then removed: its login requests broad permissions (including organisation access). Git + GitHub Desktop is used instead.
