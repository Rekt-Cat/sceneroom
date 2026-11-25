import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHARACTER,
  DEFAULT_PLANT,
  LOCAL_ORIGIN,
  applySceneChange,
  createEmptyScene,
  createNode,
  lightSchema,
  modifierSchema,
  plainEqual,
  readNodeFromDoc,
  readSceneFromDoc,
  setMaterial,
  setTransform,
  writeSceneToDoc,
  type AssetInfo,
  type Scene,
} from "./index";
import { addAsset, addNode, removeNode, updateNode } from "./sceneOps";
import { setEnvironment } from "./environment";

/** A scene using every kind of field: parent, modifiers, light, plant, character, file link, non-default material. */
function richScene(): Scene {
  let scene = createEmptyScene();
  const asset: AssetInfo = {
    id: "hash-1",
    name: "Chair",
    type: "model",
    bytes: 1234,
    triangles: 40,
    boundsMin: [-1, 0, -1],
    boundsMax: [1, 2, 1],
    note: "CC0",
  };
  scene = addAsset(scene, asset);
  scene = addNode(scene, createNode("a", "cube"));
  scene = addNode(scene, {
    ...createNode("b", "sphere"),
    parentId: "a",
    order: 2,
    modifiers: [modifierSchema.parse({ id: "m1", type: "bend", angle: 30 })],
  });
  scene = addNode(scene, {
    ...createNode("c", "cone"),
    kind: "point",
    light: lightSchema.parse({}),
  });
  scene = addNode(scene, {
    ...createNode("d", "cube"),
    kind: "plant",
    plant: DEFAULT_PLANT,
  });
  scene = addNode(scene, {
    ...createNode("e", "cube"),
    kind: "character",
    character: DEFAULT_CHARACTER,
  });
  scene = addNode(scene, {
    ...createNode("f", "cube"),
    kind: "model",
    assetId: "hash-1",
  });
  scene = setMaterial(scene, "a", { roughness: 0.2, colorMap: "tex-1" });
  return setEnvironment(scene, { fogEnabled: true, sunAzimuth: 123 });
}

/** Sends everything one document knows to another (what a server does). */
function sync(from: Y.Doc, to: Y.Doc): void {
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from, Y.encodeStateVector(to)));
}

function syncBoth(a: Y.Doc, b: Y.Doc): void {
  sync(a, b);
  sync(b, a);
}

function docWith(scene: Scene): Y.Doc {
  const doc = new Y.Doc();
  writeSceneToDoc(doc, scene);
  return doc;
}

/** The names of the fields written by a change, as "nodeId.field". */
function changedFields(doc: Y.Doc, change: () => void): string[] {
  const written: string[] = [];
  const handler = (events: Y.YEvent<Y.AbstractType<unknown>>[]) => {
    for (const event of events) {
      // path = [] for the "nodes" map itself, ["id"] for an object, ["id", "material"] for a nested map
      for (const key of event.keys.keys()) {
        written.push([...event.path, key].join("."));
      }
    }
  };
  const nodes = doc.getMap("nodes");
  nodes.observeDeep(handler);
  change();
  nodes.unobserveDeep(handler);
  return written.sort();
}

describe("sceneDoc: a scene survives a trip through the document", () => {
  it("an empty scene", () => {
    const doc = docWith(createEmptyScene());
    const { scene, issues } = readSceneFromDoc(doc);
    expect(issues).toEqual([]);
    expect(scene).toEqual(createEmptyScene());
  });

  it("a scene with every kind of field", () => {
    const original = richScene();
    const { scene, issues } = readSceneFromDoc(docWith(original));
    expect(issues).toEqual([]);
    expect(scene).toEqual(original);
  });

  it("the second machine gets the same scene from the update bytes", () => {
    const original = richScene();
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(docWith(original)));
    expect(readSceneFromDoc(other).scene).toEqual(original);
  });

  it("transform and material are maps of their own, the rest are plain values", () => {
    const doc = docWith(richScene());
    const node = doc.getMap("nodes").get("a") as Y.Map<unknown>;
    expect(node.get("transform")).toBeInstanceOf(Y.Map);
    expect(node.get("material")).toBeInstanceOf(Y.Map);
    expect(node.get("name")).toBe("Cube");
    expect(
      Array.isArray(
        (doc.getMap("nodes").get("b") as Y.Map<unknown>).get("modifiers"),
      ),
    ).toBe(true);
  });
});

describe("sceneDoc: applying a change writes only the difference", () => {
  it("moving an object writes only its transform", () => {
    const before = richScene();
    const doc = docWith(before);
    const after = setTransform(before, "a", {
      ...before.nodes["a"]!.transform,
      position: [5, 0, 0],
    });
    expect(
      changedFields(doc, () => applySceneChange(doc, before, after)),
    ).toEqual(["a.transform.position"]);
    expect(readSceneFromDoc(doc).scene).toEqual(after);
  });

  it("changing one material value writes only that value", () => {
    const before = richScene();
    const doc = docWith(before);
    const after = setMaterial(before, "b", { metalness: 0.9 });
    expect(
      changedFields(doc, () => applySceneChange(doc, before, after)),
    ).toEqual(["b.material.metalness"]);
  });

  it("renaming writes only the name; adding and removing objects work", () => {
    const before = richScene();
    const doc = docWith(before);
    const renamed = updateNode(before, "a", { name: "Box" });
    expect(
      changedFields(doc, () => applySceneChange(doc, before, renamed)),
    ).toEqual(["a.name"]);

    const added = addNode(renamed, createNode("g", "plane"));
    applySceneChange(doc, renamed, added);
    expect(readSceneFromDoc(doc).scene).toEqual(added);

    const removed = removeNode(added, "a");
    applySceneChange(doc, added, removed);
    expect(readSceneFromDoc(doc).scene).toEqual(removed);
    expect(readSceneFromDoc(doc).scene.nodes["a"]).toBeUndefined();
  });

  it("nothing is written when the scene is the same object or equal in value", () => {
    const before = richScene();
    const doc = docWith(before);
    const copy = JSON.parse(JSON.stringify(before)) as Scene;
    expect(
      changedFields(doc, () => applySceneChange(doc, before, before)),
    ).toEqual([]);
    expect(
      changedFields(doc, () => applySceneChange(doc, before, copy)),
    ).toEqual([]);
  });

  it("environment: only the changed setting is written", () => {
    const before = richScene();
    const doc = docWith(before);
    const after = setEnvironment(before, { fogNear: 3 });
    applySceneChange(doc, before, after);
    expect(readSceneFromDoc(doc).scene.environment).toEqual(after.environment);
  });

  it("files are add-only: an asset missing from the next scene stays in the document", () => {
    const before = richScene();
    const doc = docWith(before);
    applySceneChange(doc, before, { ...before, assets: {} });
    expect(Object.keys(readSceneFromDoc(doc).scene.assets)).toEqual(["hash-1"]);
  });

  it("the whole change is one transaction with the given origin", () => {
    const before = richScene();
    const doc = docWith(before);
    const seen: unknown[] = [];
    let transactions = 0;
    doc.on("afterTransaction", (t: Y.Transaction) => {
      transactions += 1;
      seen.push(t.origin);
    });
    const after = removeNode(
      updateNode(setMaterial(before, "a", { roughness: 0.9 }), "b", {
        name: "X",
      }),
      "d",
    );
    applySceneChange(doc, before, after);
    expect(transactions).toBe(1);
    expect(seen).toEqual([LOCAL_ORIGIN]);
    applySceneChange(doc, after, before, "other");
    expect(seen[1]).toBe("other");
  });
});

describe("sceneDoc: two machines editing apart merge to the same scene", () => {
  function twoMachines() {
    const base = richScene();
    const a = docWith(base);
    const b = new Y.Doc();
    sync(a, b);
    return { base, a, b };
  }

  it("different fields of the same object both survive", () => {
    const { base, a, b } = twoMachines();
    applySceneChange(a, base, setMaterial(base, "a", { roughness: 0.9 }));
    applySceneChange(
      b,
      base,
      setTransform(base, "a", {
        ...base.nodes["a"]!.transform,
        position: [9, 9, 9],
      }),
    );
    syncBoth(a, b);
    const merged = readSceneFromDoc(a).scene;
    expect(readSceneFromDoc(b).scene).toEqual(merged);
    expect(merged.nodes["a"]!.material.roughness).toBe(0.9);
    expect(merged.nodes["a"]!.transform.position).toEqual([9, 9, 9]);
  });

  it("the same field changed on both sides ends the same on both (one of the two wins)", () => {
    const { base, a, b } = twoMachines();
    applySceneChange(a, base, setMaterial(base, "a", { roughness: 0.1 }));
    applySceneChange(b, base, setMaterial(base, "a", { roughness: 0.8 }));
    syncBoth(a, b);
    const left = readSceneFromDoc(a).scene;
    expect(readSceneFromDoc(b).scene).toEqual(left);
    expect([0.1, 0.8]).toContain(left.nodes["a"]!.material.roughness);
  });

  it("objects added on both sides are both kept", () => {
    const { base, a, b } = twoMachines();
    applySceneChange(a, base, addNode(base, createNode("x", "cube")));
    applySceneChange(b, base, addNode(base, createNode("y", "cube")));
    syncBoth(a, b);
    const ids = Object.keys(readSceneFromDoc(a).scene.nodes);
    expect(ids).toContain("x");
    expect(ids).toContain("y");
    expect(readSceneFromDoc(b).scene).toEqual(readSceneFromDoc(a).scene);
  });

  it("one side deletes an object, the other edits another: both apply", () => {
    const { base, a, b } = twoMachines();
    applySceneChange(a, base, removeNode(base, "d"));
    applySceneChange(b, base, updateNode(base, "a", { name: "Renamed" }));
    syncBoth(a, b);
    const merged = readSceneFromDoc(a).scene;
    expect(merged.nodes["d"]).toBeUndefined();
    expect(merged.nodes["a"]!.name).toBe("Renamed");
    expect(readSceneFromDoc(b).scene).toEqual(merged);
  });

  it("the order the updates arrive in does not matter", () => {
    const { base, a, b } = twoMachines();
    applySceneChange(a, base, updateNode(base, "a", { name: "One" }));
    applySceneChange(b, base, updateNode(base, "b", { name: "Two" }));
    const updateA = Y.encodeStateAsUpdate(a);
    const updateB = Y.encodeStateAsUpdate(b);
    const first = new Y.Doc();
    const second = new Y.Doc();
    Y.applyUpdate(first, updateA);
    Y.applyUpdate(first, updateB);
    Y.applyUpdate(second, updateB);
    Y.applyUpdate(second, updateA);
    expect(readSceneFromDoc(first).scene).toEqual(
      readSceneFromDoc(second).scene,
    );
  });
});

describe("sceneDoc: data from the network is checked", () => {
  function nodeMap(doc: Y.Doc, id: string): Y.Map<unknown> {
    return doc.getMap("nodes").get(id) as Y.Map<unknown>;
  }

  it("an object with an invalid field is left out and reported, the others load", () => {
    const doc = docWith(richScene());
    nodeMap(doc, "a").set("color", "red");
    const { scene, issues } = readSceneFromDoc(doc);
    expect(scene.nodes["a"]).toBeUndefined();
    expect(scene.nodes["b"]).toBeDefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]!.where).toBe("nodes/a");
  });

  it("an out-of-range material value is refused", () => {
    const doc = docWith(richScene());
    (nodeMap(doc, "a").get("material") as Y.Map<unknown>).set("roughness", 7);
    expect(readSceneFromDoc(doc).scene.nodes["a"]).toBeUndefined();
  });

  it("an object whose id does not match its key is refused", () => {
    const doc = docWith(richScene());
    nodeMap(doc, "a").set("id", "someone-else");
    const { scene, issues } = readSceneFromDoc(doc);
    expect(scene.nodes["a"]).toBeUndefined();
    expect(issues[0]!.message).toContain("does not match");
  });

  it("an object of the wrong type is refused", () => {
    const doc = docWith(richScene());
    doc.getMap("nodes").set("junk", new Y.Map([["x", 1]]) as never);
    const { scene, issues } = readSceneFromDoc(doc);
    expect(scene.nodes["junk"]).toBeUndefined();
    expect(issues.some((i) => i.where === "nodes/junk")).toBe(true);
  });

  it("a bad file record is refused; a bad environment falls back to the starting look", () => {
    const doc = docWith(richScene());
    doc.getMap("assets").set("bad", { id: "bad", bytes: -5 });
    doc.getMap("environment").set("fogNear", "far");
    const { scene, issues } = readSceneFromDoc(doc);
    expect(scene.assets["bad"]).toBeUndefined();
    expect(scene.assets["hash-1"]).toBeDefined();
    expect(scene.environment).toEqual(createEmptyScene().environment);
    expect(issues.map((i) => i.where).sort()).toEqual([
      "assets/bad",
      "environment",
    ]);
  });

  it("readNodeFromDoc reads one object, and null for a missing one", () => {
    const original = richScene();
    const doc = docWith(original);
    expect(readNodeFromDoc(doc, "b")).toEqual(original.nodes["b"]);
    expect(readNodeFromDoc(doc, "nope")).toBeNull();
  });

  it("an older object (missing fields that have defaults) still loads", () => {
    const doc = new Y.Doc();
    const node = new Y.Map<unknown>();
    doc.getMap("nodes").set("old", node);
    for (const [k, v] of Object.entries({
      id: "old",
      name: "Old",
      kind: "cube",
      parentId: null,
      visible: true,
      color: "#ffffff",
    })) {
      node.set(k, v);
    }
    const transform = new Y.Map<unknown>();
    node.set("transform", transform);
    transform.set("position", [0, 0, 0]);
    transform.set("rotation", [0, 0, 0]);
    transform.set("scale", [1, 1, 1]);
    const { scene, issues } = readSceneFromDoc(doc);
    expect(issues).toEqual([]);
    expect(scene.nodes["old"]!.material.roughness).toBeGreaterThan(0);
  });
});

describe("plainEqual", () => {
  it("compares numbers, arrays and objects by value", () => {
    expect(plainEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(plainEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(plainEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(plainEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(plainEqual(null, null)).toBe(true);
    expect(plainEqual(null, {})).toBe(false);
    expect(plainEqual([], {})).toBe(false);
  });
});
