# Going live, explained

What we did on 24 and 25 November 2026 to put SceneRoom on the internet, in plain words. The same story with pictures:
`docs/diagrams/backend/deployment-explained.html` (open it in a browser and click the boxes). To repeat the steps:
`docs/dev/SETUP-DEPLOYMENT.md`. The research behind the choices: `DEPLOYMENT.md`.

## The idea

On your computer one machine played every role: it served the pages, relayed the edits, ran the database and kept the files.
Going live means giving each role to a computer on the internet and telling those computers how to trust each other.

Unity comparison: your game worked in the editor; now it needs a download server, a dedicated server, a player database and an
asset host, plus the keys that let them talk.

| Role          | On your computer          | Live                 | Why that service                                                   |
| ------------- | ------------------------- | -------------------- | ------------------------------------------------------------------ |
| Web app       | `pnpm dev` (port 3000)    | Vercel               | Built for Next.js; builds from GitHub.                             |
| Collab server | `serve` (port 1234)       | Render, free         | Must hold connections open, which Vercel cannot. Sleeps when idle. |
| Database      | Postgres in Docker        | Neon (Singapore)     | Same database engine, free plan.                                   |
| Big files     | a folder                  | Backblaze B2         | Render's free disk is wiped at every restart.                      |
| Sign-in       | GitHub, localhost address | GitHub, live address | One OAuth app with two redirect addresses.                         |

## What we did, in order

1. **Prepared the code.** A Docker recipe for the collab server, a `/health` address, files in a bucket, a switch that turns the
   old share links off (their owner records would be wiped on Render), a "Waking the server…" message, and `render.yaml`.
2. **Backblaze.** A private bucket and a key limited to it. `check-files` proved upload and download with the real bucket.
3. **Neon.** A database in Singapore; the tables were built from your computer with `migrate:remote`. Your router's DNS could not
   find Neon, so public DNS servers were added on the Mac.
4. **CI failed.** Skipped account tests still tried to clean a database that CI's browser job does not have. Fixed.
5. **Vercel build failed.** A cached install skipped generating the database client. The build now generates it.
6. **Merged to `main`,** the branch the live services build from.
7. **Render.** The Blueprint read `render.yaml`; you typed the secrets. Checked from outside and in its log.
8. **GitHub sign-in.** The app got both addresses: your computer's and the live one.
9. **Vercel settings.** Eight values. `NEXT_PUBLIC_COLLAB_URL` is public ("Config") and is baked in when the site is built, so
   Production had to be redeployed.

## How the pieces trust each other

- **You** are proven by GitHub; the web app keeps your session in the database.
- **The editor** asks the web app for a pass (a token) for one project, good for an hour.
- **The web app** signs it with `COLLAB_SECRET`; **the collab server** checks the signature with the same secret.
- **The collab server** alone talks to the bucket, with its key. Browsers never see that key.
- **The collab server** only accepts browser calls from the web app's address (`ALLOWED_ORIGINS`).

## Where the secrets are

| Secret                      | Where it lives                                              |
| --------------------------- | ----------------------------------------------------------- |
| `COLLAB_SECRET`             | Vercel and Render, the same value                           |
| Neon address                | Vercel (pooled), Render (direct), `packages/db/.env.remote` |
| `BETTER_AUTH_SECRET`        | Vercel                                                      |
| GitHub client id and secret | Vercel (and `apps/web/.env.local` for your computer)        |
| Backblaze key id and key    | Render, `apps/collab-server/.env`                           |

None of them is in git: the repository is public.

## How to check it is healthy

| Open or run                                        | Good answer                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------- |
| `https://sceneroom-collab.onrender.com/health`     | `{"status":"ok"}` (slow the first time after a sleep)                        |
| `https://sceneroom.vercel.app/api/me` (signed out) | `Not signed in.` ("Accounts are not set up" means a Vercel setting is wrong) |
| Render, Logs                                       | `documents in Postgres, files in bucket sceneroom-files, link sharing off`   |

## State on 25 November 2026

**Working, checked from outside:** the collab server; accounts switched on; the sign-in address; the database answering; the
collab address built into the site.

**Not checked yet (needs you):** a real GitHub sign-in on the live site, putting a project online, an invitation on a second
device, a file upload through the live server, waking after sleep.

**To do:** replace the exposed Backblaze bucket key; delete `apps/web/.env.vercel`; hide the old share-link controls where link sharing is off; decide the limits.
