import { expect, test } from "@playwright/test";
import {
  addShape,
  meshFacts,
  moveSelected,
  newProject,
  press,
  selectBox,
  setNumber,
  setSliderNumber,
  settled,
} from "./helpers";

const isPatch = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__sceneroom!.meshIsPatch());

/**
 * Difference-based undo with a big mesh: a cube cut into 32 segments and divided again (about 100 000 points) is moved
 * in one corner twice. Each move is stored as a patch (only the moved points), and Undo and Redo walk back and forth
 * through the steps to exactly the same shape.
 */
test("a big mesh: moves are stored as patches and Undo / Redo walk through them", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await newProject(page);
  await addShape(page, "Cube");
  await setSliderNumber(page, "Segments", 32);
  await page.getByRole("button", { name: /Edit points/ }).click();
  await press(page, "Divide");
  await setNumber(page, "Cuts", 3);
  const start = await settled(page);
  expect(start.points).toBeGreaterThan(20_000);
  expect(await isPatch(page)).toBe(false); // a divide changes the triangles: whole mesh

  // Move the corner at the top, right, front by 0.3 up (a few points only)
  await selectBox(page, [0.45, 0.45, 0.45], [1, 1, 1]);
  await moveSelected(page, [0, 0.3, 0]);
  const first = await settled(page);
  expect(await isPatch(page)).toBe(true);
  expect(first.boundsMax[1]).toBeGreaterThan(start.boundsMax[1] + 0.2);

  await selectBox(page, [-1, -1, -1], [-0.45, -0.45, -0.45]);
  await moveSelected(page, [0, -0.3, 0]);
  const second = await settled(page);
  expect(await isPatch(page)).toBe(true);
  expect(second.boundsMin[1]).toBeLessThan(start.boundsMin[1] - 0.2);

  // Undo twice: back to the divided cube; Redo twice: forward to the second move
  for (const [expected, key] of [
    [first, "Control+z"],
    [start, "Control+z"],
    [first, "Control+Shift+z"],
    [second, "Control+Shift+z"],
  ] as const) {
    await page.keyboard.press(key);
    await expect
      .poll(
        async () => {
          const facts = await meshFacts(page);
          return [facts.boundsMin[1], facts.boundsMax[1]];
        },
        { timeout: 30_000 },
      )
      .toEqual([expected.boundsMin[1], expected.boundsMax[1]]);
  }
  expect((await meshFacts(page)).points).toBe(start.points);
});
