# Setting up the deployment: accounts you create, and where the settings go

Step M9 of the plan (`docs/backend/DEPLOYMENT.md`). Chosen: **Vercel** (web app), **Render's free web service** (collab server),
**Neon** (Postgres), **Backblaze B2** (big files), and a second **GitHub OAuth app**. You create the accounts and enter the
secrets; Claude does the rest. **Secrets go only into each service's own settings page, never into the repo or into a chat.**
Each step says what to write down; the values are marked `<like this>`.

Things marked **check** were read from search results and may have changed: look at the page you are on.

## 0. Regions (users in India)

Backblaze has no Asian region, so: **Render in Singapore** (the live editing is latency-sensitive), **Neon in Singapore**, **Backblaze
in EU Central** (the closest B2 region to India; files are fetched once per browser and then kept, so a farther bucket costs little).
`S3_REGION` is the code in the bucket's endpoint (for example `eu-central-003`), not the friendly name. If file loading ever feels
slow, Cloudflare R2 can keep data in an Asia-Pacific location; switching changes only the four `S3_*` settings.

## 1. Backblaze B2 (the big files)

1. Sign up at backblaze.com and open **B2 Cloud Storage**. (A payment method may be asked for. **Check** the free allowance: the
   first 10 GB.)
2. **Buckets, Create a Bucket.** Name it `sceneroom-files` (names are unique across all of Backblaze: add something of your own if it
   is taken). Set **Files in Bucket are: Private**. Leave encryption as it is. Create it. Use a **new** bucket: very old ones
   (before May 2020) do not work with the S3 API.
3. On the bucket's page note its **Endpoint**: it looks like `s3.<region>.backblazeb2.com` (for example `s3.us-west-004.backblazeb2.com`).
   The region is the part in the middle (`us-west-004`).
4. **Application Keys, Add a New Application Key.** Name: `sceneroom-collab`. **Allow access to Bucket(s): only `sceneroom-files`.**
   Type of access: **Read and Write**. Create it and copy **keyID** and **applicationKey** at once (the application key is shown
   once). Do not use the master key.
5. Write down: `S3_ENDPOINT=https://s3.<region>.backblazeb2.com`, `S3_REGION=<region>`, `S3_BUCKET=sceneroom-files`,
   `S3_ACCESS_KEY_ID=<keyID>`, `S3_SECRET_ACCESS_KEY=<applicationKey>`.

Test it on this computer before using it online: put those five values in `apps/collab-server/.env` and run
`pnpm --filter @sceneroom/collab-server check-files`. Every line should say `ok`. (Remove them again afterwards if you want local
files back: a folder is used when the S3 settings are not there.)

## 2. Neon (Postgres)

1. Sign up at neon.com (free plan; **check** the limits: about 1 GB, compute sleeps after 5 idle minutes).
2. **Create a project** named `sceneroom`. Region: **AWS Asia Pacific (Singapore)**. Postgres version: **17** (the same as locally).
   Leave the other options as they are.
3. Click **Connect** on the project's page. You need **two** connection strings (the dialog has a switch for "Connection pooling"):
   - **Pooled** (the host contains `-pooler`): for the web app on Vercel. It goes into Vercel in step 5.
   - **Direct** (pooling off): for the collab server on Render (step 4) and for building the tables from this computer.
     Both look like `postgresql://<user>:<password>@<host>/<database>?sslmode=require`.
4. **Build the tables.** Create the file `packages/db/.env.remote` (git ignores it) with one line, typed by you:
   `DATABASE_URL=<the direct connection string>`. Then run from the repo root:
   `pnpm --filter @sceneroom/db migrate:remote`. It shows which database it is working on (without the password), applies the
   migrations, and prints the status: "Database schema is up to date!". It refuses a pooled or a local address.
   (Why direct: the pooler can make `prisma migrate` hang.)
   **If it says "Can't reach database server":** check `dig +short <the host of the address>`. If it prints nothing while
   `dig +short @8.8.8.8 <the host>` prints addresses, your router's or ISP's DNS cannot look up Neon's names (seen on an Indian
   ISP, 2026-11-25). Add `1.1.1.1` and `8.8.8.8` under **DNS Servers** (not Search Domains) of the network in System Settings and
   turn Wi-Fi off and on. Render and Vercel are not affected; only commands run from this computer are.
5. Delete `packages/db/.env.remote` when you are done if you like; the address also lives in Render and Vercel.

**Done 2026-11-25:** project `sceneroom` in Singapore (AWS `ap-southeast-1`), the three migrations applied, the direct and the pooled address both tested with the drivers the app uses, and the collab server's document store saved and read a test row (about 0.6 s per new connection from India).

## 3. A second GitHub OAuth app (production sign-in)

1. GitHub, Settings, Developer settings, OAuth Apps, **New OAuth App**. Name `SceneRoom`.
2. Homepage URL: your web app's address (Vercel gives `https://<name>.vercel.app`; you can decide it in step 5, so do this step
   after it). Callback URL: `https://<name>.vercel.app/api/auth/callback/github`.
3. Register, **Generate a new client secret**, copy the **Client ID** and the **secret** (shown once).

## 4. Render (the collab server)

1. Sign up at render.com with GitHub. (**Check** whether it asks for a card for a free web service: reports differ.)
2. **New, Blueprint**, pick the `sceneroom` repository, branch `main` (or the branch that has `render.yaml` once it is merged).
   Render reads `render.yaml` at the repository root. **Check** each field it shows against what you expect: plan Free, runtime
   Docker, health check `/health`.
3. Render asks for the values marked `sync: false`. Enter:
   - `COLLAB_SECRET`: make a new one: run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the
     result. **Write it down** (you will enter the same value in Vercel).
   - `DATABASE_URL`: the Neon pooled address from step 2.
   - `ALLOWED_ORIGINS`: your web app's address, exactly (`https://<name>.vercel.app`, no slash at the end).
   - the five `S3_*` values from step 1.
4. Deploy. When it is live Render shows the service's address, `https://sceneroom-collab-<something>.onrender.com`. Open
   `<that address>/health`: it should answer `{"status":"ok"}` (the first time after idle can take about a minute).

## 5. Vercel (the web app)

1. The project already exists (the editor). In its **Settings, Environment Variables** add, for **Production**:
   - `DATABASE_URL`: the Neon pooled address.
   - `BETTER_AUTH_SECRET`: a new random 64-character value (same command as above).
   - `BETTER_AUTH_URL`: `https://<name>.vercel.app`.
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`: from step 3.
   - `COLLAB_SECRET`: the same value as on Render.
   - `COLLAB_ADMIN_URL`: the Render address (`https://sceneroom-collab-<something>.onrender.com`).
   - `NEXT_PUBLIC_COLLAB_URL`: the same address with `wss://` instead of `https://`.
2. Deploy again (a change of settings needs a new deploy).

## 6. The checks (together)

1. `<Render address>/health` answers.
2. The web app opens, sign in with GitHub works, "Put online with my account" works.
3. An invitation opened on a **second computer** (or a phone) joins and edits live.
4. After 15 idle minutes the collab server sleeps: the editor shows "Waking the server…" and reconnects.
5. A model imported in one browser appears in the other (the bucket works).

If something fails, send the message (not any secret) and Claude finds the cause.

## Where each secret lives (so none is lost)

| Secret                      | Lives in                           | Also needed in                                                 |
| --------------------------- | ---------------------------------- | -------------------------------------------------------------- |
| `COLLAB_SECRET`             | Render and Vercel (the same value) | nowhere else                                                   |
| `BETTER_AUTH_SECRET`        | Vercel                             | nowhere else                                                   |
| Neon `DATABASE_URL`         | Render and Vercel                  | your terminal for migrations                                   |
| GitHub client id and secret | Vercel                             | nowhere else                                                   |
| B2 keyID and applicationKey | Render                             | `apps/collab-server/.env` for the local check (ignored by git) |

Keep a copy of the secrets in a password manager: neither Render nor Vercel shows them again in full.
