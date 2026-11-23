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
