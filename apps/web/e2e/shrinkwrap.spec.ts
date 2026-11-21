import { expect, test } from "@playwright/test";
import {
  addShape,
  expectGoodMesh,
  meshFacts,
  newProject,
  press,
  setNumber,
  setTransform,
  settled,
} from "./helpers";

/**
 * Shrinkwrap: a big sphere (the target) and a small divided cube standing off centre inside it. Shrinkwrap pushes every
 * point of the cube out from the middle of the cube to the sphere's surface, so the cube covers the whole sphere and
 * stays one valid closed mesh. Undo puts the cube back.
 */
test("shrinkwrap a divided cube onto a big sphere, then undo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await newProject(page);
  await addShape(page, "Sphere");
  await setTransform(page, { scale: [3, 3, 3] });
  await addShape(page, "Cube");
  // Off centre on purpose: the cube must still cover the whole sphere, not gather in the nearest patch of it
  await setTransform(page, { position: [0.6, 0.2, -0.3] });
  await page.getByRole("button", { name: /Edit points/ }).click();
  await expect(page.getByText(/\d+ triangles/).first()).toBeVisible();
  await press(page, "Divide");
  await setNumber(page, "Cuts", 3);
  const start = await settled(page);
  expect(start.boundsMax[0] - start.boundsMin[0]).toBeLessThan(1.1);

  await page
    .getByLabel("Object to wrap onto")
    .selectOption({ label: "Sphere" });
  await press(page, "Shrinkwrap");
  await expect(
    page.getByText(/Wrapped \d+ of \d+ points onto/).first(),
  ).toBeVisible();
  const wrapped = await settled(page);
  // The sphere is about 3 across: the wrapped cube spans all of it in every direction
  for (let k = 0; k < 3; k++) {
    const span = wrapped.boundsMax[k]! - wrapped.boundsMin[k]!;
    expect(span).toBeGreaterThan(2.6);
    expect(span).toBeLessThan(3.1);
  }
  expect(wrapped.points).toBe(start.points);
  expect(wrapped.triangles).toBe(start.triangles);
  expectGoodMesh(wrapped);
  await page.screenshot({ path: "test-results/shrinkwrapped-cube.png" });

  await page.keyboard.press("Control+z");
  await expect
    .poll(
      async () => {
        const facts = await meshFacts(page);
        return facts.boundsMax[0]! - facts.boundsMin[0]!;
      },
      { timeout: 20_000 },
    )
    .toBeLessThan(1.1);
});

test("a cube standing beside the sphere still covers the whole sphere", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await newProject(page);
  await addShape(page, "Sphere");
  await addShape(page, "Cube");
  await setTransform(page, { position: [2.5, 0, 0] });
  await page.getByRole("button", { name: /Edit points/ }).click();
  await expect(page.getByText(/\d+ triangles/).first()).toBeVisible();
  await press(page, "Divide");
  await setNumber(page, "Cuts", 6);
  await settled(page);
  await page
    .getByLabel("Object to wrap onto")
    .selectOption({ label: "Sphere" });
  await press(page, "Shrinkwrap");
  await expect(
    page.getByText(/Wrapped \d+ of \d+ points onto/).first(),
  ).toBeVisible();
  const wrapped = await settled(page);
  for (let k = 0; k < 3; k++) {
    const span = wrapped.boundsMax[k]! - wrapped.boundsMin[k]!;
    expect(span).toBeGreaterThan(0.9);
    expect(span).toBeLessThan(1.1);
  }
  expectGoodMesh(wrapped);
});
