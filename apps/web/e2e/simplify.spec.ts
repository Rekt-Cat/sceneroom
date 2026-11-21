import { expect, test } from "@playwright/test";
import {
  addShape,
  expectGoodMesh,
  meshFacts,
  newProject,
  press,
  settled,
} from "./helpers";

/**
 * Simplify: a sphere (a dense, closed shape) is cut down twice with the Simplify button. Each time the triangle count
 * must fall to about half, the surface must stay closed and valid, and it must still be about as big as the sphere was.
 * Undo brings the dense mesh back.
 */
test("simplify a sphere: fewer triangles, still a closed round shape, undo restores it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await newProject(page);
  await addShape(page, "Sphere");
  await page.getByRole("button", { name: /Edit points/ }).click();
  // The sphere becomes an editable mesh a moment after edit mode opens
  await expect(page.getByText(/\d+ triangles/).first()).toBeVisible();
  const start = await settled(page);
  expect(start.triangles).toBeGreaterThan(200);
  expectGoodMesh(start);

  await press(page, "Simplify");
  await expect
    .poll(async () => (await meshFacts(page)).triangles, { timeout: 30_000 })
    .toBeLessThan(start.triangles * 0.6);
  const once = await settled(page);
  expect(once.triangles).toBeGreaterThan(start.triangles * 0.3);
  expectGoodMesh(once);
  await expect(page.getByText(/Simplified from/).first()).toBeVisible();

  await press(page, "Simplify");
  await expect
    .poll(async () => (await meshFacts(page)).triangles, { timeout: 30_000 })
    .toBeLessThan(once.triangles * 0.6);
  const twice = await settled(page);
  expectGoodMesh(twice);
  // Still about the size of the sphere (the cheapest collapses shave a little off, never half)
  for (let k = 0; k < 3; k++) {
    expect(twice.boundsMax[k]! - twice.boundsMin[k]!).toBeGreaterThan(
      (start.boundsMax[k]! - start.boundsMin[k]!) * 0.8,
    );
  }
  await page.screenshot({ path: "test-results/simplified-sphere.png" });

  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await meshFacts(page)).triangles, { timeout: 30_000 })
    .toBe(start.triangles);
});
