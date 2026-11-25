# Plan: UVs, seams and difference-based undo (Phase 13, step 8)

Planned 2026-11-18. Written for the owner (learning web development, knows Unity). Nothing here is built yet.

## What it is, in plain words

- A **UV** is a flat map of a 3D surface: every point of the mesh gets two numbers (u, v, each from 0 to 1) saying where it lies on a flat picture. A texture is wrapped round the mesh through this map. (Unity: the UV channel of a mesh; the Shader sees it as `uv`.)
- A **seam** is an edge where the surface is "cut" so it can lie flat, like the seams of a shirt. A cube needs cuts to be laid flat; a sphere needs at least one.
- **Unwrapping** is laying the surface flat along the seams. An **island** is one flat piece. **Packing** is fitting all islands into the 0 to 1 square.
- A **checker view** paints a checkerboard on the object. If the squares are the same size everywhere and not stretched, the UVs are good. It is the quickest way to see a bad map.
- Why now: painting colours onto the surface and baking (step 10) need UVs, and materials with textures (Phase 4, later) need them too.

## What the owner will see (beginner first: three controls, the rest folded away)

A **UV** group in the edit panel (a new row, like Fix up):

1. **Unwrap**: one button. It makes a sensible map by itself (no seams needed) and packs it. This is what 90 percent of people need.
2. **Checker**: a switch in the View group. Shows the checkerboard on the object; works on any object, also before anything was unwrapped (built-in shapes already have UVs).
3. **UV window**: a small floating panel in the corner of the 3D view that draws the map: islands as outlines, seams, and a colour for how stretched each face is (green fine, red bad). Read-only at first.

Under **Advanced** (folded): **Mark seam / Clear seam** (edge mode, like creases), **Unwrap along seams** (cleaner result for models that will be painted), **Pack**, and the margin between islands. Every value has a reset button, every button a tooltip in plain words ("Unwrap: lay the surface flat, like a sewing pattern").

## How it is stored

- **Mesh format** (`meshData.ts`): today a mesh is points, triangles and optional creases (SRMH versions 1 and 2). Version 3 adds, only when present: UVs (2 floats per point, so +8 bytes per point) and seams (edges, like creases). A mesh without them keeps its old bytes and fingerprint, so nothing existing changes.
- **Points are per corner already** (a cube side has its own points). A UV needs one value per point, so where a seam cuts through a place where faces share a point, **the point is split in two** (same position, different UV). The tools that find "points on the same spot" (`weldGroups`) already treat those as one, so moving a point still moves both.
- **Seams** are a list of point pairs, handled like creases (the same select-edges-and-mark code, drawn in another colour).
- **Three.js and GLB:** the geometry gets a `uv` attribute when the mesh has UVs; GLB export already writes `uv` when a geometry has it (to be proven by a round-trip test). Imported models keep their own UVs untouched.

## How it is computed (pure functions in `packages/shared`, each with tests)

1. **Islands:** faces joined across non-seam edges (union-find on the topology layer). No seams means one island per smooth chart (see 2).
2. **Smart unwrap (the one-button method, first):** group faces into charts by direction (a face joins a chart while it stays within about 66 degrees of the chart's average direction), project each chart flat onto its average plane. Fast, always works, a little distortion; good for boxes, walls, props.
3. **Unwrap along seams (second, the careful method):** least-squares conformal maps (LSCM): keeps angles, so textures do not shear. Needs an island with a border (cut a closed shape first), two pinned points, and a sparse linear solve (conjugate gradient, no library). It refuses a closed island with a plain message ("mark seams so the shape can be laid flat, like cutting a cube along its edges") and checks for flipped faces afterwards.
4. **Pack:** islands are scaled so the surface gets the same texture detail everywhere, then packed into the square with a margin (shelf packing first; rotation by 90 degrees later). Margin default 2 percent; leaks between islands are what the margin prevents when painting.
5. **Quality:** per face, area stretch and angle distortion (UV area against 3D area; angle error). Drives the colours in the UV window.

## What other tools do with UVs (the hidden cost)

Every tool that makes or moves points has to say what happens to UVs. Plan: **first version, a tool that does not know UVs removes them and says so** ("UVs were removed by Bevel; unwrap again"). Wrong UVs are worse than none. Sub-step 5 then taught the tools one by one; this is where each one stands now. A tool that is added later and forgets the map still gets the message (the safety net is in `commitMesh`):

| Tool                               | What it does with the map (built in sub-step 5)                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Move, rotate, scale points         | UVs unchanged (the surface moved, the map did not)                                                                                             |
| Delete points / faces, Merge, Weld | the points that stay keep their UVs (renumbered); a merged point keeps the UV of the point it became                                           |
| Flip, Bridge                       | the same points keep the same UVs (flipped faces show as turned over in the Stretch view)                                                      |
| Fill hole                          | the new middle point lies at the middle of the rim's UVs                                                                                       |
| Loop cut, Divide                   | new points are interpolated exactly along the edge or across the face (tested with a map that is a straight-line function of position)         |
| Bevel                              | a cut point takes the UV of its own face's corner; a strip point lies between the two faces' UVs; a corner fill point is the average           |
| Extrude, Inset, edge extrude       | the cap and the walls copy the UV of the point they came from: the cap is right, the walls are smeared until you unwrap again (red in Stretch) |
| Modifiers: Mirror, Array, Thicken  | Mirror and Array copy the map onto the copies; Thicken copies it to the inner shell and the walls                                              |
| Smooth modifier                    | **still removes the map**: it merges points that share a spot, so a UV seam cannot survive it without a bigger change                          |

## Difference-based undo (step 8b, shared with sculpting)

Today each mesh edit stores a **whole new mesh** under its fingerprint, and the old one stays, which makes Undo cheap and simple. That is fine for editing (thousands of points) but not for sculpting, where one brush stroke would store megabytes (a 200 000 point mesh is about 2.4 MB per stroke).

- When an edit keeps the same triangles and only moves points, store a **patch**: the numbers of the points that changed and their old and new positions. History entries refer to the patch; undo and redo apply it to the mesh in memory.
- Edits that change the topology (extrude, divide) keep storing whole meshes.
- A budget (for example 200 MB of patches) with the oldest steps dropped and a message, and clean-up of stored meshes that no history step or scene uses.
- Pure and tested first (`diffPoints`, `applyPatch`, round trips), then wired into `commitMesh` only for big meshes (above about 20 000 points), so small meshes keep today's simple behaviour.

## Order of work (each step ends with tests, docs and a browser check)

_Status (2026-11-20): steps 1 to 5 are built and merged (Smooth still drops the map), step 6 is built and merged (snap is not), step 7 is built on `feature/diff-undo`._

1. **(built)** **Checker view and UV data** (small): the Checker switch; geometry builder keeps and writes `uv`; mesh format v3 reads and writes UVs (round-trip and old-file tests); the rule "tools that do not know UVs remove them, with a message". _Useful at once:_ the checker works on every built-in shape.
2. **(built)** **Seams:** mark and clear in edge mode, drawn in the 3D view, saved with the mesh; tests like creases.
3. **(built)** **Smart unwrap and pack, and the read-only UV window:** the one-button Unwrap works end to end.
4. **(built)** **Unwrap along seams (LSCM) and the stretch colours.**
5. **(built, except Smooth)** **Teach the tools UVs**, in the order of the table above.
6. **(built, except snap)** **UV window editing:** click a piece to choose it (Shift adds), drag to move, buttons to turn a quarter turn, mirror, make bigger or smaller, and Pack all pieces again. Pure functions in `uvEdit.ts` (`transformUvIslands`, `packUvIslands`, `uvIslandAt`); only the map changes, one undo step each. A mirrored piece counts as turned over in the Stretch view, which is correct (the texture is reversed). Tested with a crate in Playwright.
7. **(built)** **Step 8b, difference-based undo:** see `meshPatch.ts` and `meshStorage.ts`. Built for moves of points on meshes of 20 000 points or more; the budget with dropped oldest steps and the clean-up of unused stored meshes are not built.

## Risks and unknowns (said honestly)

- LSCM on messy meshes (flipped triangles, tiny faces) can fail or fold over; it needs good checks and clear refusals. Smart unwrap is the safety net.
- Splitting points along seams changes point numbers; every tool that stores point numbers (creases, selection, sessions) must follow the renumbering, as they already do for delete.
- File size grows by 8 bytes per point for meshes with UVs; fine at editing sizes.
- Painting and baking (step 10) will set the quality bar for margins and texel density; the margin and density settings are built in now so they are not redone.

## Decisions for the owner before building

1. **First unwrap method.** Suggested: Smart unwrap first (always works), then LSCM along seams.
2. **Tools that do not know UVs.** Suggested: they remove UVs with a message at first, and learn UVs later one by one (the table above).
3. **Where the UV window lives.** Suggested: a small floating panel in the corner of the 3D view (the right panel is already long).
4. **When UVs are made.** Suggested: only when asked (Unwrap), never automatically on Make mesh.
5. **Order against sculpting.** UVs first (this plan), then difference-based undo, then Phase 14.

## Out of scope for now

Painting and baking (step 10), pinning and relaxing points in the UV window, several UV sets per mesh, UDIM tiles, and importing a picture to preview on the object (comes with materials and textures, Phase 4).

Diagram of the built steps 1 to 4: `docs/diagrams/editor/uvs-and-seams.svg`.
