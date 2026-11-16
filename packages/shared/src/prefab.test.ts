import { describe, expect, it } from "vitest";
import {
  MAX_PREFABS,
  collectProjectModels,
  createEmptyScene,
  createNode,
  addNode,
  addAsset,
  createModelNode,
  createPrefab,
  createPrefabScene,
  duplicateNodes,
  isEffectivelyLocked,
  pasteFromClipboard,
  copyToClipboard,
  placePrefab,
  prefabFromScene,
  prefabInstanceIds,
  prefabSchema,
  projectAssetUsage,
  rebuildAsInstance,
  samePrefabContent,
  syncPrefabInstances,
  unlinkPrefab,
  unlinkPrefabInstance,
  whyCannotMakePrefab,
  type AssetInfo,
  type Scene,
} from "./index";

function counter(prefix = "n") {
  let n = 0;
  return () => `${prefix}${++n}`;
}

const info = (id: string): AssetInfo => ({
  id,
  name: "Car",
  type: "model",
  bytes: 10,
  triangles: 3,
  boundsMin: [0, 0, 0],
  boundsMax: [1, 1, 1],
  note: "",
});

/** A "house": a cube with a child cone (the roof) and a model. */
function houseScene(): Scene {
  let scene = addAsset(createEmptyScene(), info("car"));
  scene = addNode(scene, { ...createNode("house", "cube"), name: "House" });
  scene = addNode(scene, {
    ...createNode("roof", "cone"),
    name: "Roof",
    parentId: "house",
  });
  scene = addNode(scene, {
    ...createModelNode("car", "Car", "car", 1),
    parentId: "house",
  });
  return scene;
}

const makeHouse = () => createPrefab(houseScene(), "house", "p1")!;

describe("making a prefab", () => {
  it("takes the object and everything inside it, parent first, with the files it uses", () => {
    const prefab = makeHouse();
    expect(prefab.name).toBe("House");
    expect(prefab.nodes.map((n) => n.id)).toEqual(["house", "roof", "car"]);
    expect(prefab.nodes[0]!.parentId).toBeNull();
    expect(prefab.assets.map((a) => a.id)).toEqual(["car"]);
    expect(prefab.revision).toBe(1);
    expect(prefabSchema.safeParse(prefab).success).toBe(true);
  });

  it("a child of something becomes the top of its own prefab", () => {
    const prefab = createPrefab(houseScene(), "roof", "p2")!;
    expect(prefab.nodes).toHaveLength(1);
    expect(prefab.nodes[0]!.parentId).toBeNull();
  });

  it("refuses an object that is a copy of a prefab, or has one inside it, saying why", () => {
    const prefab = makeHouse();
    const placed = placePrefab(createEmptyScene(), prefab, "i1", counter());
    expect(whyCannotMakePrefab(placed, "i1")).toContain("copy of a prefab");
    const outer = addNode(placed, {
      ...createNode("outer", "cube"),
      name: "Outer",
    });
    const nested = {
      ...outer,
      nodes: {
        ...outer.nodes,
        i1: { ...outer.nodes["i1"]!, parentId: "outer" },
      },
    };
    expect(whyCannotMakePrefab(nested, "outer")).toContain(
      "inside it is a copy",
    );
    expect(createPrefab(nested, "outer", "p3")).toBeNull();
    expect(whyCannotMakePrefab(placed, "missing")).toContain(
      "no longer exists",
    );
    expect(whyCannotMakePrefab(placed, "i1", MAX_PREFABS)).toContain("at most");
  });
});

describe("instances", () => {
  it("places a linked copy: its own id, unique name, the chosen position, inside locked, files added", () => {
    const placed = placePrefab(
      createEmptyScene(),
      makeHouse(),
      "i1",
      counter(),
      {
        position: [5, 0, 2],
      },
    );
    expect(Object.keys(placed.nodes)).toHaveLength(3);
    const root = placed.nodes["i1"]!;
    expect(root.name).toBe("House");
    expect(root.transform.position).toEqual([5, 0, 2]);
    expect(root.prefab).toEqual({ id: "p1" });
    expect(root.locked).toBe(false);
    const inside = Object.values(placed.nodes).filter((n) => n.id !== "i1");
    expect(inside.every((n) => n.locked && n.prefab === null)).toBe(true);
    expect(inside.every((n) => isEffectivelyLocked(placed, n.id))).toBe(true);
    expect(placed.assets["car"]).toBeDefined();
    expect(inside.find((n) => n.kind === "model")?.assetId).toBe("car");
  });

  it("a second instance gets a numbered name and does not share ids", () => {
    const next = counter();
    let scene = placePrefab(createEmptyScene(), makeHouse(), "i1", next);
    scene = placePrefab(scene, makeHouse(), "i2", next);
    expect(scene.nodes["i2"]!.name).not.toBe(scene.nodes["i1"]!.name);
    expect(Object.keys(scene.nodes)).toHaveLength(6);
    expect(prefabInstanceIds(scene, "p1").sort()).toEqual(["i1", "i2"]);
  });

  it("unlink makes it an ordinary object whose inside can be edited", () => {
    let scene = placePrefab(
      createEmptyScene(),
      makeHouse(),
      "i1",
      counter("c"),
    );
    scene = unlinkPrefabInstance(scene, "i1");
    expect(scene.nodes["i1"]!.prefab).toBeNull();
    expect(
      Object.values(scene.nodes).every(
        (n) => !isEffectivelyLocked(scene, n.id),
      ),
    ).toBe(true);
  });

  it("the object a prefab was made from can be turned into a copy in place", () => {
    const scene = houseScene();
    const prefab = createPrefab(scene, "house", "p1")!;
    const next = rebuildAsInstance(scene, "house", prefab, counter("r"));
    expect(next.nodes["house"]!.prefab).toEqual({ id: "p1" });
    expect(next.nodes["house"]!.name).toBe("House");
    const inside = Object.values(next.nodes).filter((n) => n.id !== "house");
    expect(inside).toHaveLength(2);
    expect(inside.every((n) => n.locked)).toBe(true);
    // the old inside ids are gone
    expect(next.nodes["roof"]).toBeUndefined();
  });
});

describe("editing a prefab in its own scene", () => {
  it("the scene holds the prefab exactly, and reading it back gives the same content", () => {
    const prefab = makeHouse();
    const scene = createPrefabScene(prefab);
    expect(Object.keys(scene.nodes)).toEqual(["house", "roof", "car"]);
    expect(scene.assets["car"]).toBeDefined();
    const back = prefabFromScene(scene, prefab);
    expect(back.ok && samePrefabContent(back.prefab, prefab)).toBe(true);
    expect(back.ok && back.extraTopLevel).toEqual([]);
    expect(back.ok && back.prefab.revision).toBe(2);
  });

  it("a change in the scene becomes a new prefab, and syncing updates every copy", () => {
    const prefab = makeHouse();
    const editing = createPrefabScene(prefab);
    const edited = {
      ...editing,
      nodes: {
        ...editing.nodes,
        roof: { ...editing.nodes["roof"]!, color: "#ff0000" },
      },
    };
    const withWindow = addNode(edited, {
      ...createNode("window", "cube"),
      name: "Window",
      parentId: "house",
    });
    const result = prefabFromScene(withWindow, prefab);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(samePrefabContent(result.prefab, prefab)).toBe(false);
    expect(result.prefab.nodes).toHaveLength(4);

    // a scene with two copies, one renamed, scaled and moved
    const next = counter("a");
    let other = placePrefab(createEmptyScene(), prefab, "i1", next, {
      position: [9, 0, 0],
    });
    other = placePrefab(other, prefab, "i2", next);
    other = {
      ...other,
      nodes: {
        ...other.nodes,
        i1: {
          ...other.nodes["i1"]!,
          name: "Home",
          transform: { ...other.nodes["i1"]!.transform, scale: [2, 2, 2] },
        },
      },
    };
    const synced = syncPrefabInstances(other, result.prefab, next);
    const root = synced.nodes["i1"]!;
    expect(root.name).toBe("Home");
    expect(root.transform.position).toEqual([9, 0, 0]);
    expect(root.transform.scale).toEqual([2, 2, 2]);
    expect(root.prefab).toEqual({ id: "p1" });
    const roofs = Object.values(synced.nodes).filter((n) => n.name === "Roof");
    expect(roofs.map((n) => n.color)).toEqual(["#ff0000", "#ff0000"]);
    expect(
      Object.values(synced.nodes).filter((n) => n.name === "Window"),
    ).toHaveLength(2);
    expect(Object.keys(synced.nodes)).toHaveLength(8);
  });

  it("other top-level objects in the scene are not part of the prefab, and are reported", () => {
    const prefab = makeHouse();
    const scene = addNode(
      createPrefabScene(prefab),
      createNode("extra", "sphere"),
    );
    const result = prefabFromScene(scene, prefab);
    expect(result.ok && result.prefab.nodes.map((n) => n.id)).toEqual([
      "house",
      "roof",
      "car",
    ]);
    expect(result.ok && result.extraTopLevel).toEqual(["extra"]);
  });

  it("refuses, saying why, when the top object was deleted", () => {
    const prefab = makeHouse();
    const scene = createPrefabScene(prefab);
    const { house, ...rest } = scene.nodes;
    void house;
    const result = prefabFromScene({ ...scene, nodes: rest }, prefab);
    expect(!result.ok && result.reason).toContain("not in this scene any more");
  });

  it("refuses a copy of a prefab inside the prefab (no prefabs inside prefabs yet, so no cycle)", () => {
    const prefab = makeHouse();
    let scene = createPrefabScene(prefab);
    scene = placePrefab(scene, prefab, "self", counter("s"), {
      parentId: "house",
    });
    const result = prefabFromScene(scene, prefab);
    expect(!result.ok && result.reason).toContain("copy of a prefab");
  });

  it("syncing keeps an instance's parent and its place among its neighbours", () => {
    const prefab = makeHouse();
    const next = counter("a");
    let scene = addNode(createEmptyScene(), createNode("group", "cube"));
    scene = placePrefab(scene, prefab, "i1", next, { parentId: "group" });
    scene = addNode(scene, { ...createNode("sib", "cube"), parentId: "group" });
    const before = scene.nodes["i1"]!.order;
    const synced = syncPrefabInstances(scene, prefab, next);
    expect(synced.nodes["i1"]!.parentId).toBe("group");
    expect(synced.nodes["i1"]!.order).toBe(before);
    expect(synced.nodes["sib"]).toBeDefined();
  });

  it("syncing a scene with no copies returns the same scene", () => {
    const scene = houseScene();
    expect(syncPrefabInstances(scene, makeHouse(), counter())).toBe(scene);
  });
});

describe("deleting a prefab and copying", () => {
  it("unlinking a whole prefab frees every copy", () => {
    let scene = placePrefab(
      createEmptyScene(),
      makeHouse(),
      "i1",
      counter("z"),
    );
    scene = unlinkPrefab(scene, "p1");
    expect(Object.values(scene.nodes).every((n) => n.prefab === null)).toBe(
      true,
    );
    expect(
      Object.values(scene.nodes).every(
        (n) => !isEffectivelyLocked(scene, n.id),
      ),
    ).toBe(true);
  });

  it("a copy of a copy (duplicate or paste) is still a copy", () => {
    const scene = placePrefab(
      createEmptyScene(),
      makeHouse(),
      "i1",
      counter("c"),
    );
    const dup = duplicateNodes(scene, ["i1"], counter("d"));
    expect(dup.scene.nodes[dup.rootIds[0]!]!.prefab).toEqual({ id: "p1" });
    const clip = copyToClipboard(scene, ["i1"], "copy")!;
    const pasted = pasteFromClipboard(scene, clip, counter("p"), {
      parentId: null,
    });
    expect(pasted.scene.nodes[pasted.rootIds[0]!]!.prefab).toEqual({
      id: "p1",
    });
  });
});

describe("shared files across scenes", () => {
  it("lists each imported model once, the first scene's record winning", () => {
    const a = addAsset(createEmptyScene(), { ...info("m1"), name: "A's name" });
    let b = addAsset(createEmptyScene(), { ...info("m1"), name: "B's name" });
    b = addAsset(b, info("m2"));
    const mesh: AssetInfo = { ...info("mesh1"), type: "mesh" };
    b = addAsset(b, mesh);
    const list = collectProjectModels([a, b]);
    expect(list.map((i) => [i.id, i.name])).toEqual([
      ["m1", "A's name"],
      ["m2", "Car"],
    ]);
  });

  it("counts objects and scenes per file over the whole project", () => {
    let a = addAsset(createEmptyScene(), info("m1"));
    a = addNode(a, createModelNode("x", "Car", "m1", 1));
    a = addNode(a, createModelNode("y", "Car", "m1", 1));
    let b = addAsset(createEmptyScene(), info("m1"));
    b = addNode(b, createModelNode("z", "Car", "m1", 1));
    expect(projectAssetUsage([a, b])).toEqual({
      m1: { objects: 3, scenes: 2 },
    });
  });
});
