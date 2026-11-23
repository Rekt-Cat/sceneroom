# Collaboration and the online part: design

Written 2026-11-21, before any of it is built. This is the plan to check, and the place to come back to when something here
is unclear. Diagrams: `docs/diagrams/backend/collab-architecture.svg` (the pieces) and `docs/diagrams/backend/collab-sync-flow.svg` (one edit
travelling from one person to another). Why each tool was chosen over the others: `WHY-THESE-TOOLS.md`.

## 1. What we are building, in plain words

Today SceneRoom is a very good **single-player** 3D editor. Everything lives in your browser (IndexedDB), and you send a
project to someone as a `.sceneroom` file.

The online part makes it **Google Docs for a 3D scene**: you press Share, send a link, and the other person opens the same
scene. You both see each other's changes within a fraction of a second, you see where the other person is looking and what
they have selected, and you each have your own Undo.

Unity comparison: Unity has no built-in live co-editing of a scene (there is version control, such as Plastic SCM, which
merges changes later, not live). What we build is closer to how Figma or Google Docs work, which is a different thing from
Unity's multiplayer (Netcode), which syncs a running game, not an editor.

## 2. The big idea: a shared document that merges by itself

When two people change the same thing at the same time, somebody has to decide who wins. There are two well-known
families of answer:

| Idea                                          | How it works                                                                                                                            | Used by                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **OT** (operational transform)                | A central server reorders everybody's edits and rewrites them so they still make sense                                                  | Old Google Docs, ShareDB                           |
| **CRDT** (conflict-free replicated data type) | The data structure itself is built so that edits made in any order, on any machine, always end up with the same result, with no referee | **Yjs** (our choice), Automerge, Figma-style (own) |

We use a CRDT library called **Yjs**. The thing you edit is a `Y.Doc`: a document made of maps, lists and text that
behaves like ordinary data in your code. Every change is recorded as a small update; updates can be sent in any order, even
after being offline for an hour, and everyone converges on the same document. This is also what makes **offline work and
reconnecting** simple, which a server-decides design makes hard.

Two pieces of vocabulary used below:

- **Provider**: the code that carries updates between a `Y.Doc` and the outside world (a WebSocket to our server, or the
  browser's IndexedDB for offline).
- **Awareness**: a second, throw-away channel for things that are not part of the document: who is online, their colour,
  their cursor, what they have selected. It is never saved, and it disappears when the person leaves.

## 3. The pieces

```
Browser A ──┐                                   ┌── Postgres  (documents, users, projects, roles)
            ├── WebSocket ── collab server ─────┤
Browser B ──┘     (Yjs updates + awareness)      └── file store (meshes, models, pictures, by content hash)
   │  └─ IndexedDB (offline copy)                        ▲
   └──────────── HTTPS upload / download ───────────────┘
```

- **`apps/web`** (exists): the editor. Gets a new "sync" layer that connects the scene store to a `Y.Doc`.
- **`apps/collab-server`** (new): a small Node program using **Hocuspocus** (a ready-made Yjs server). It checks who is
  connecting, keeps documents in memory while people are in them, saves them, and forwards updates.
- **`packages/shared`** (exists): grows the code that converts between our `Scene` data and a `Y.Doc`, so the browser and the
  server agree on the layout and both validate with the same Zod schemas.
- **File store**: big binary files do not go through the document (see section 6).
- **Postgres** (via Docker, later): users, projects, members and roles, and the saved documents. Until then the collab server
  saves documents in a local file database (SQLite, through Node's built-in `node:sqlite`) so we can build and test collaboration without installing Docker.

## 4. What lives in the shared document, and what does not

The scene is already stored the way a shared document wants it: a flat map of objects by id, each a small plain record
(`DECISIONS.md`: "flat map of nodes", `order` numbers instead of array positions). That choice was made on purpose.

**One `Y.Doc` per scene, plus one for the project.** (`PLAN.md`, Phase 7.) Two people working in different scenes of the same
project do not send each other's changes, and a huge scene does not slow down the small project document.

```
Project document  "project:<projectId>"
  meta            Y.Map     name
  scenes          Y.Map     sceneId -> { name, order, prefabId? }
  prefabs         Y.Map     prefabId -> prefab (nodes inside as JSON)
  members         (later, from the server, not edited here)

Scene document    "scene:<projectId>:<sceneId>"
  nodes           Y.Map     nodeId -> Y.Map of that object's fields
                              name, kind, parentId, order, color, visible, locked, assetId, ...
                              transform   Y.Map   position, rotation, scale   (each a [x,y,z] value)
                              material    Y.Map   roughness, metalness, colorMap, ... (each a plain value)
                              light, plant, character, modifiers, ...   one JSON value each
  assets          Y.Map     fileId -> record (name, type, bytes, bounds ...). Add-only.
  environment     Y.Map     background, sky, fog, sun ...
```

Rules for what goes where:

- **Per-field granularity where people really collide.** `transform` and `material` are maps of their own, so one person
  changing Roughness while another moves the object does not collide, and two people changing the same Roughness is
  resolved by "the later change wins", which is what people expect from a slider.
- **One JSON value for the rest** (a light's settings, a character's pose, the modifier list). Changing it replaces the whole
  value; if two people edit the same modifier list at the same moment, one wins. This is simple and rare; it can be made
  finer later without changing the rest.
- **Not in the document (stays on your screen only):** which scene tab you have open, selection, camera, Edit-mode state,
  paint and bake settings, hidden triangles, the clipboard. Selection and "who is in which scene" are shared through
  awareness, not saved.
- **Never trusted:** every update that arrives from the network is checked with the Zod schemas before it touches the
  store, the same rule as for files and local storage (`CLAUDE.md`: validate all outside data). A bad update is dropped and
  logged, never applied.

## 5. How the editor talks to the document

The editor does not get rewritten around Yjs. The Zustand store stays what the 3D view draws from, and all the pure scene
functions stay as they are. A **sync layer** sits beside the store:

1. **You change something** (a store action runs and the scene changes, as today).
2. The sync layer sees the new scene, compares it with the previous one, and writes **only what differs** into the `Y.Doc`
   in one transaction marked as "mine". Slider drags are sent a few times a second, not on every pixel.
3. The provider sends the update to the server, which sends it to everyone else.
4. **On the other side**, the document fires an event. The sync layer rebuilds only the objects that changed, checks them
   with Zod, and puts them into that person's store **without adding an Undo step**. The 3D view redraws as it always does.

This "compare and write the difference" approach (rather than turning every store action into a document action) keeps the
change small and means the hundreds of existing actions keep working unchanged. Its cost is the compare step; for a scene
of a few thousand objects that is cheap, and we measure it before worrying.

## 6. Big files: meshes, models and pictures

An imported model, a mesh, or a painted or baked picture can be many megabytes. They already live **outside the scene, under
a fingerprint of their bytes** (`ASSETS-AND-IMPORT.md`, `meshStorage.ts`), and the scene only holds the id. That is exactly
what we need online:

- **Upload first, reference second.** Before a change that mentions file `4f2a…` is sent, that file is uploaded to the file
  store (skipped if the server already has it: same bytes, same id).
- **Download on demand.** When another person's scene mentions a file you do not have, it is fetched by id, with a
  placeholder shown meanwhile (the missing-file placeholder already exists).
- **Never trust the server's answer:** the downloaded bytes are hashed and must equal the id, or they are thrown away.
- **Limits:** a maximum file size and a per-project total, checked on the server too.
- **Meshes edited point by point:** each finished action already stores a new mesh version under a new id (and big meshes
  as small patches), so syncing it means uploading one file. Old versions are cleaned up when no scene refers to them.
- **Painting strokes** create a new picture at the end of each stroke; uploads are limited to a few per second so a fast
  scribble does not flood the server.

## 7. Two people editing the same mesh

Editing points, painting and baking all produce a _new whole file_, so two people doing it to the same object at once would
make one of them lose work. The rule for the first version, kept deliberately simple:

> **One editor per object.** When you enter Edit points, Paint or Bake on an object, your awareness record says so. Everyone
> else sees a small lock badge and cannot start those modes on that object until you leave. If you disconnect, the lock
> disappears by itself (awareness records vanish with the connection).

Moving, rotating, scaling, colouring and every other scene-level change stay open to everyone at all times. This is the
rule `DECISIONS.md` already named ("one editor per mesh"). It is enforced by the editor; the server cannot tell what is being
edited inside a file, so we state honestly that it is a courtesy lock, not a security control.

## 8. Undo with several people

Today Undo restores a **snapshot of the whole scene** (`DECISIONS.md`, "why snapshots"). With several people that would undo
somebody else's work too. So in a shared scene Undo moves to **`Y.UndoManager`**, which Yjs provides: it remembers only the
changes made by _this_ browser (the transactions marked "mine") and undoes exactly those, leaving other people's changes
alone, field by field.

What stays the same: the Undo and Redo buttons, shortcuts, and the step labels shown in the UI ("Move points", "Paint stroke").
What changes: the history is no longer a list of scene snapshots. Local-only (never shared) projects keep the current
history until the new one has proved itself, then switch to the same code so there is one path.

## 9. Who may do what

Two stages, so something works early and the proper version follows:

| Stage           | How you get in                                                                                 | How the server decides                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **A: link**     | Press Share, get a link with an unguessable token. The token carries a role: editor or viewer. | The server checks the token when the connection opens. A viewer connection is made **read-only** on the server: its updates are ignored. |
| **B: accounts** | Log in (OAuth). Projects have members with a role: owner, editor, commenter, viewer.           | The server checks the member list in Postgres. Share links become invitations with a role and an expiry.                                 |

Always, on the server and not only in the page:

- a **maximum size** for one message and for one document;
- **validation** of anything that is saved (shape and sizes);
- **rate limits** per connection;
- a viewer can never write, whatever the page does.

Locks and hidden objects (`DECISIONS.md`) are shown to everyone as they are today; enforcing "locked" on the server is a Stage B item.

## 10. Staying local-first

SceneRoom works with no account and no internet today, and that stays true.

- A project is **local** until you press Share. Then its documents are created on the server and the project becomes
  **shared**; your browser keeps an offline copy (`y-indexeddb`) and syncs when it can.
- Offline edits made to a shared project are merged when you reconnect: that is the CRDT's main promise.
- Export to `.sceneroom` and to GLB keeps working from the local copy.

## 11. Build order (each step is demonstrable and tested)

| Step | What                                                                                                                                                                               | How we know it works                                                                                     |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| M1   | **Shared code:** `Scene` to `Y.Doc` and back, and applying a change as a small difference, in `packages/shared`. Round-trips every scene feature.                                  | Vitest: a scene survives a trip; two docs edited apart merge to the same scene; bad updates are refused. |
| M2   | **Collab server:** `apps/collab-server` with Hocuspocus, saving to SQLite; token check; read-only viewers; size limits.                                                            | Unit and integration tests with two in-process clients.                                                  |
| M3   | **Sync layer in the editor:** connect the store to the document; remote changes appear; no echo loops; status badge ("Connected", "Offline, changes kept").                        | Playwright with **two browser windows**: edit in one, see it in the other.                               |
| M4   | **Files online:** upload and download by hash, with the hash check and limits.                                                                                                     | Playwright: import a model in one window, see it in the other.                                           |
| M5   | **Per-user Undo** with `Y.UndoManager`, and the **one editor per object** lock.                                                                                                    | Two windows: A undoes, B's changes stay; B cannot enter Edit points on A's object.                       |
| M6   | **Presence:** names and colours, selections, where each person is, 3D cursors.                                                                                                     | Two windows show each other's selection.                                                                 |
| M7   | **Share button and links** (Stage A): create a link, open it, role respected.                                                                                                      | Viewer link cannot change anything, checked on the server.                                               |
| M8   | **Postgres, Docker, accounts** (Stage B), dashboard, invitations. Designed in `ACCOUNTS.md` (parts M8a to M8f). Needs Docker Desktop and a GitHub OAuth app (set up by the owner). | Documents survive a server restart; roles enforced from the database.                                    |
| M9   | **Deploy:** web on Vercel, collab server on a host that keeps WebSockets open, Postgres on Neon, files on R2; a two-context test in CI.                                            | A real link works between two real devices.                                                              |

**Status (2026-11-23): M1 to M7 are built.** What the build changed against this design is in `DECISIONS.md` (sections "Collab server" and "Editor sync layer"): `node:sqlite` instead of `better-sqlite3`, going online by `?collab=` in the address until the Share button (M7), Undo online takes back only your own field changes through our own pure functions (M5) rather than the Yjs `UndoManager`, and only the open scene is shared until the project document exists. M4 (files) sends them over plain HTTP at `/files/...` rather than through the WebSocket, and receives on demand with retries instead of a strict "upload first" order.

## 12. Risks and open questions, stated plainly

- **The compare-and-write sync layer is the heart of it.** If it has a bug, changes echo or get lost. That is why M1 is
  shared code with heavy tests before anything is connected, and why M3 is tested with two real browsers.
- **Undo is the biggest change to existing behaviour** (M5). It touches how every action is recorded. We keep the snapshot
  history running for local-only projects until M5 passes its tests.
- **Mesh storage growth.** Every finished edit stores a new file. A clean-up of unused versions (planned already) becomes a
  real requirement online. Patch storage (`meshPatch.ts`) keeps big meshes small.
- **Hosting the collab server.** Vercel runs short-lived functions, not long-lived WebSocket servers (`DECISIONS.md`, 2026-11-11),
  so the collab server needs a different host (a small container service). Which one is decided at M9, not now.
- **Courtesy locks** (section 7) can be bypassed by a modified client. Fine for friends and teams; Stage B decides whether
  something stronger is needed.
- **Prisma's `latest` tag is a release candidate** (8.0.0-rc.34, checked 2026-11-21); `DECISIONS.md` already says to use the
  stable 7.x line. Re-check when M8 starts.
- **Not verified yet:** the Hocuspocus 4.x API details (checked only that it exists, version 4.9.0, and needs Yjs 13), and
  how Yjs behaves with our largest scenes. Both are checked at M2 and M3 by reading the library's own docs and measuring.

## 13. Versions looked up on 2026-11-21 (npm registry)

| Package                | Version | Purpose                                                                  |
| ---------------------- | ------- | ------------------------------------------------------------------------ |
| `yjs`                  | 13.6.33 | The shared document                                                      |
| `y-protocols`          | 1.0.7   | Awareness and the sync messages                                          |
| `@hocuspocus/server`   | 4.9.0   | The collab server (needs `yjs` ^13.6.8)                                  |
| `@hocuspocus/provider` | 4.9.0   | The browser side of the connection                                       |
| `y-indexeddb`          | 9.0.12  | Offline copy in the browser                                              |
| ~~`better-sqlite3`~~   | 13.2.0  | Not used: `node:sqlite` (built into Node) does the job, see DECISIONS.md |

Yjs (M1), `@hocuspocus/server` and `@hocuspocus/provider` (M2, M3) and `y-indexeddb` (M3) are installed. `y-protocols` is used through the provider and not installed on its own. The others are added at M4 and later, and then recorded in `WHAT-WE-USED.md` as usual.
