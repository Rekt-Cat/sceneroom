import * as Y from "yjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addNode,
  createEmptyScene,
  createNode,
  readSceneFromDoc,
  setMaterial,
  setTransform,
  updateNode,
  type Scene,
} from "@sceneroom/shared";
import { createSceneBinding, shareUnchanged } from "./sceneBinding";

/** One machine: a document, a binding, and a stand-in for the editor's scene. */
function machine(initial: Scene) {
  const doc = new Y.Doc();
  const applied: Scene[] = [];
  const reconciled: string[] = [];
  const issues: string[] = [];
  const machineState = { editor: initial };
  const binding = createSceneBinding({
    doc,
    delayMs: 50,
    applyRemote: (scene) => {
      applied.push(scene);
      machineState.editor = scene;
    },
    onReconciled: (how) => reconciled.push(how),
    onIssues: (list) => issues.push(...list.map((i) => i.where)),
  });
  return {
    doc,
    binding,
    applied,
    reconciled,
    issues,
    get editor() {
      return machineState.editor;
    },
    /** The person changes the scene in the editor. */
    edit(change: (scene: Scene) => Scene) {
      machineState.editor = change(machineState.editor);
      binding.localChanged(machineState.editor);
    },
  };
}
type Machine = ReturnType<typeof machine>;

/** A network between two documents that can be cut. Updates are delivered at once while it is up. */
function network(a: Machine, b: Machine) {
  let up = true;
  const send = (from: Y.Doc, to: Y.Doc) =>
    from.on("update", (update: Uint8Array, origin: unknown) => {
      if (up && origin !== "network") Y.applyUpdate(to, update, "network");
    });
  send(a.doc, b.doc);
  send(b.doc, a.doc);
  return {
    cut: () => {
      up = false;
    },
    /** Reconnects and exchanges everything the other side is missing, like the real sync does. */
    restore: () => {
      up = true;
      Y.applyUpdate(
        b.doc,
        Y.encodeStateAsUpdate(a.doc, Y.encodeStateVector(b.doc)),
        "network",
      );
      Y.applyUpdate(
        a.doc,
        Y.encodeStateAsUpdate(b.doc, Y.encodeStateVector(a.doc)),
        "network",
      );
    },
  };
}

function sceneWithCube(): Scene {
  return addNode(createEmptyScene(), createNode("cube", "cube"));
}

const later = (ms = 60) => vi.advanceTimersByTime(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("first meeting of the editor and the document", () => {
  it("the first editor writes its scene once the server says the document is empty", () => {
    const alice = machine(sceneWithCube());
    alice.binding.start(alice.editor);
    expect(alice.binding.isReconciled()).toBe(false); // waits for the server
    alice.binding.serverSynced();
    expect(alice.reconciled).toEqual(["seeded"]);
    expect(readSceneFromDoc(alice.doc).scene).toEqual(sceneWithCube());
  });

  it("a second editor takes the shared scene instead of writing its own", () => {
    const alice = machine(sceneWithCube());
    const bob = machine(
      addNode(createEmptyScene(), createNode("bobs-own", "sphere")),
    );
    const net = network(alice, bob);
    alice.binding.start(alice.editor);
    alice.binding.serverSynced();
    net.restore(); // Bob's document now has Alice's scene
    bob.binding.start(bob.editor);
    bob.binding.serverSynced();
    expect(bob.reconciled).toEqual(["adopted"]);
    expect(Object.keys(bob.editor.nodes)).toEqual(["cube"]);
    expect(Object.keys(readSceneFromDoc(alice.doc).scene.nodes)).toEqual([
      "cube",
    ]);
  });

  it("a shared scene that was emptied is not mistaken for a new document", () => {
    const alice = machine(createEmptyScene());
    const bob = machine(sceneWithCube());
    const net = network(alice, bob);
    alice.binding.start(alice.editor);
    alice.binding.serverSynced();
    net.restore();
    bob.binding.start(bob.editor);
    bob.binding.serverSynced();
    expect(bob.reconciled).toEqual(["adopted"]);
    expect(Object.keys(bob.editor.nodes)).toEqual([]);
  });

  it("changes made before the first meeting are not written", () => {
    const alice = machine(sceneWithCube());
    alice.binding.start(alice.editor);
    alice.edit((s) => updateNode(s, "cube", { name: "Early" }));
    later();
    expect(Object.keys(readSceneFromDoc(alice.doc).scene.nodes)).toEqual([]);
  });
});

describe("editing together", () => {
  function pair() {
    const alice = machine(sceneWithCube());
    const bob = machine(createEmptyScene());
    const net = network(alice, bob);
    alice.binding.start(alice.editor);
    alice.binding.serverSynced();
    net.restore();
    bob.binding.start(bob.editor);
    bob.binding.serverSynced();
    alice.applied.length = 0;
    bob.applied.length = 0;
    return { alice, bob, net };
  }

  it("a change reaches the other editor and does not come back as an echo", () => {
    const { alice, bob } = pair();
    alice.edit((s) => setMaterial(s, "cube", { roughness: 0.1 }));
    expect(bob.applied).toHaveLength(0); // not yet: changes are written together after a moment
    later();
    expect(bob.applied).toHaveLength(1);
    expect(bob.editor.nodes["cube"]!.material.roughness).toBe(0.1);
    expect(alice.applied).toHaveLength(0);
  });

  it("many quick changes (a drag) are written as one", () => {
    const { alice, bob } = pair();
    const updates: number[] = [];
    bob.doc.on("update", () => updates.push(1));
    for (let x = 1; x <= 20; x++) {
      alice.edit((s) =>
        setTransform(s, "cube", {
          ...s.nodes["cube"]!.transform,
          position: [x, 0, 0],
        }),
      );
    }
    later();
    expect(updates).toHaveLength(1);
    expect(bob.editor.nodes["cube"]!.transform.position).toEqual([20, 0, 0]);
  });

  it("different changes to one object, at the same time, both survive", () => {
    const { alice, bob } = pair();
    alice.edit((s) => setMaterial(s, "cube", { roughness: 0.9 }));
    bob.edit((s) =>
      setTransform(s, "cube", {
        ...s.nodes["cube"]!.transform,
        position: [4, 4, 4],
      }),
    );
    later();
    for (const m of [alice, bob]) {
      expect(m.editor.nodes["cube"]!.material.roughness).toBe(0.9);
      expect(m.editor.nodes["cube"]!.transform.position).toEqual([4, 4, 4]);
    }
    expect(alice.editor).toEqual(bob.editor);
  });

  it("a change still waiting to be written is not lost when someone else's arrives", () => {
    const { alice, bob } = pair();
    alice.edit((s) => updateNode(s, "cube", { name: "Mine" }));
    // Bob's change reaches Alice before her own timer fires
    bob.edit((s) => addNode(s, createNode("extra", "sphere")));
    vi.advanceTimersByTime(49 - 0); // Bob's timer has not fired yet either
    later(); // now it has
    expect(alice.editor.nodes["cube"]!.name).toBe("Mine");
    expect(alice.editor.nodes["extra"]).toBeDefined();
    expect(bob.editor.nodes["cube"]!.name).toBe("Mine");
    expect(alice.editor).toEqual(bob.editor);
  });

  it("the editor keeps the same objects for what did not change", () => {
    const { alice, bob } = pair();
    alice.edit((s) => addNode(s, createNode("other", "cone")));
    later();
    const cubeBefore = bob.editor.nodes["cube"];
    alice.edit((s) => updateNode(s, "other", { name: "Cone 2" }));
    later();
    expect(bob.editor.nodes["cube"]).toBe(cubeBefore);
  });

  it("deleting on one side removes the object on the other", () => {
    const { alice, bob } = pair();
    alice.edit((s) => {
      const rest = Object.fromEntries(
        Object.entries(s.nodes).filter(([id]) => id !== "cube"),
      );
      return { ...s, nodes: rest };
    });
    later();
    expect(bob.editor.nodes["cube"]).toBeUndefined();
  });

  it("work done while the connection was down is merged when it comes back", () => {
    const { alice, bob, net } = pair();
    net.cut();
    alice.edit((s) => updateNode(s, "cube", { name: "Alice offline" }));
    bob.edit((s) => addNode(s, createNode("bobs", "plane")));
    later();
    expect(bob.editor.nodes["cube"]!.name).toBe("Cube");
    net.restore();
    expect(alice.editor.nodes["bobs"]).toBeDefined();
    expect(bob.editor.nodes["cube"]!.name).toBe("Alice offline");
    expect(alice.editor).toEqual(bob.editor);
  });

  it("destroy writes what is still waiting", () => {
    const { alice, bob } = pair();
    alice.edit((s) => updateNode(s, "cube", { name: "Last words" }));
    alice.binding.destroy();
    expect(bob.editor.nodes["cube"]!.name).toBe("Last words");
  });

  it("flush writes what is waiting without waiting for the timer", () => {
    const { alice, bob } = pair();
    alice.edit((s) => updateNode(s, "cube", { name: "Before leaving" }));
    expect(bob.editor.nodes["cube"]!.name).toBe("Cube");
    alice.binding.flush();
    expect(bob.editor.nodes["cube"]!.name).toBe("Before leaving");
  });

  it("a viewer's change is put back instead of written", () => {
    const { alice } = pair();
    const doc = new Y.Doc();
    const applied: Scene[] = [];
    let readOnly = false;
    const viewer = createSceneBinding({
      doc,
      delayMs: 50,
      applyRemote: (scene) => applied.push(scene),
      isReadOnly: () => readOnly,
    });
    // The viewer joins the shared scene
    Y.applyUpdate(doc, Y.encodeStateAsUpdate(alice.doc));
    const start = sceneWithCube();
    viewer.start(start);
    viewer.serverSynced();
    applied.length = 0;
    readOnly = true;

    // The viewer changes something in the editor
    viewer.localChanged(updateNode(start, "cube", { name: "Sneaky" }));
    expect(applied).toHaveLength(1);
    expect(applied[0]!.nodes["cube"]!.name).toBe("Cube"); // put back
    later();
    expect(readSceneFromDoc(doc).scene.nodes["cube"]!.name).toBe("Cube"); // nothing was written
    expect(readSceneFromDoc(alice.doc).scene.nodes["cube"]!.name).toBe("Cube");
  });

  it("after destroy nothing more is written or applied", () => {
    const { alice, bob } = pair();
    bob.binding.destroy();
    alice.edit((s) => updateNode(s, "cube", { name: "After" }));
    later();
    expect(bob.applied).toHaveLength(0);
    bob.binding.localChanged(updateNode(bob.editor, "cube", { name: "Ghost" }));
    later();
    expect(readSceneFromDoc(alice.doc).scene.nodes["cube"]!.name).toBe("After");
  });

  it("an invalid object from the network is reported and never reaches the editor", () => {
    const { alice, bob } = pair();
    const nodes = alice.doc.getMap("nodes");
    alice.doc.transact(() => {
      nodes.set(
        "evil",
        new Y.Map<unknown>([
          ["id", "evil"],
          ["color", "red"],
        ]),
      );
    }, "someone-else");
    expect(bob.editor.nodes["evil"]).toBeUndefined();
    expect(bob.issues).toContain("nodes/evil");
    expect(bob.editor.nodes["cube"]).toBeDefined();
  });
});

describe("shareUnchanged", () => {
  it("returns the current scene itself when nothing differs", () => {
    const current = sceneWithCube();
    const copy = JSON.parse(JSON.stringify(current)) as Scene;
    expect(shareUnchanged(current, copy)).toBe(current);
  });

  it("keeps unchanged objects and takes the changed one", () => {
    const current = addNode(sceneWithCube(), createNode("b", "sphere"));
    const incoming = JSON.parse(JSON.stringify(current)) as Scene;
    incoming.nodes["b"]!.name = "Renamed";
    const result = shareUnchanged(current, incoming);
    expect(result.nodes["cube"]).toBe(current.nodes["cube"]);
    expect(result.nodes["b"]!.name).toBe("Renamed");
  });
});

describe("shareUnchanged and the parts of a changed object", () => {
  it("keeps the old object for every field that did not change, so nothing is built again for a move", () => {
    const current = addNode(createEmptyScene(), createNode("a", "cube"));
    const old = current.nodes["a"]!;
    const incoming = structuredClone(
      setTransform(current, "a", {
        ...old.transform,
        position: [4, 0, 0],
      }),
    );
    const node = shareUnchanged(current, incoming).nodes["a"]!;
    expect(node).not.toBe(old);
    expect(node.transform.position).toEqual([4, 0, 0]);
    expect(node.transform).not.toBe(old.transform);
    expect(node.modifiers).toBe(old.modifiers);
    expect(node.material).toBe(old.material);
  });

  it("a changed colour leaves the transform as the same object (so nothing glides)", () => {
    const current = addNode(createEmptyScene(), createNode("a", "cube"));
    const incoming = structuredClone(
      updateNode(current, "a", { color: "#ff0000" }),
    );
    const node = shareUnchanged(current, incoming).nodes["a"]!;
    expect(node.color).toBe("#ff0000");
    expect(node.transform).toBe(current.nodes["a"]!.transform);
  });
});
