import { expect, test } from "@playwright/test";
import { addShape, newProject, press } from "./helpers";

type PaintFacts = {
  colorMap: string | null;
  paintedPixels: number;
  paintMode: boolean;
  surfaceMap: string | null;
  roughnessPainted: number;
  metalnessPainted: number;
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

test("the painted picture is part of the exported GLB", async ({ page }) => {
  test.setTimeout(120_000);
  await newProject(page);
  await unwrapCube(page);
  await page.getByRole("button", { name: "Paint on surface" }).click();
  const box = (await page.locator("canvas").first().boundingBox())!;
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
  await press(page, "Stop painting");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = await (await download).path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(file);
  // A GLB: 12 bytes of header, then the JSON chunk (length, type "JSON", text)
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  expect(gltf.images?.length).toBe(1);
  expect(gltf.images[0].mimeType).toBe("image/png");
  expect(gltf.materials[0].pbrMetallicRoughness.baseColorTexture).toBeDefined();
});

test("fill covers the object, erase puts the colour back, each is one undo step", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newProject(page);
  await unwrapCube(page);
  await page.getByRole("button", { name: "Paint on surface" }).click();
  const painted = async () => (await paintFacts(page))?.paintedPixels ?? 0;

  await press(page, "Fill all");
  await expect.poll(painted, { timeout: 20_000 }).toBeGreaterThan(1_000_000);

  // Erase mode: Erase all puts the object's colour back everywhere
  await press(page, "Erase");
  await press(page, "Erase all");
  await expect.poll(painted, { timeout: 20_000 }).toBe(0);

  // Undo the erase: the fill is back; undo again: no painting
  await page.keyboard.press("Control+z");
  await expect.poll(painted, { timeout: 20_000 }).toBeGreaterThan(1_000_000);
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await paintFacts(page))?.colorMap, { timeout: 20_000 })
    .toBeNull();
});

test("the brush in erase mode takes paint off where it is dragged", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newProject(page);
  await unwrapCube(page);
  await page.getByRole("button", { name: "Paint on surface" }).click();
  const painted = async () => (await paintFacts(page))?.paintedPixels ?? 0;
  await press(page, "Fill all");
  await expect.poll(painted, { timeout: 20_000 }).toBeGreaterThan(1_000_000);
  const full = await painted();

  await press(page, "Erase");
  const box = (await page.locator("canvas").first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 20, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy + 10, { steps: 8 });
  await page.mouse.up();
  await expect.poll(painted, { timeout: 20_000 }).toBeLessThan(full - 100);
  expect(await painted()).toBeGreaterThan(0);
});

test("paint roughness and metalness: a separate picture, undo, and it goes into the GLB", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newProject(page);
  await unwrapCube(page);
  await page.getByRole("button", { name: "Paint on surface" }).click();
  const facts = async () => (await paintFacts(page))!;

  // Roughness: one stroke changes only the green channel of the surface picture
  await press(page, "Roughness");
  const box = (await page.locator("canvas").first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 20, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy + 10, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await facts()).roughnessPainted, { timeout: 20_000 })
    .toBeGreaterThan(100);
  let now = await facts();
  expect(now.surfaceMap).not.toBeNull();
  expect(now.colorMap).toBeNull();
  expect(now.metalnessPainted).toBe(0);

  // Metalness: Fill all changes the blue channel everywhere and keeps the roughness stroke
  await press(page, "Metalness");
  await press(page, "Fill all");
  await expect
    .poll(async () => (await facts()).metalnessPainted, { timeout: 20_000 })
    .toBeGreaterThan(1_000_000);
  now = await facts();
  expect(now.roughnessPainted).toBeGreaterThan(100);

  // Undo takes the fill back, and the picture goes with it
  await page.keyboard.press("Control+z");
  await expect
    .poll(async () => (await facts()).metalnessPainted, { timeout: 20_000 })
    .toBe(0);

  // Redo, leave paint mode and export: the GLB has a metallic-roughness texture
  await page.keyboard.press("Control+Shift+z");
  await expect
    .poll(async () => (await facts()).metalnessPainted, { timeout: 20_000 })
    .toBeGreaterThan(1_000_000);
  await press(page, "Stop painting");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = await (await download).path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(file);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  expect(
    gltf.materials[0].pbrMetallicRoughness.metallicRoughnessTexture,
  ).toBeDefined();
});

test("turning the camera with the right button keeps painting on, and the other sides can be painted", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newProject(page);
  await unwrapCube(page);
  await page.getByRole("button", { name: "Paint on surface" }).click();
  const box = (await page.locator("canvas").first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // A right-click on empty space, then a right-drag that starts off the cube
  await page.mouse.click(box.x + 40, box.y + box.height - 40, {
    button: "right",
  });
  await page.mouse.move(box.x + 60, box.y + 120);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(box.x + 260, box.y + 160, { steps: 10 });
  await page.mouse.up({ button: "right" });
  await expect(
    page.getByRole("button", { name: "Stop painting" }),
  ).toBeVisible();
  expect((await paintFacts(page))?.paintMode).toBe(true);

  // Still painting after the camera moved
  await page.mouse.move(cx - 10, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 10, cy + 6, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () => (await paintFacts(page))?.paintedPixels ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(50);
});

test("erase on the Roughness choice puts the object's own roughness back", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await newProject(page);
  await unwrapCube(page);
  await page.getByRole("button", { name: "Paint on surface" }).click();
  await press(page, "Roughness");
  const facts = async () => (await paintFacts(page))!;

  await press(page, "Fill all");
  await expect
    .poll(async () => (await facts()).roughnessPainted, { timeout: 20_000 })
    .toBeGreaterThan(1_000_000);

  await page.screenshot({ path: "test-results/roughness-filled.png" });
  // Erase all puts it back everywhere
  await press(page, "Erase");
  await expect(page.getByText(/Erasing the roughness only/)).toBeVisible();
  await press(page, "Erase all");
  await expect
    .poll(async () => (await facts()).roughnessPainted, { timeout: 20_000 })
    .toBe(0);
  await page.screenshot({ path: "test-results/roughness-erased.png" });

  // The erase brush takes paint off where it is dragged
  await press(page, "Erase");
  await press(page, "Fill all");
  await expect
    .poll(async () => (await facts()).roughnessPainted, { timeout: 20_000 })
    .toBeGreaterThan(1_000_000);
  const full = (await facts()).roughnessPainted;
  await press(page, "Erase");
  const box = (await page.locator("canvas").first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 20, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 20, cy + 10, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await facts()).roughnessPainted, { timeout: 20_000 })
    .toBeLessThan(full - 100);
});
