---
name: update-what-we-used
description: Update docs/WHAT-WE-USED.md after a new tool, library, framework, config change or concept was added to the project. Use whenever something new gets installed or introduced, or when asked to refresh the "what we used" list.
argument-hint: [optional: what was added]
---

Keep `docs/WHAT-WE-USED.md` accurate. This is bookkeeping, not teaching: do not explain the tools to the user
unless they ask.

What was added: $ARGUMENTS (if empty, find out from `git status`, `git diff HEAD`, and the `package.json` files).

Steps:

1. Read `docs/WHAT-WE-USED.md` so you keep its tables and style.
2. Find every new item: packages in any `package.json` (root, `apps/*`, `packages/*`), machine tools, config files,
   settings, hooks, skills, CI changes.
3. Get the **real installed version**. Do not write versions from memory. Use the lockfile, `pnpm list --depth 0`,
   or `<tool> --version`. Run Node/pnpm commands from the repo root.
4. Add or update one row per item in the matching table (tools on the machine, repo structure, libraries and
   frameworks) and keep columns: item, version, purpose in one short line, where it is used.
5. Put changed defaults or deliberate settings under "Settings we changed".
6. Remove the item from the "Not used yet" list if it was there.
7. If a non-obvious choice was made (a version pinned for a reason, an alternative rejected), add a short dated
   entry to `docs/DECISIONS.md` with the reason. Skip this for routine additions.
8. Keep rows short. Do not add explanations, tutorials or Unity comparisons here. Those are given in chat only
   when the user asks "explain X".
9. Run `pnpm format` so Markdown tables stay aligned, then show the user a one-line summary of what was added.
