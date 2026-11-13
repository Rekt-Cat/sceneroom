# Importing assets and models: plan

How people bring in things made elsewhere, such as a premade car, a tree pack or a texture, and how SceneRoom keeps them.
This is a **plan**, not built code. Nothing here is verified yet (see "Still to research"). Decisions go in `DECISIONS.md` too.

## What the user should be able to do

1. **Import a model file** (a car, a character, a building) by dragging it onto the 3D view, or with an "Import" button.
2. See it in the **scene list** as an object, with a name, and move, rotate, scale, hide, lock, duplicate and delete it like any other object.
3. Keep a **library of imported assets** (an Assets panel with thumbnails) and place the same asset many times.
4. **Save the scene** and open it again later with the imported models still there (this needs Phase 5's saving).
5. Later: **export** the whole scene, and **unpack** an imported model into editable parts (needs the mesh tools in `ADVANCED-EDITING.md`).

## Formats

| Format                      | Plan                                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **GLB** (binary glTF)       | First and main format. One file holds the shapes, materials, textures and animation. Most free model sites offer it. |
| **glTF** (.gltf + files)    | Same content split into several files. Supported next; needs the extra files dropped together.                       |
| **OBJ**                     | Simple and common for static models. Later. No materials in the file itself beyond a small side file.                |
| **FBX**                     | Common in games (also what Unity uses), but it is a closed format and more work. Much later, if at all.              |
| **Images** (PNG, JPG, WebP) | For textures and reference pictures, once materials and texturing exist.                                             |

Unity comparison: dragging a `.glb` in is like dragging a model into the Unity Project window; placing it in the scene is
like dragging it into the Hierarchy.

## How an imported model fits into our scene

Today every object is a primitive (cube, sphere, ...). An imported model is a new kind of object.

- **A "model" object** that stores the **id of the imported file** (not the file itself) plus its normal object data: name, position,
  rotation, scale, visible, locked, parent. So everything we built (gizmo, Inspector, undo, lock, parenting) works on it.
- The model's **inner structure** (a car has body, wheels, doors) is kept inside the file at first, and the model is one object.
  This keeps the first version simple. Showing the inner parts in the scene list, and editing them, comes with the mesh tools.
- **Size and position:** models come in all sizes (a car may be 4 units or 4000). On import we scale it to a sensible size,
  place it at the middle of the scene sitting on the ground, and select it. The user can reset the scale.
- **Many copies of one asset** share the same loaded data, so ten cars cost little more than one.

## Where the files live

A model file can be many megabytes, so it never goes inside the scene data, the undo history or (later) the shared multiplayer document.
This is the same rule as for big meshes in `ADVANCED-EDITING.md`, so both use **one asset system**:

- A scene object points to an **asset id**. The file itself is stored **separately**: in the browser's storage (IndexedDB) first,
  and in object storage with the database later (Phases 6 and 8).
- Assets are **content-addressed**: the id comes from the file's contents (a hash), so the same car imported twice is stored once.
- The scene file records, per asset: id, original file name, type, size, and the **licence / source note** the user enters.
- If an asset is **missing** (storage cleared, or someone else's browser in a shared scene before upload), the object shows a placeholder box
  with a clear message, instead of failing.

## Safety and limits (files from outside are untrusted)

Follow the rules in `CLAUDE.md`: limit sizes and validate outside data.

- **Size limits:** a maximum file size (starting value to decide, for example tens of MB) and a maximum triangle count, with a clear message.
- **Check the file really is what it says:** look at the file's first bytes (a GLB starts with the text `glTF`), not only the extension.
- **No surprises:** a `.gltf` can point to other files by address; we only accept files the user dropped together and never fetch outside addresses.
- **Compressed models** (Draco, Meshopt, KTX2 textures) need extra decoder code; decide which to support.
- **Failures are explained:** "This file is not a valid GLB", "Too many triangles (2.1 million, limit 500,000)", never a blank screen or a silent crash.
- **Validate our own data with Zod** (the asset records in the scene). The model file itself is checked by the loader and our limits.

## The Assets panel

- A list or grid of imported assets with a **thumbnail** (rendered once on import), name, size, triangle count.
- **Drag from the panel into the 3D view** to place another copy; click to place at the middle of the view.
- **Rename and delete** an asset (deleting warns if objects in the scene use it).
- A place to record the **source and licence** (many free models need credit; some forbid selling).
- Later: folders and tags, and search (like the scene list search).

## Where to get test models (free, check the licence of each file)

Sites such as Sketchfab, Poly Pizza, Kenney's asset packs and the glTF sample models offer free models, but every model has its own licence
(some need credit, some are non-commercial only). **Never bundle a model in the repository without checking its licence**, because the
repository is public. Use a small model you are allowed to share for automatic tests (for example one of the official glTF sample models; check its licence first).

## Suggested order

| Step | What                                                                                                                    | Needs                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 1    | **Import a GLB** by drag-and-drop and a button; show it as a "model" object; local storage; size limits; error messages | The asset id idea; a model object kind |
| 2    | **Assets panel** with thumbnails, placing copies, rename, delete, licence note                                          | Step 1                                 |
| 3    | **Save and load** scenes with their assets                                                                              | Phase 5 saving                         |
| 4    | glTF with separate files, compressed models, then OBJ                                                                   | Step 1                                 |
| 5    | **Export** the scene as GLB                                                                                             | Steps 1 and 3                          |
| 6    | **Unpack** a model into editable parts, and edit its materials                                                          | Mesh tools and materials               |

Steps 1 and 2 only need the asset idea and a new object kind; they do **not** need the database or accounts, so they could be built
**right after materials**, ahead of the rest of Phase 5, if you want to start placing real models soon.

## Still to research (nothing below is verified)

Check the official docs and the real latest versions before choosing, as in `CLAUDE.md`:

- Three.js's glTF loader and drei's model-loading helpers for our versions, including how they handle Draco, Meshopt and KTX2.
- How to **measure** a model (bounds, triangle count) cheaply, and how to render a **thumbnail**.
- A tool to **inspect and optimise** glTF files (for example the glTF Transform tools), if we want to shrink big imports.
- Browser storage **limits** for IndexedDB, and what happens when it is full.
- A good way to hash large files quickly in the browser.
- Which free models and licences are safe to use for demos and tests.
