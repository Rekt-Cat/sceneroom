# The SceneRoom file (`.sceneroom`)

A scene and the model files it uses, in one file you can keep, send and open again. Written by Save (Ctrl or Cmd + S)
and read by Open (or by dropping the file on the 3D view). Code: `packages/shared/src/sceneFile.ts` (pure, tested) and
`apps/web/src/sceneFile/sceneFileActions.ts` (reading and writing in the browser).

## Layout

All numbers are little-endian, like a GLB file.

| Bytes            | What                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| 0 to 3           | The letters `SCNR`                                                                                        |
| 4 to 7           | Version of this layout (whole number, now `1`)                                                            |
| 8 to 11          | `N`: the length of the header in bytes                                                                    |
| 12 to 12 + N     | The header: JSON text (UTF-8) `{ "scene": <the scene>, "assets": [{ "id": "...", "bytes": 1234 }, ...] }` |
| after the header | The model files, one after another, in the order of the `assets` list, each exactly `bytes` long          |

- `scene` is the same data the browser autosaves (`sceneSchema` in `scene.ts`): objects, modifiers, lights, environment,
  and the list of imported files with their names and notes.
- A model file is stored under its id, which is the SHA-256 of its contents. Opening checks that each file really has that
  id, so a changed file is refused.
- The model files are not inside the JSON because as text they would be a third bigger and slow to read.

## Rules when opening (the file is outside data)

- Larger than 250 MB: refused before it is read.
- Wrong letters, a newer version, a header that does not fit, a header that is not JSON of the right shape, a scene that
  does not pass the same checks as the autosave, a model file that is not a real GLB, a file that is cut short or has data
  after the end, a model file listed twice: each is refused with a plain message. Nothing is changed in the editor.
- Model files the scene does not mention are ignored. Model files the scene mentions but the file does not contain are
  allowed: those models show as red boxes.
- Opening asks before replacing a scene that is open (it cannot be undone), then clears the undo history.

## Changing the format later

Older files must keep opening. Add new fields to the scene with defaults (as everything so far), and raise the version
number only when the layout above changes. A newer file in an older app gets a clear "update the app" message.
