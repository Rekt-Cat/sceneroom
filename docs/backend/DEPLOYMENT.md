# Deployment (step M9): where each part runs, and what has to be decided

Written 2026-11-24, updated 2026-11-25. Status: **prepared, not deployed.** The owner chose (2026-11-25): the collab server on **Render's
free web service**, the big files in **Backblaze B2**, and **open sign-in with GitHub**. The accounts to create, step by step:
`docs/dev/SETUP-DEPLOYMENT.md`. The question about files ("an alternative, like AWS") is answered in
section 4. What can be built and checked without accounts is done (section 2); what needs an account of the owner is in section 6.
Context: `COLLABORATION.md` (design), `ACCOUNTS.md` (accounts), `docs/diagrams/overview/whole-app.html` (the parts).

## 1. The pieces and where they go

| Part                       | Runs where                                                                              | Why there                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Web app (Next.js)          | **Vercel** (already used for the editor)                                                | Built for Next.js; deploys from GitHub on every push; short-lived functions are enough for the routes. |
| Collab server (Hocuspocus) | **A free host that sleeps** (Render's free web service is the candidate, see section 3) | It holds WebSocket connections open; Vercel functions are short-lived. The free hosts sleep when idle. |
| Postgres                   | **Neon** (managed Postgres, free plan)                                                  | Same engine as Docker locally; holds accounts **and the scene documents**.                             |
| Big files                  | **An S3-compatible bucket** (Cloudflare R2, Backblaze B2 or AWS S3, see section 4)      | A free web service has no disk that survives a restart, so files cannot live on it.                    |
| Sign-in                    | A **second GitHub OAuth app** for the real address                                      | An OAuth app has one callback address; the local one points at `localhost`.                            |

## 2. What is prepared (built and checked 2026-11-24 and 2026-11-25)

- **`GET /health`** on the collab server (`healthRoute.ts`): `200 {"status":"ok"}`, no login, shows no settings. 2 tests.
- **A Docker image** (`apps/collab-server/Dockerfile`, `.dockerignore`; build from the repository root:
  `docker build -f apps/collab-server/Dockerfile -t sceneroom-collab .`). Checked by hand: it starts, `/health` answers, uploads work
  (401 without a token), Docker reports it healthy. It listens on `0.0.0.0` and reads its settings from environment variables.
  **Known:** the image is about 1.1 GB (a smaller one is possible later).
- **Files in a bucket** (`s3FileStore.ts`, new `S3_*` settings, `aws4fetch` for the request signing): one class for R2, B2 and
  S3. The collab server stays in the middle, so every upload and download still passes its token, role, hash, size and quota
  checks; the bucket is only where the bytes rest. 7 unit tests against a fake S3 that checks each request is signed. **Checked end
  to end in a container** against an S3-compatible test server (upload, a repeated upload, a wrong-bytes upload refused, and a
  brand-new container with an empty disk downloading the file). **Not verified against a real R2, B2 or S3 bucket yet** (the test
  server does not check signatures): `pnpm --filter @sceneroom/collab-server check-files` does that in one command with the real keys.
- **Documents in Postgres** (step M8f) and **tokens signed by the web app** (M8d): already work with separate servers.
- **`LINK_SHARING=false`**: the old share-link routes (`/share/...`) answer 404. They keep their owners in the SQLite file, which a
  host without a lasting disk loses at every restart (a cancelled link would work again), so a free-host deployment switches them
  off and uses accounts only. 2 tests.
- **A waking hint in the editor**: after 8 seconds of trying to connect, the badge says "Waking the server…" with an explanation
  (a free host takes up to a minute to wake). 4 tests. The provider already retries by itself.
- **The database migrations** (`pnpm --filter @sceneroom/db migrate:deploy`) run against any Postgres.

## 3. The collab server on a free host: what the research found (2026-11-25; check live pages before relying on any number)

| Option                       | What it is                                                                                                                                                                                                                                                                                                | Fit                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Render, free web service** | Runs Docker. Spins down after 15 minutes without traffic (WebSocket messages count), wakes in about a minute, may restart at any time, one instance only, **no persistent disk: files and SQLite are lost on every restart or spin-down** ([free](https://render.com/docs/free)). 750 free hours a month. | **The candidate.** It works because documents are in Postgres, files in a bucket, and link sharing is off. |
| **Google Cloud Run**         | WebSockets work, a connection is capped by the request timeout (up to 60 minutes), scales to zero ([WebSockets](https://docs.cloud.google.com/run/docs/triggering/websockets)). Needs a billing account (a card).                                                                                         | Possible, but the rooms live in memory, so it must be limited to **one instance**; more setup than Render. |
| **Oracle Cloud Always Free** | A free ARM virtual machine (up to 4 cores and 24 GB) that is **always on** ([resources](https://docs.oracle.com/iaas/Content/FreeTier/resourceref.htm)). Community reports in 2026 say capacity is often unavailable in popular regions and some free instances were disabled.                            | Free and always on, but unreliable to obtain, and you maintain the machine. Worth a try later, not a plan. |
| **A paid always-on host**    | Fly.io (about 2 dollars a month, no free tier), Railway (5 dollars a month including 5 of usage), a Hetzner VPS (about 5.5 to 6.5 euro).                                                                                                                                                                  | The upgrade when sleeping gets in the way.                                                                 |

**What sleeping means for the product:** the first person to open a shared project after an idle time waits up to about a minute
(the editor shows "Waking the server…", and keeps working locally meanwhile). When the last person has been idle for 15 minutes the
server sleeps and everyone's connection is dropped; their work is kept in their browsers and shared again when it wakes. A
session cannot last through a long idle gap. Live editing with several people at the same time works as designed.

**The settings file** is `render.yaml` at the repository root, a **draft**: `runtime`, `dockerfilePath`, `dockerContext`, `healthCheckPath`
and `plan: free` match Render's Blueprint reference and examples, but `sync: false` (a value typed in the dashboard) was not
confirmed from the sources found, and whether a free web service asks for a card is reported both ways. Check each field against
render.com/docs/blueprint-spec on the first use. Its content:

```yaml
services:
  - type: web
    name: sceneroom-collab
    runtime: docker
    plan: free
    dockerfilePath: ./apps/collab-server/Dockerfile
    dockerContext: .
    healthCheckPath: /health
    envVars:
      - key: COLLAB_SECRET # a new random 64-character value; sync: false means "typed in the dashboard, not in the repo"
        sync: false
      - key: DATABASE_URL # the Neon address
        sync: false
      - key: ALLOWED_ORIGINS # the web app's address
        sync: false
      - key: LINK_SHARING
        value: "false"
      - key: S3_ENDPOINT
        sync: false
      - key: S3_BUCKET
        sync: false
      - key: S3_REGION
        sync: false
      - key: S3_ACCESS_KEY_ID
        sync: false
      - key: S3_SECRET_ACCESS_KEY
        sync: false
```

## 4. Where the big files go: the alternatives, and AWS

Because the free host loses its disk, files need object storage. The code speaks the **S3 API**, so one class works with all of
these; the choice is only about price and effort. All of them need an account, and most want a card.

| Service                 | Free part                                                                                                                                                                                                                             | After that                                                                                             | Notes                                                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare R2**       | 10 GB stored, 1 million writes, 10 million reads a month ([pricing](https://www.cloudflare.com/developer-platform/r2/))                                                                                                               | Cheap storage, **no download fees**                                                                    | **Recommended.** Region "auto". Its docs show `aws4fetch`, the library used here.                                                                                               |
| **Backblaze B2**        | First 10 GB free ([pricing](https://www.backblaze.com/cloud-storage/pricing))                                                                                                                                                         | About 0.7 cent per GB a month; downloads free up to 3 times the stored amount, then 1 cent per GB      | S3-compatible. Good second choice.                                                                                                                                              |
| **AWS S3**              | New accounts (since July 2025): credits of about 100 dollars (up to 200), a free plan that ends after 6 months or when the credits are used ([free tier](https://aws.amazon.com/free/faqs/)); some sources also list 5 GB always free | Pay per GB stored and per GB downloaded (**download fees apply**; I did not confirm the current rates) | Works with the same code (endpoint `https://s3.<region>.amazonaws.com`, region such as `eu-central-1`). The most to learn, and the one where a forgotten bucket can cost money. |
| A volume on a paid host | none                                                                                                                                                                                                                                  | About 15 cents per GB a month                                                                          | Only on a host with a lasting disk (not the free one).                                                                                                                          |

**Recommendation: Cloudflare R2.** Free for the amounts a small project reaches, no download fees, and a spending surprise is
unlikely. AWS is the most "industry standard" to learn; it is a fine choice if you want that experience, with a budget alert set.

## 5. Decisions, and what is still open

| Decision                            | Status                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Collab server host                  | **Render, free web service** (owner, 2026-11-25). A free host that sleeps.                              |
| Who may sign in                     | **Anyone with GitHub** (owner, 2026-11-25). Needs the limits talk before the site is public.            |
| Where the files go                  | **Backblaze B2** (owner, 2026-11-25). The code works with R2 or AWS S3 too.                             |
| An address (domain)                 | Open, optional: the hosts give free ones with HTTPS (`something.vercel.app`, `something.onrender.com`). |
| Limits (sizes, quotas, rate limits) | **Postponed by the owner** ("we'll discuss limits later"); to be settled before the site is public.     |

## 6. The order of work

| Step | What                                                                                                                                                                                                                                                                         | Who                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1    | Decide the open items in section 5 (the bucket provider, the host, an address, the limits).                                                                                                                                                                                  | Owner                                   |
| 2    | Make the accounts: Render, Neon, the bucket, a second GitHub OAuth app with the real callback address. Secrets go only into each service's settings, never into the repo or a chat.                                                                                          | Owner                                   |
| 3    | Run the migrations on Neon (`migrate:deploy`) with the Neon address; check the bucket with `check-files` using the real keys.                                                                                                                                                | Claude (with the owner's settings)      |
| 4    | Production settings for the web app (Vercel): `DATABASE_URL` (Neon, the pooled address), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, the GitHub values, `COLLAB_SECRET`, `COLLAB_ADMIN_URL` (the collab server's https address), `NEXT_PUBLIC_COLLAB_URL` (a `wss://` address). | Claude writes the list; owner enters it |
| 5    | Production settings for the collab server (section 3's list).                                                                                                                                                                                                                | Claude writes the list; owner enters it |
| 6    | Production hardening in code: secure cookies and trusted origins for Better Auth, security headers, rate limits (after the limits talk), `/internal/disconnect` kept off the public internet if the host allows.                                                             | Claude                                  |
| 7    | Deploy both, then the **two-device check**: an invitation opened on a second computer, two people editing live, and a wake-up after idle.                                                                                                                                    | Owner + Claude                          |
| 8    | Monitoring and backups: where the logs are read, how Neon and the bucket are backed up, what shows that the server is down.                                                                                                                                                  | Claude writes the guide                 |

## 7. Things that can go wrong, stated now

- **The first load after idle is slow twice over:** the collab server wakes (up to a minute) and Neon's compute wakes (a second or
  two). The editor shows "Waking the server…" and works locally meanwhile.
- **Every sleep drops the connections.** Work is kept in each browser (offline copy) and is merged when the server is back. A
  change made by two people while it was asleep is merged by the shared document as usual.
- **The SQLite file is lost at every restart.** It only holds the owners of share links, which are switched off (`LINK_SHARING=false`).
  Documents are in Postgres and files in the bucket.
- **Prisma on Vercel:** each function opens its own connections; use Neon's pooled address and keep the pool small.
- **An idle WebSocket can be cut by a proxy.** Not measured yet; check with a session left open.
- **Mixed content:** a page on `https` cannot open `ws://`; the collab server must be reached as `wss://`.
- **Two origins:** `ALLOWED_ORIGINS` must list the web app's address exactly. Tokens, not cookies, authorise those calls.
- **`/internal/disconnect`** is on the public port; it is protected by a signature and a time window.
- **Secrets:** `COLLAB_SECRET` and `BETTER_AUTH_SECRET` must be new random 64-character values in production, never the local ones.
- **Not verified:** real-bucket behaviour (use `check-files`), Neon's cold-start time, how long Render takes to wake our image, and the exact free-tier terms on the day you sign up.

## 8. Regions (the owner's users are in India)

Render **Singapore** (nearest; set in `render.yaml` as `region: singapore`, a field to confirm against the Blueprint reference), Neon **Singapore**, Backblaze **EU Central** (B2 has no Asian region; files are fetched once per browser and kept, so the distance matters little). Latencies are estimates, not measurements. R2 with an Asia-Pacific location is the fallback if file loading is slow.
