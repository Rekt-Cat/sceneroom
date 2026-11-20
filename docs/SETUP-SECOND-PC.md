# Set up on another computer

These steps are for macOS. On Windows or Linux the idea is the same, but the install commands differ.

## 1. Install the tools (once per computer)

1. [Homebrew](https://brew.sh) (macOS package installer).
2. `brew install git fnm`
3. [GitHub Desktop](https://desktop.github.com), signed in with the account that owns the repo.
4. Add fnm to your shell: append this line to `~/.zshrc`, then open a new terminal.
   ```
   eval "$(fnm env --use-on-cd --shell zsh)"
   ```

## 2. Get the code

Clone the repository with GitHub Desktop (File → Clone Repository), or:

```
git clone https://github.com/Rekt-Cat/sceneroom.git
cd sceneroom
```

## 3. Install and run

```
fnm install        # installs the Node version in .node-version (24)
corepack enable    # makes `pnpm` use the version pinned in package.json
pnpm install
pnpm dev           # web app at http://localhost:3000
```

`pnpm install` also switches on the git pre-push hook (`.husky/pre-push`, set up by the `prepare` script). Every `git push`, including from GitHub Desktop, then runs the format check, type-check, lint, tests and build first and is blocked if one fails. If a push says `pnpm: command not found`, tell Claude: the hook looks for Homebrew and fnm in the usual macOS places.

## Browser tests (optional)

The browser tests (`apps/web/e2e/`) open the real editor in a Chromium that Playwright downloads itself (about 600 MB). It is kept outside the repo; choose a folder with enough space and use the same one every time:

```
export PLAYWRIGHT_BROWSERS_PATH=<a folder of your choice>   # put this in your shell profile to keep it
cd apps/web && npx playwright install chromium
cd ../.. && pnpm dev                                        # in another terminal, or let the tests start it
pnpm test:e2e
```

Screenshots of what the tests saw are written to `apps/web/test-results/`, and the models they build (a hand, a person) to `apps/web/e2e-output/` (open them with **Open file** on the home screen). Both folders are ignored by git. The pre-push hook does not run these tests (they take minutes); the `e2e` job in GitHub Actions does. After installing any package, restart `pnpm dev`: a running dev server breaks when its packages are re-linked.

## 4. Environment files

Real `.env` files are never committed. When the project needs them, copy the template:

```
cp .env.example .env
```

and fill in the values on each computer.

## Daily routine

- Start work: pull (`git pull` or GitHub Desktop → Fetch/Pull).
- End work: commit, then push.

## Note on Claude Code

Claude Code's personal memory notes are stored per computer and are **not** synced. Everything important is written
into the repo (`CLAUDE.md`, `docs/PLAN.md`, `docs/DECISIONS.md`, `docs/WHAT-WE-USED.md`), so a new session on the
other computer picks up from those files.
