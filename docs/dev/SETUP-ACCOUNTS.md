# Setting up accounts: Docker Desktop and a GitHub app

These two things are done by the owner (they install software and create credentials in the owner's own accounts). Nothing
secret goes in a chat or in a committed file. See `docs/backend/ACCOUNTS.md` for the design.

## 1. Docker Desktop (runs Postgres)

1. Install Docker Desktop for Mac from <https://www.docker.com/products/docker-desktop/> (choose the Apple silicon or Intel
   build that matches your Mac) and start it. Wait until the whale icon says it is running.
2. Check in a terminal: `docker --version` and `docker compose version` both print a version.
3. Tell Claude it is ready. Claude will then run (from the repo root): `docker compose up -d` and check that
   `docker compose ps` shows the `postgres` service as healthy.

Stop it with `docker compose down` (your data stays in a Docker volume); `docker compose down -v` also deletes the data.

## 2. A GitHub OAuth app (the login)

1. On GitHub: your profile picture, Settings, Developer settings, OAuth Apps, **New OAuth App**.
2. Fill in:
   - Application name: `SceneRoom (local)`
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
3. Press Register application, then **Generate a new client secret**. Copy the Client ID and the secret now (the secret is shown once).
4. Put them in `apps/web/.env.local` (this file is git-ignored; create it if it does not exist), together with the other values
   from `apps/web/.env.example`:

```
GITHUB_CLIENT_ID=the client id
GITHUB_CLIENT_SECRET=the secret
BETTER_AUTH_SECRET=a long random string, for example the output of: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
BETTER_AUTH_URL=http://localhost:3000
DATABASE_URL=postgresql://sceneroom:sceneroom@127.0.0.1:5432/sceneroom
COLLAB_SECRET=the same value as in apps/collab-server/.env
```

For a deployed site (step M9) you make a second OAuth app with the real address.

## 3. Starting everything

After the one-time steps above, from the repo root (Docker Desktop must be open; after every restart of the Mac it has to be
opened again):

1. `docker compose up -d`: starts Postgres (check with `docker compose ps`: `healthy`).
2. `pnpm --filter @sceneroom/db migrate:deploy`: builds the tables (run it again after pulling a change that adds a migration).
   `pnpm --filter @sceneroom/db seed` adds two example people and a project (optional).
3. Make `apps/collab-server/.env` from `.env.example` and put the **same** `COLLAB_SECRET` as in `apps/web/.env.local`.
4. `pnpm dev` starts the web app (http://localhost:3000); `pnpm --filter @sceneroom/collab-server serve` starts the collab
   server (port 1234).

Optional settings:

- `COLLAB_ADMIN_URL=http://127.0.0.1:1234` in `apps/web/.env.local`: removing a member then disconnects them at once.
- `DATABASE_URL=...` in `apps/collab-server/.env`: the collab server keeps its documents in Postgres instead of its SQLite file.
  Copy the documents you already have once with `pnpm --filter @sceneroom/collab-server migrate-documents`.

Everything above uses `localhost`, so it works on this computer only. Opening a shared link from another computer needs the
deployment (step M9).

Tests that use Postgres (`pnpm test` in `packages/db`, `apps/web` and `apps/collab-server`) need steps 1 and 2 first. They only
touch rows of their own.
