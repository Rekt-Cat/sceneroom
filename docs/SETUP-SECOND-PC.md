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
