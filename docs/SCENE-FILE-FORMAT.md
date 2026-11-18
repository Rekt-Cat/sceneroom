# The SceneRoom file (`.sceneroom`)

A project (all its scenes) and the model and mesh files they use, in one file you can keep, send and open again.
Written by Save (Ctrl or Cmd + S, the whole project) or "Save this scene as a file" (one scene, in the scene tab's menu),
and read by Open (replaces the project) or "Add scenes from a file" (the `+` menu next to the scene tabs; adds the scenes
and replaces nothing). Dropping a file on the 3D view is Open. Code: `packages/shared/src/sceneFile.ts` (pure, tested) and
`apps/web/src/sceneFile/sceneFileActions.ts` (reading and writing in the browser).

## Layout

All numbers are little-endian, like a GLB file.

| Bytes            | What                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| 0 to 3           | The letters `SCNR`                                                                                            |
| 4 to 7           | Version of this layout (whole number, now `2`)                                                                |
| 8 to 11          | `N`: the length of the header in bytes                                                                        |
| 12 to 12 + N     | The header: JSON text (UTF-8) `{ "project": <the project>, "assets": [{ "id": "...", "bytes": 1234 }, ...] }` |
| after the header | The model files, one after another, in the order of the `assets` list, each exactly `bytes` long              |

- `project` is the same data the browser autosaves (`projectSchema` in `project.ts`): the project name, which scene is
  open, and every scene (`id`, `name` and the scene itself: objects, modifiers, lights, environment, and the list of
  imported files with their names and notes).
- A scene that edits a prefab has `prefabId` (the prefab it shows); ordinary scenes do not.
- `project.prefabs` holds the project's prefabs (reusable objects with their inside and the records of their files). A project without it loads with none. Files that only a prefab uses are in the `assets` list too.
- **A file used by several scenes is stored once.** The `assets` list holds each file id one time, however many scenes
  mention it.
- **Version 1** (before projects) had `{ "scene": ..., "assets": ... }` with one scene. It still opens: it becomes a project
  with one scene called "Scene 1". Files are always written as version 2.
- A model file is stored under its id, which is the SHA-256 of its contents. Opening checks that each file really has that
  id, so a changed file is refused.
- The model files are not inside the JSON because as text they would be a third bigger and slow to read.

## Editable meshes in the file

An editable mesh (see "Apply modifiers" and "Convert to mesh" in the Inspector) is stored like a model file: as one
of the data blobs after the header, listed in `assets` with `type: "mesh"` in the scene. Its bytes (code:
`packages/shared/src/meshData.ts`):

| Bytes         | What                                                 |
| ------------- | ---------------------------------------------------- |
| 0 to 3        | The letters `SRMH`                                   |
| 4 to 7        | Version of the mesh layout (now `1`)                 |
| 8 to 11       | `P`: the number of points                            |
| 12 to 15      | `I`: the number of triangle corners (3 per triangle) |
| next `P * 12` | The points: x, y, z as 32-bit floats                 |
| next `I * 4`  | The corners: point numbers as 32-bit whole numbers   |

**Version 2 (edge creases)** is written only for a mesh that has some, so a mesh without creases keeps its version 1
bytes and its id. It adds `C`, the number of creases, at bytes 16 to 19 (the points then start at byte 20), and after
the corners: `C * 4` bytes of first points, `C * 4` bytes of second points (32-bit whole numbers, the two ends of a
creased edge), then `C` bytes of values (0 to 255 for 0 to 1). Both versions are read. A crease on a point that does not
exist, a crease value out of range and a header that claims too many creases are refused.

**Version 3 (UVs)** is written only for a mesh that has a UV map, so every mesh without one keeps its version 1 or 2
bytes and its id. Its header is 24 bytes: `C`, the number of creases (0 for none), at bytes 16 to 19, then a set of flags
at bytes 20 to 23 (bit 0: the mesh has UVs; the other bits are free for seams, which come next). The points start at
byte 24. After the corners come the creases (as in version 2) and then `P * 8` bytes: the UV of every point, `u` and `v`
as 32-bit floats. All three versions are read. UVs that do not match the points (two numbers for each) or are not finite
numbers are refused, as is a size that does not match. See `docs/UVS-AND-SEAMS.md`.

The id of a mesh is the SHA-256 of exactly these bytes. Normals are not stored; they are worked out from the triangles.
A mesh that no object uses is not saved (the editor keeps old versions in memory only so Undo can bring them back).
Opening checks a mesh like a model: the layout, the sizes against the header (before allocating anything), that every
number is finite, that no triangle uses a point that does not exist, and the fingerprint.

## Rules when opening (the file is outside data)

- Larger than 250 MB: refused before it is read.
- Wrong letters, a newer version, a header that does not fit, a header that is not JSON of the right shape, a scene that
  does not pass the same checks as the autosave, a model file that is not a real GLB, a mesh that is not valid mesh data, a file that is cut short or has data
  after the end, a model file listed twice: each is refused with a plain message. Nothing is changed in the editor.
- Model files the scene does not mention are ignored. Model files the scene mentions but the file does not contain are
  allowed: those models show as red boxes.
- Opening asks before replacing a project that has anything in it (any scene; it cannot be undone), then clears every
  undo history. "Add scenes from a file" asks nothing: the scenes get new ids and, if a name is taken, "Name (2)"; it
  is refused (and nothing is stored) if the project would pass 50 scenes.
- A scene that is not valid is named by its place in the file ("scenes.1.scene.nodes.a"), so the damaged scene can be found.

## Changing the format later

Older files must keep opening. Add new fields to the scene with defaults (as everything so far), and raise the version
number only when the layout above changes. A newer file in an older app gets a clear "update the app" message.
