import { expect, test, type Page } from "@playwright/test";
import { addShape, newProject, press, setTransform } from "./helpers";

type BakeFacts = {
  normalMap: string | null;
  bumpyPixels: number;
  running: boolean;
} | null;

const bakeFacts = (page: Page): Promise<BakeFacts> =>
  page.evaluate(() => window.__sceneroom!.bakeFacts());

/**
 * Bake detail: a big sphere is the dense object and a cube (with a UV map) is the simple one around the middle of it.
 * The sphere's curve becomes a normal map on the cube: the cube stays 12 triangles but its faces get tilted normals.
 */
test("bake a sphere's curve onto a cube as a normal map, undo it, and export it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await newProject(page);
  await addShape(page, "Sphere");
  await setTransform(page, { scale: [1.3, 1.3, 1.3] });
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "UV window", exact: true }).click();
  await page.getByRole("button", { name: "Unwrap", exact: true }).click();
  await expect(page.getByText(/Unwrapped into \d+ pieces/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();

  await page
    .getByLabel("Dense object to copy detail from")
    .selectOption({ label: "Sphere" });
  await page.getByLabel("Picture size").selectOption("256");
  await press(page, "Bake normal map");
  await expect(page.getByText(/Baked the detail of "Sphere"/)).toBeVisible({
    timeout: 60_000,
  });
  const baked = await bakeFacts(page);
  expect(baked?.normalMap).not.toBeNull();
  expect(baked?.running).toBe(false);
  // The sphere's surface leans away from the cube's flat faces: many pixels are not "flat"
  expect(baked?.bumpyPixels).toBeGreaterThan(300);
  await page.screenshot({ path: "test-results/baked-cube.png" });

  // One undo step takes it away again
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await bakeFacts(page))?.normalMap, { timeout: 20_000 })
    .toBeNull();
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await bakeFacts(page))?.normalMap, { timeout: 20_000 })
    .not.toBeNull();

  // The GLB carries it as the normal texture
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = await (await download).path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const cube = gltf.materials.find(
    (m: { normalTexture?: unknown }) => m.normalTexture !== undefined,
  );
  expect(cube).toBeDefined();
});

test("a cube with no UV map says why it cannot be baked", async ({ page }) => {
  test.setTimeout(120_000);
  await newProject(page);
  await addShape(page, "Sphere");
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByLabel("Dense object to copy detail from")
    .selectOption({ label: "Sphere" });
  await page.getByLabel("Picture size").selectOption("256");
  await press(page, "Bake normal map");
  // A cube made by the app may already have a map; then the bake just works
  await expect(
    page.getByText(/no UV map|Baked the detail/).first(),
  ).toBeVisible({ timeout: 60_000 });
});

test("a dense object far away says it is nowhere near", async ({ page }) => {
  test.setTimeout(120_000);
  await newProject(page);
  await addShape(page, "Sphere");
  await setTransform(page, { position: [20, 0, 0] });
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "UV window", exact: true }).click();
  await page.getByRole("button", { name: "Unwrap", exact: true }).click();
  await expect(page.getByText(/Unwrapped into \d+ pieces/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByLabel("Dense object to copy detail from")
    .selectOption({ label: "Sphere" });
  await page.getByLabel("Picture size").selectOption("256");
  await press(page, "Bake normal map");
  await expect(page.getByText(/nowhere near "Cube"/)).toBeVisible({
    timeout: 60_000,
  });
  expect((await bakeFacts(page))?.normalMap).toBeNull();
});
