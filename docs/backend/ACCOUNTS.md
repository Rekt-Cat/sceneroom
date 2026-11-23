# Accounts, members and the database (step M8 of the online part)

Status: **designed 2026-11-23, not built yet.** Waiting for two things only the owner can do: install Docker Desktop and
register a GitHub OAuth app (`docs/dev/SETUP-ACCOUNTS.md`). Context: `COLLABORATION.md` (sections 9 to 11). Diagram:
`docs/diagrams/backend/accounts.svg`.

## 1. What this step adds, in plain words

Today (stage A) "who may open a project" is "whoever has the link", and the first person to share is the owner by holding a
secret key in their browser. This step (stage B) makes it real:

- **People have accounts** (sign in with GitHub). A project has **members**, each with a **role**.
- **A dashboard** lists the projects you belong to.
- **Invitations** replace anonymous links: you invite someone for a role, they sign in, and they are a member.
- **A real database (Postgres)** holds users, projects, members and invitations, and later the saved documents.
- **The collab server still only checks a signed token.** What changes is who hands out the tokens: the web app does, after
  checking the signed-in user's membership. The collab server and the editor's sync code stay as they are.

Local-first stays true: with no `DATABASE_URL` configured the app runs exactly as today (local projects, stage A links).
Accounts are an extra, not a requirement.

## 2. The tools, and why (versions looked up 2026-11-23)

| Need              | Choice                                                      | Why, in short                                                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database          | **PostgreSQL 17** in Docker (`postgres:17-alpine`)          | The plan's choice (`DECISIONS.md`): relational data with roles and invitations, free to run locally, same engine as the hosted one (Neon, step M9). The tag exists and was updated on 2026-11-21.                                                                                                       |
| Talking to it     | **Prisma 7.10.1** with `@prisma/adapter-pg` and `pg` 8.23.1 | Typed queries and migrations. The `latest` tag of the `prisma` CLI is an 8.0 release candidate, so the stable 7.10.1 line is used (as `DECISIONS.md` already said); `@prisma/client` `latest` is 7.10.1. Prisma 7 needs a driver adapter and reads the database address from `prisma.config.ts`.        |
| Login             | **Better Auth 1.7.27** with the GitHub provider             | Auth.js (NextAuth) v5 is still a beta after three years and the Auth.js project now says it is part of Better Auth and points new projects there. Better Auth supports Next.js 16 and Prisma 7 (its peer ranges include them), keeps users and sessions in our own database, and has a GitHub provider. |
| Shared token code | A small server-only package (`packages/link-token`)         | The web app now signs tokens too, so the code in `apps/collab-server/src/linkToken.ts` moves to one place both import. It uses `node:crypto`, so it must not go into `packages/shared` (that is bundled for the browser).                                                                               |

**Verified:** package versions (npm registry), the Postgres image tag (Docker Hub), Prisma 7's adapter requirement and
`prisma.config.ts` (Prisma docs), Better Auth's Next.js route handler, Prisma adapter and GitHub provider options (docs
snippets), Better Auth's peer ranges (npm). **Not verified yet** (checked when building, against the installed versions):
the exact CLI command and generated tables of Better Auth, how Better Auth's session is read in a Next.js 16 server
route (`proxy.ts` replaces `middleware.ts` in Next 16), and the generator `output` setting for Prisma 7's client.

## 3. Data (Postgres, through Prisma)

```
Better Auth (made by its own CLI, so they match the installed version)
  user          id, name, email, image, ...
  account       one per sign-in method of a user (GitHub), ...
  session       the logged-in browsers
  verification  short-lived checks

Ours
  Project       id (the same id as the local project, a UUID), name, createdAt, ownerId -> user
  ProjectMember projectId + userId (together unique), role: owner | editor | commenter | viewer, addedAt
  Invitation    id, projectId, role, tokenHash (a hash, never the token), expiresAt, createdBy, acceptedBy?, revokedAt?
```

- The owner is also a `ProjectMember` with role `owner` (one place to ask "what may this person do").
- Only a **hash** of an invitation token is stored, like the owner key in stage A.
- **Scene data stays in the collab server's documents**, not in these tables. Postgres holds who may open the project, not
  what is in it (until step M8f moves the saved document bytes here too).

## 4. Roles

| Role      | Sees the project | Edits scenes             | Invites and removes members | Deletes the project |
| --------- | ---------------- | ------------------------ | --------------------------- | ------------------- |
| owner     | yes              | yes                      | yes                         | yes                 |
| editor    | yes              | yes                      | no                          | no                  |
| commenter | yes              | no (comments come later) | no                          | no                  |
| viewer    | yes              | no                       | no                          | no                  |

The collab server knows two kinds of connection: read-write and read-only. `owner` and `editor` get read-write;
`commenter` and `viewer` get read-only. The distinction between viewer and commenter starts to matter when comments exist.

## 5. How a person gets into a project (the flows)

1. **Sign in.** "Sign in with GitHub" in the web app. Better Auth creates the user and a session cookie.
2. **Put a project online.** From the Share box, a signed-in user presses "Share online". The web app creates a `Project` row
   (id = the local project's id) with the user as owner. The editor then connects like today.
3. **Getting a collab token.** The editor asks the web app, `POST /api/projects/<id>/token`. The route checks the session,
   finds the membership, and signs a token with project, role and a **short expiry (1 hour)**. The editor gives the
   provider a token _function_ (Hocuspocus supports it), so every reconnect fetches a fresh one. The collab server verifies it
   exactly as it verifies links today.
4. **Invite someone.** The owner picks a role and gets an invitation link (`/invite/<token>`). The other person signs in and opens
   it; the web app checks the hash, expiry and that it is not revoked, adds them as a member, and marks it accepted.
   An invitation is for one role and can be revoked before it is used.
5. **Dashboard.** `/` shows local projects (as now) and, when signed in, the projects you are a member of, with your role.
   Opening one goes to `/p/<id>`, which fetches its token as in step 3.
6. **Removing a member or changing a role.** Takes effect for new tokens at once and for an open connection within an hour
   (the token's expiry) or immediately if the web app tells the collab server to disconnect that person (step M8e).

Stage A (owner key and `?collab=` links) keeps working when no database is configured, and for projects that were shared
that way. It is not mixed with accounts for the same project.

## 6. What changes where

- **`packages/db`** (new): Prisma schema, migrations, the client, and a seed script. Used by the web app's server routes.
- **`packages/link-token`** (new): create and verify tokens (moved out of the collab server).
- **`apps/web`**: Better Auth set-up (route handler, server helper), sign-in button and menu, project and member routes (Zod
  checked), the token route, invitation routes and page, the dashboard. All server routes run on Node (not edge) because they use
  Prisma.
- **`apps/collab-server`**: imports the shared token package. Optionally a Postgres `DocumentStore` (step M8f). Its stage A share
  routes stay for no-database use.
- **`docker-compose.yml`** (repo root): one Postgres service for development.
- **The editor (`apps/web/src/collab`)**: gets its token from a function (stage B) or from the saved link (stage A).

## 7. Build order inside M8 (each part tested before the next)

| Part | What                                                                                                | How we know it works                                                                             |
| ---- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| M8a  | `docker-compose.yml`, `packages/db` with the schema, first migration, seed; the client in a test    | Tests run against a real Postgres: members and invitations rules, unique constraints.            |
| M8b  | Better Auth with GitHub in the web app: sign in, sign out, who am I                                 | By hand with your GitHub app (the one flow a test cannot do); route tests with a faked session.  |
| M8c  | Projects and members: create, list mine, members, roles, remove; all with Zod and permission checks | Route tests for every role against every action, including "not a member" and "not signed in".   |
| M8d  | `packages/link-token`; the token route; the editor fetches tokens by function                       | Two-window browser test: sign-in is faked in tests; a viewer member gets a read-only connection. |
| M8e  | Invitations and the dashboard; a removed member is disconnected                                     | Browser test: invite, accept, appear on the dashboard; remove, disconnected.                     |
| M8f  | Documents saved in Postgres instead of SQLite                                                       | Documents survive a server restart against Postgres.                                             |

## 8. Risks and open points, stated plainly

- **Browser tests cannot sign in with GitHub.** The tests need a test-only way to start a session (a route that exists only when
  an environment variable says so, never in production), and the real GitHub round trip is checked by hand.
- **Secrets.** `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_SECRET`, `DATABASE_URL` and `COLLAB_SECRET` live in `.env.local` files that are
  never committed. The web server and the collab server must share `COLLAB_SECRET`.
- **A token lives up to an hour** after a member is removed, unless the collab server is told to disconnect them (M8e).
- **Names.** Presence shows the GitHub name when signed in, else the chosen or guest name (a small change in M8d).
- **Project ids.** A cloud project reuses the local project's UUID. Two people cannot both register the same id; the first
  becomes the owner and the second gets a clear error.
- **Prisma 8 release candidate** is the `latest` tag of the CLI; do not run `npx prisma` without a version. The project's own
  `package.json` pins 7.10.1.
- **Node version.** Prisma 7.10.1 needs Node 20.19+, 22.12+ or 24+; the project pins 24 (managed with fnm).
