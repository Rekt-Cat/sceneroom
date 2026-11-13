# Advanced 3D editing: plan

A roadmap for going beyond placing primitives: bending and deforming shapes, building custom meshes, sculpting,
and making characters and creatures. This is a **plan**, not built code. Nothing here is verified yet (see "Still to
research"). Keep this file up to date as decisions are made; record decisions in `DECISIONS.md` too.

## Where we are now

Every object in a scene is a **primitive** (cube, sphere, cylinder, plane, cone). Its shape is fixed; we only change its
transform and colour. That is enough for layouts, but not for modelling.

To model, we need the scene to hold **real mesh data** (points and triangles that the user can change), and tools that
change it. That is the big step, and almost every tool below depends on it.

## Three ways to change a shape (and why the order matters)

| Way                       | What it means                                                                                                                                                      | Unity / Blender comparison                    | Size of the data we store |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | ------------------------- |
| **Deformers** (modifiers) | A shape plus a short list of settings: "bend 40 degrees, twist 10 degrees". The shape underneath is untouched, and you can change or remove a setting at any time. | Blender modifiers; Unity shader/vertex tricks | A few numbers             |
| **Edit mode** (modelling) | Select points, edges and faces and move, extrude, inset or cut them. The mesh itself changes.                                                                      | Unity ProBuilder; Blender Edit Mode           | The whole mesh            |
| **Sculpt mode**           | Push, pull and smooth a dense mesh with brushes, like clay.                                                                                                        | Blender Sculpt Mode; ZBrush; Nomad            | A very big mesh           |

Deformers are cheap (tiny data, no mesh editing needed) and give the "bending" you asked for. So they come first.
Edit mode and sculpting need the heavy foundation below.

## The foundation (decide before building the heavy tools)

These choices are hard to change later, so they are decided early (start in Phase 5, when saving and export are designed).

1. **Editable mesh data.** A new kind of object, "mesh", that stores positions, triangles and (later) normals and UVs.
   Primitives can be turned into one ("Convert to editable mesh").
2. **Where big meshes live.** A sculpted mesh can have hundreds of thousands of points. It must not sit inside the scene JSON,
   the undo history or (later) the shared Yjs document. Plan: the scene node stores only an **id** of a mesh stored as a separate
   binary asset (IndexedDB locally, object storage later). A change creates a new version of the mesh, and the node points to it.
3. **Undo for big meshes.** Our undo keeps whole earlier scenes, which is fine for small data but too heavy for a sculpt stroke
   on 200,000 points. Mesh edits need undo by **difference** (store only the points a stroke changed, with their old values).
4. **Modes.** The editor gets modes: **Object** (what we have), **Edit** (points/edges/faces) and **Sculpt**. The toolbar and
   Inspector change with the mode.
5. **Speed.** Updating a mesh while the mouse moves must not go through React. We already do this for the gizmo (change the
   three.js object directly, write to the store when you let go); mesh tools do the same. Fast picking on dense meshes needs
   an acceleration structure (a "BVH"), and heavy work (smoothing, remeshing) belongs in a Web Worker.
6. **Collaboration (Phase 7).** Two people editing the same mesh at once is hard. First version: **one person at a time per
   mesh** (a mesh is "taken" while someone is in Edit or Sculpt mode on it), the same idea as our lock. Deformer settings are
   small numbers and merge fine.

## The tools, in the order we would build them

### A. Deformers (modifier stack): the "bending" part

A list of non-destructive deformers on an object, editable in the Inspector, each with sliders (we already have value dragging).

- **Bend, Twist, Taper, Stretch / Squash**, each with an axis and an amount.
- **Noise / Displace** (rough surfaces, rocks), **Mirror**, **Array** (repeat along a line or circle), **Subdivide** (smoother).
- Primitives get **segment counts** (how many slices), since a plane with 1 square cannot bend.
- An **Apply** button turns the result into real mesh data (this is the bridge to Edit mode).
- Undo is cheap: each change is a small settings change.

### B. Environment-building tools (useful early, need little new data)

- **Boolean** (union / subtract / intersect) to cut doors, caves and holes.
- **Scatter / instancing**: spread trees, rocks or grass over a surface with random size and rotation.
- **Terrain**: a heightmap plane you can raise, lower and smooth; paint where grass or rock goes.
- **Align and distribute**, snapping to other objects, groups and reusable "prefabs".
- **Curves / splines** for roads, rivers, cables, tentacles (a tube that follows a path).

### C. Edit mode (modelling)

- Select **points, edges, faces**; move, rotate, scale them with our existing gizmo.
- **Extrude, inset, bevel, loop cut, knife, merge, delete, bridge, fill hole.**
- **Soft selection** (move a point and nearby points follow, fading out).
- **Mirror editing** (work on one half of a character, the other half follows).
- Basic **UV unwrap** and seam marking, so textures can be applied.

### D. Sculpt mode

- Brushes: **Draw / Clay, Smooth, Grab, Inflate, Pinch, Flatten, Crease**, plus **Mask**.
- Brush **size, strength, falloff**, **symmetry**, and pen **pressure** where the device supports it.
- A way to add detail where needed: **dynamic topology** (the mesh adds triangles under the brush) or **remesh** (rebuild evenly).
  This is the hardest part; the first version may use a fixed dense mesh with a limit on triangle count.
- Undo per stroke, using the difference method above.
- **Vertex colour painting** next to sculpting (colour on points, no UVs needed).

### E. Characters and creatures

- A **base library** (a starter human, a creature kit) to sculpt from, instead of a blank sphere.
- **Skeleton (bones)** with **weights** (which bone moves which points); **auto-weights**, then paint to fix.
- **Posing** with bones (and simple **IK**: drag a hand, the arm follows).
- **Morph targets** (blend shapes) for faces and body shapes.
- **Reference images** placed in the 3D view to model from.
- Export a character as **GLB with skeleton and morphs** (Phase 5 export must plan for this).
- Animation (a timeline) is a separate, later project.

### F. Materials, surfaces and viewing aids for all of the above

What an object's **Appearance** can grow into, in the order we would add it:

1. **Done:** colour, roughness, metalness.
2. **Surface and shading** (next, small, fits what we have; planned after model import and before lights):
   **Emissive** (glow), **Opacity** (solid, see-through, cut-out), **Double-sided**, **Smooth or flat shading** (with an angle limit), **Cast and receive shadow** switches, **Reflection strength**.
   First the material values move into a `material` section of the scene data, so that shared materials and material slots (below) fit later without another change.
3. **Needs the asset system (Phase 5):** **texture maps** (base colour, normal, roughness, metalness, occlusion, height, emissive) with tiling, offset and strength; **material presets** (plastic, gold, rubber, glass, skin, your own); **shared materials** (many objects use one material).
4. **Advanced surfaces** (cars, creatures, characters): **clearcoat** (car paint), **transmission, refraction and thickness** (glass, water, gems), **sheen** (cloth), **subsurface or translucency** (skin, wax; the web only has approximations), **anisotropy** (brushed metal), **iridescence**; and **material slots**, meaning one mesh with several materials (skin, clothes and eyes on a character; body, glass and tyres on a car), which imported models already need.
   three.js's physical material is expected to cover most of these, and glTF has matching extensions; to verify against the installed versions.
5. **Viewing aids for modelling and sculpting** (viewport settings, mostly not per object; added with Edit mode and Sculpting): **shading modes** (solid, material, wireframe, **matcap**, the flat clay look sculptors use), **show edges** (wireframe overlay), **show normals**, **X-ray**, a **UV checker** texture, **vertex colours** (view and paint), and stylised looks (toon shading, outlines, rim light).
6. **Painting:** texture painting and decals (needs textures and the mesh tools).

Unity comparison: Unity's "Smoothness" is the opposite of our Roughness (1 minus it). Items in step 4 are what its HDRP Lit shader offers.

## Proposed order

| When                                | What                                                                                                    | Why here                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Phase 4 (as planned)                | Lights, materials, environment settings                                                                 | Makes scenes look good; sets up the Inspector for sliders                     |
| Phase 5 (as planned) + **new**      | Save and export, plus **design the mesh data format and where meshes are stored**                       | Custom meshes must survive a reload and export; choosing this later is costly |
| **New Phase 11: Deformers**         | Segments on primitives, the modifier stack (Bend, Twist, Taper, Noise, Mirror, Array, Subdivide), Apply | Biggest visible gain for little data; can ship before collaboration           |
| **New Phase 12: Environment tools** | Boolean, scatter, terrain, splines, align / snap, prefabs                                               | You want to build environments; mostly builds on the mesh format              |
| **New Phase 13: Edit mode**         | Point / edge / face editing and the modelling operations                                                | Needs editable meshes and difference-based undo                               |
| **New Phase 14: Sculpting**         | Brushes, symmetry, remeshing, vertex colours                                                            | Needs the speed work (BVH, workers) and big-mesh storage                      |
| **New Phase 15: Characters**        | Base meshes, skeleton and weights, posing, morphs, character export                                     | Builds on sculpt and export                                                   |

The new phases (11 to 15) come after the collaboration, accounts, deployment and polish phases (6 to 10) in the current plan, **except Deformers (Phase 11)**, which
are small enough to do right after Phase 5 if you want the bending sooner. Change this order whenever priorities change.

## Risks to keep in mind

- **Sculpting in the browser has limits.** JavaScript and WebGL on a laptop can handle a few hundred thousand triangles with care, not
  millions. We will set a triangle limit and say so in the app.
- **Remeshing and boolean operations are hard to get right** (holes, flipped faces). Use a proven library, not our own code.
- **Free hosting limits.** Big meshes and textures use storage and bandwidth; object storage free tiers are limited (to check).
- **Collaboration on meshes** is the hardest combination here. Start with "one editor per mesh".
- **Scope.** Each of D and E is a big product on its own. Ship A, B and C first; they already make a very capable scene editor.

## Still to research (nothing below is verified)

Before choosing any of these, read the official docs and check the real latest version and licence, as in `CLAUDE.md`:

- A **BVH** library for fast picking on dense meshes (for example `three-mesh-bvh`).
- A **boolean / CSG** library for three.js (for example `three-bvh-csg`).
- Whether to write our own **half-edge mesh** structure for Edit mode or use an existing one.
- Existing **open-source sculpting** code to learn from (for example SculptGL; check its licence before copying anything).
- How **Yjs** handles large binary data, for the collaboration design.
- **Skeletons and skinning** in three.js and in GLB export.
- Browser **limits** on memory and triangle counts on typical laptops and phones.
