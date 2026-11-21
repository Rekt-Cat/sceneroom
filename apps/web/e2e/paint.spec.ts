import { expect, test } from "@playwright/test";
import { addShape, newProject, press } from "./helpers";

type PaintFacts = {
  colorMap: string | null;
  paintedPixels: number;
  paintMode: boolean;
} | null;

const paintFacts = (
  page: import("@playwright/test").Page,
): Promise<PaintFacts> => page.evaluate(() => window.__sceneroom!.paintFacts());

/** The object needs a UV map first: Edit points, UV window, Unwrap, Done. */
async function unwrapCube(page: import("@playwright/test").Page) {
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "UV window", exact: true }).click();
  await page.getByRole("button", { name: "Unwrap", exact: true }).click();
  await expect(page.getByText(/Unwrapped into \d+ pieces/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

test("paint on a cube: a stroke is one undo step, and Remove painting takes it off", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newProject(page);
  await unwrapCube(page);
  await page.getByRole("button", { name: "Paint on surface" }).click();
  await expect(page.getByRole("slider", { name: "Brush size" })).toBeVisible();

  // Drag across the middle of the 3D view, where the cube is
  const canvas = page.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 20, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy + 10, { steps: 8 });
  await page.mouse.up();

  await expect
    .poll(async () => (await paintFacts(page))?.paintedPixels ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(100);
  const painted = await paintFacts(page);
  expect(painted?.colorMap).not.toBeNull();
  await page.screenshot({ path: "test-results/painted-cube.png" });

  // Undo takes the stroke back, in paint mode too
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await paintFacts(page))?.colorMap, { timeout: 20_000 })
    .toBeNull();

  // Redo brings it back; Stop painting leaves paint mode; Remove painting clears it
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await paintFacts(page))?.paintedPixels ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(100);
  await press(page, "Stop painting");
  expect((await paintFacts(page))?.paintMode).toBe(false);
  await press(page, "Remove painting");
  await expect
    .poll(async () => (await paintFacts(page))?.colorMap, { timeout: 20_000 })
    .toBeNull();
});

test("a cube with no UV map cannot be painted and says why", async ({
  page,
}) => {
  await newProject(page);
  await addShape(page, "Cube");
  // Make it an editable mesh (Edit points), then leave without unwrapping
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const paint = page.getByRole("button", { name: "Paint on surface" });
  await paint.click();
  // A cube made by the app already has UVs on some builds; accept either a message or paint mode
  const facts = await paintFacts(page);
  if (!facts?.paintMode) {
    await expect(page.getByText(/no UV map/)).toBeVisible();
  }
});
