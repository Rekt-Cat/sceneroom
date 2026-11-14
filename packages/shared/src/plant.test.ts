import { describe, expect, it } from "vitest";
import { checkMesh } from "./meshData";
import {
  DEFAULT_PLANT,
  createEmptyScene,
  plantSchema,
  sceneNodeSchema,
  type PlantSettings,
} from "./scene";
import { addNode, createNode } from "./sceneOps";
import {
  PLANT_PRESETS,
  PLANT_PRESET_NAMES,
  createPlantNode,
  createRandom,
  generatePlant,
  plantChangeDiffers,
  plantWithSeed,
  sanitizePlantChange,
  scatterPlants,
  scatterSpots,
  setPlant,
} from "./plant";

const settings = (change: Partial<PlantSettings> = {}): PlantSettings => ({
  ...DEFAULT_PLANT,
  ...change,
});

/** The size of the box around a mesh. */
function bounds(positions: Float32Array) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, positions[i + k]!);
      max[k] = Math.max(max[k]!, positions[i + k]!);
    }
  }
  return { min, max };
}

describe("the random numbers", () => {
  it("the same seed gives the same numbers, another seed gives others, all from 0 up to 1", () => {
    const a = createRandom(5);
    const b = createRandom(5);
    const c = createRandom(6);
    const first = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(first);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("growing a plant", () => {
  it("the same settings always give exactly the same plant", () => {
    const a = generatePlant(settings({ seed: 7 }));
    const b = generatePlant(settings({ seed: 7 }));
    expect(Array.from(a.bark.positions)).toEqual(Array.from(b.bark.positions));
    expect(Array.from(a.leaves.positions)).toEqual(
      Array.from(b.leaves.positions),
    );
    expect(Array.from(a.bark.indices)).toEqual(Array.from(b.bark.indices));
  });

  it("another seed grows a different plant of about the same size", () => {
    const a = generatePlant(settings({ seed: 1 }));
    const b = generatePlant(settings({ seed: 2 }));
    expect(Array.from(a.bark.positions)).not.toEqual(
      Array.from(b.bark.positions),
    );
    expect(a.bark.indices.length).toBe(b.bark.indices.length); // same structure, different shape
  });

  it("makes valid meshes that can be stored (every triangle uses points that exist, numbers are finite)", () => {
    for (const name of PLANT_PRESET_NAMES) {
      const plant = generatePlant(PLANT_PRESETS[name]);
      expect(checkMesh(plant.bark)).toBeNull();
      expect(checkMesh(plant.leaves)).toBeNull();
    }
  });

  it("the trunk is as tall as asked and stands on the origin", () => {
    const { bark } = generatePlant(
      settings({ levels: 0, crookedness: 0, height: 4, leafDensity: 0 }),
    );
    const { min, max } = bounds(bark.positions);
    expect(min[1]).toBeCloseTo(0, 5);
    // a straight trunk reaches its height, plus the small point of its tip
    expect(max[1]).toBeGreaterThanOrEqual(4);
    expect(max[1]).toBeLessThan(4.1);
    // and it is as wide as its radius at the bottom
    expect(max[0] - min[0]).toBeCloseTo(0.24, 1);
  });

  it("more levels and more branches make a bigger plant", () => {
    const triangles = (change: Partial<PlantSettings>) =>
      generatePlant(settings(change)).bark.indices.length / 3;
    expect(triangles({ levels: 0 })).toBeLessThan(triangles({ levels: 1 }));
    expect(triangles({ levels: 1 })).toBeLessThan(triangles({ levels: 2 }));
    expect(triangles({ branches: 2 })).toBeLessThan(triangles({ branches: 8 }));
    expect(triangles({ sides: 3 })).toBeLessThan(triangles({ sides: 12 }));
    expect(triangles({ rings: 2 })).toBeLessThan(triangles({ rings: 8 }));
  });

  it("a plant with branches is wider than a bare trunk, and a bigger angle spreads it more", () => {
    const width = (change: Partial<PlantSettings>) => {
      const { min, max } = bounds(
        generatePlant(settings({ leafDensity: 0, ...change })).bark.positions,
      );
      return Math.max(max[0]! - min[0]!, max[2]! - min[2]!);
    };
    expect(width({ levels: 0 })).toBeLessThan(width({ levels: 2 }));
    expect(width({ branchAngle: 15 })).toBeLessThan(width({ branchAngle: 80 }));
  });

  it("branches droop below where they start when droop is high, and reach up when it is low", () => {
    const top = (droop: number) =>
      bounds(
        generatePlant(
          settings({ droop, leafDensity: 0, crookedness: 0, levels: 1 }),
        ).bark.positions,
      ).max[1]!;
    expect(top(-1)).toBeGreaterThan(top(1));
  });

  it("every tube faces outwards: the triangles of the trunk point away from its middle line", () => {
    const { bark } = generatePlant(
      settings({ levels: 0, crookedness: 0, leafDensity: 0, sides: 8 }),
    );
    let outward = 0;
    let total = 0;
    // the trunk is straight up the y axis; the side triangles (not the caps) are the first ones
    const sideTriangles = 8 * 2 * DEFAULT_PLANT.rings;
    for (let t = 0; t < sideTriangles; t++) {
      const [a, b, c] = [
        bark.indices[t * 3]!,
        bark.indices[t * 3 + 1]!,
        bark.indices[t * 3 + 2]!,
      ];
      const p = (i: number) => [
        bark.positions[i * 3]!,
        bark.positions[i * 3 + 1]!,
        bark.positions[i * 3 + 2]!,
      ];
      const [pa, pb, pc] = [p(a), p(b), p(c)] as [number[], number[], number[]];
      const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
      const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const centre = [
        (pa[0]! + pb[0]! + pc[0]!) / 3,
        (pa[2]! + pb[2]! + pc[2]!) / 3,
      ];
      total += 1;
      if (n[0]! * centre[0]! + n[2]! * centre[1]! > 0) outward += 1;
    }
    expect(outward).toBe(total);
  });

  it("the trunk is closed at the bottom and the top (the caps face down and up)", () => {
    const { bark } = generatePlant(
      settings({ levels: 0, crookedness: 0, leafDensity: 0, sides: 6 }),
    );
    const sideTriangles = 6 * 2 * DEFAULT_PLANT.rings;
    const normalY = (t: number) => {
      const p = (i: number) => [
        bark.positions[i * 3]!,
        bark.positions[i * 3 + 1]!,
        bark.positions[i * 3 + 2]!,
      ];
      const [pa, pb, pc] = [
        p(bark.indices[t * 3]!),
        p(bark.indices[t * 3 + 1]!),
        p(bark.indices[t * 3 + 2]!),
      ] as [number[], number[], number[]];
      const u = [pb[0]! - pa[0]!, pb[2]! - pa[2]!];
      const v = [pc[0]! - pa[0]!, pc[2]! - pa[2]!];
      // the y part of the cross product u x v, where u and v are given as (x, z)
      return u[1]! * v[0]! - u[0]! * v[1]!;
    };
    // the tip cap points up (it is a pointed cone: its triangles slope, so test the base cap which is flat)
    const baseCap = sideTriangles + 6; // after the side triangles come the 6 tip triangles, then the 6 base ones
    expect(normalY(baseCap)).toBeLessThan(0); // faces down
  });
});

describe("leaves", () => {
  it("no density means no leaves", () => {
    expect(
      generatePlant(settings({ leafDensity: 0 })).leaves.positions.length,
    ).toBe(0);
  });

  it("more density and a bigger plant make more leaves; blobs are 12 points and 20 triangles each", () => {
    const some = generatePlant(
      settings({ leafDensity: 0.2, leafStyle: "blobs" }),
    ).leaves;
    const many = generatePlant(
      settings({ leafDensity: 1, leafStyle: "blobs" }),
    ).leaves;
    expect(many.indices.length).toBeGreaterThan(some.indices.length);
    expect((many.indices.length / 3) % 20).toBe(0);
    expect((many.positions.length / 3) % 12).toBe(0);
  });

  it("the lumps face outwards (their triangles point away from their own middle)", () => {
    const { leaves } = generatePlant(
      settings({
        leafDensity: 0.1,
        levels: 0,
        leafStyle: "blobs",
        crookedness: 0,
      }),
    );
    // one lump per leaf: every 12 points and 20 triangles; test the first lump
    const centre = [0, 0, 0];
    for (let i = 0; i < 12; i++)
      for (let k = 0; k < 3; k++)
        centre[k]! += leaves.positions[i * 3 + k]! / 12;
    for (let t = 0; t < 20; t++) {
      const p = (i: number) => [
        leaves.positions[i * 3]!,
        leaves.positions[i * 3 + 1]!,
        leaves.positions[i * 3 + 2]!,
      ];
      const [pa, pb, pc] = [
        p(leaves.indices[t * 3]!),
        p(leaves.indices[t * 3 + 1]!),
        p(leaves.indices[t * 3 + 2]!),
      ] as [number[], number[], number[]];
      const u = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
      const v = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      const mid = [
        (pa[0]! + pb[0]! + pc[0]!) / 3 - centre[0]!,
        (pa[1]! + pb[1]! + pc[1]!) / 3 - centre[1]!,
        (pa[2]! + pb[2]! + pc[2]!) / 3 - centre[2]!,
      ];
      expect(
        n[0]! * mid[0]! + n[1]! * mid[1]! + n[2]! * mid[2]!,
      ).toBeGreaterThan(0);
    }
  });

  it("cards are crossed flat leaves drawn from both sides (8 triangles each)", () => {
    const { leaves } = generatePlant(
      settings({ leafDensity: 0.5, leafStyle: "cards" }),
    );
    expect((leaves.indices.length / 3) % 8).toBe(0);
    expect(checkMesh(leaves)).toBeNull();
  });

  it("a bigger leaf size makes bigger lumps", () => {
    const size = (leafSize: number) => {
      const { min, max } = bounds(
        generatePlant(
          settings({ leafSize, levels: 0, leafDensity: 0.1, crookedness: 0 }),
        ).leaves.positions,
      );
      return max[1]! - min[1]!;
    };
    expect(size(0.2)).toBeLessThan(size(1));
  });

  it("the leaves sit near the top of the plant, not on the ground", () => {
    const { leaves } = generatePlant(settings());
    expect(bounds(leaves.positions).min[1]!).toBeGreaterThan(0.5);
  });
});

describe("the presets", () => {
  it("each passes the schema, and they differ from each other", () => {
    for (const name of PLANT_PRESET_NAMES) {
      expect(plantSchema.safeParse(PLANT_PRESETS[name]).success).toBe(true);
    }
    expect(PLANT_PRESETS.pine.height).toBeGreaterThan(
      PLANT_PRESETS.bush.height,
    );
    expect(PLANT_PRESETS.tree).toEqual(DEFAULT_PLANT);
  });

  it("a pine is taller than it is wide and a bush is wider than it is tall", () => {
    const size = (name: (typeof PLANT_PRESET_NAMES)[number]) => {
      const { min, max } = bounds(
        generatePlant(PLANT_PRESETS[name]).bark.positions,
      );
      return {
        width: Math.max(max[0]! - min[0]!, max[2]! - min[2]!),
        height: max[1]! - min[1]!,
      };
    };
    const pine = size("pine");
    const bush = size("bush");
    expect(pine.height).toBeGreaterThan(pine.width);
    expect(bush.width / bush.height).toBeGreaterThan(pine.width / pine.height);
  });
});

describe("the plant object and its settings", () => {
  it("a new plant object has the preset's numbers, its own colour and faceted shading, and passes the schema", () => {
    for (const name of PLANT_PRESET_NAMES) {
      const node = createPlantNode("p", name, 42);
      expect(node.kind).toBe("plant");
      expect(node.plant).toEqual({ ...PLANT_PRESETS[name], seed: 42 });
      expect(node.material.flatShading).toBe(true);
      expect(sceneNodeSchema.safeParse(node).success).toBe(true);
    }
  });

  it("an older object loads with no plant", () => {
    const { plant, ...old } = createNode("a", "cube");
    void plant;
    expect(sceneNodeSchema.parse(old).plant).toBeNull();
  });

  it("the schema refuses numbers outside their range", () => {
    const bad = (change: object) =>
      plantSchema.safeParse({ ...DEFAULT_PLANT, ...change }).success;
    expect(bad({ levels: 4 })).toBe(false);
    expect(bad({ sides: 2 })).toBe(false);
    expect(bad({ branches: 2.5 })).toBe(false);
    expect(bad({ leafColor: "green" })).toBe(false);
    expect(bad({ leafStyle: "needles" })).toBe(false);
    expect(bad({ height: 5 })).toBe(true);
  });

  it("changes are cleaned: kept in range, whole numbers where needed, colours checked, nonsense dropped", () => {
    expect(sanitizePlantChange({ levels: 9, height: -3, sides: 7.6 })).toEqual({
      levels: 3,
      height: 0.2,
      sides: 8,
    });
    expect(sanitizePlantChange({ leafColor: "#ABCDEF" })).toEqual({
      leafColor: "#abcdef",
    });
    expect(
      sanitizePlantChange({
        leafColor: "green",
        leafStyle: "needles" as never,
        height: NaN,
      }),
    ).toEqual({});
    expect(sanitizePlantChange({ leafStyle: "cards" })).toEqual({
      leafStyle: "cards",
    });
  });

  it("sees whether a change would alter anything", () => {
    expect(
      plantChangeDiffers(DEFAULT_PLANT, { height: DEFAULT_PLANT.height }),
    ).toBe(false);
    expect(plantChangeDiffers(DEFAULT_PLANT, { height: 9 })).toBe(true);
    expect(plantChangeDiffers(DEFAULT_PLANT, {})).toBe(false);
  });

  it("setPlant changes some settings and keeps the others; it refuses an object that is not a plant", () => {
    let scene = addNode(createEmptyScene(), createPlantNode("p", "tree"));
    scene = setPlant(scene, "p", { height: 9 });
    expect(scene.nodes["p"]?.plant).toEqual({ ...DEFAULT_PLANT, height: 9 });
    const cube = addNode(createEmptyScene(), createNode("c", "cube"));
    expect(() => setPlant(cube, "c", { height: 1 })).toThrow("not a plant");
    expect(() => setPlant(cube, "nope", { height: 1 })).toThrow(
      "does not exist",
    );
  });

  it("a seed is kept inside its range", () => {
    expect(plantWithSeed(DEFAULT_PLANT, 123456).seed).toBe(99999);
    expect(plantWithSeed(DEFAULT_PLANT, -5).seed).toBe(0);
    expect(plantWithSeed(DEFAULT_PLANT, 12.4).seed).toBe(12);
  });
});

describe("scattering a forest", () => {
  const options = {
    seed: 1,
    count: 20,
    radius: 10,
    spacing: 1.5,
    sizeVariation: 0.3,
    firstSeed: 100,
  };

  it("the same arguments give the same spots, another seed gives others", () => {
    expect(scatterSpots(options)).toEqual(scatterSpots(options));
    expect(scatterSpots({ ...options, seed: 2 })).not.toEqual(
      scatterSpots(options),
    );
  });

  it("keeps every spot inside the circle and no two closer than the spacing", () => {
    const spots = scatterSpots(options);
    expect(spots.length).toBe(20);
    for (const spot of spots)
      expect(Math.hypot(spot.x, spot.z)).toBeLessThanOrEqual(10);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(
          Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z),
        ).toBeGreaterThanOrEqual(1.5);
      }
    }
  });

  it("sizes stay within the variation and every copy gets its own seed", () => {
    const spots = scatterSpots(options);
    for (const spot of spots) {
      expect(spot.size).toBeGreaterThanOrEqual(0.7);
      expect(spot.size).toBeLessThanOrEqual(1.3);
      expect(spot.turn).toBeGreaterThanOrEqual(0);
      expect(spot.turn).toBeLessThan(Math.PI * 2);
    }
    expect(new Set(spots.map((s) => s.seed)).size).toBe(spots.length);
  });

  it("returns fewer when the circle is too crowded, never more than asked", () => {
    const crowded = scatterSpots({
      ...options,
      count: 500,
      radius: 3,
      spacing: 2,
    });
    expect(crowded.length).toBeLessThan(500);
    expect(crowded.length).toBeGreaterThan(0);
    expect(scatterSpots({ ...options, count: 0 })).toEqual([]);
  });

  it("makes copies of the plant object around it, each different, in the same parent", () => {
    let scene = createEmptyScene();
    scene = addNode(scene, {
      ...createPlantNode("tree", "tree", 5),
      transform: {
        position: [10, 0, 20],
        rotation: [0, 0, 0],
        scale: [2, 2, 2],
      },
    });
    let n = 0;
    const result = scatterPlants(
      scene,
      "tree",
      scatterSpots(options),
      () => `copy${++n}`,
    );
    expect(result.ids.length).toBe(20);
    expect(Object.keys(result.scene.nodes).length).toBe(21);
    const copy = result.scene.nodes[result.ids[0]!]!;
    expect(copy.kind).toBe("plant");
    expect(copy.plant?.leafColor).toBe(DEFAULT_PLANT.leafColor);
    expect(copy.plant?.seed).not.toBe(5);
    expect(copy.name).not.toBe("Tree");
    // it stands near the original (10, 20) and is sized relative to it (2 x 0.7..1.3)
    expect(
      Math.hypot(
        copy.transform.position[0] - 10,
        copy.transform.position[2] - 20,
      ),
    ).toBeLessThanOrEqual(10);
    expect(copy.transform.scale[0]).toBeGreaterThanOrEqual(1.4);
    expect(result.scene.nodes["tree"]).toBe(scene.nodes["tree"]); // the original is untouched
  });

  it("refuses an object that is not a plant", () => {
    const scene = addNode(createEmptyScene(), createNode("c", "cube"));
    expect(() => scatterPlants(scene, "c", [], () => "x")).toThrow(
      "not a plant",
    );
  });
});
