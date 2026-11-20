import { expect, test } from "@playwright/test";
import {
  addShape,
  expectGoodMesh,
  meshFacts,
  newProject,
  press,
  setNumber,
  settled,
} from "./helpers";

/**
 * A crate: a cube, divided and unwrapped, then its map edited in the UV window with the real controls: click a piece
 * to choose it, make it bigger, mirror it, turn it, drag it, and Pack all pieces again. Only the map may change: the
 * shape stays a valid closed mesh, no face may turn over on the map, and every step can be undone.
 */
test("a crate: unwrap a cube, then edit its UV map in the UV window", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await newProject(page);
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await press(page, "Divide");
  await setNumber(page, "Cuts", 1);
  await page.getByRole("button", { name: "UV window", exact: true }).click();
  await press(page, "Unwrap");
  await expect(page.getByText(/Unwrapped into 6 pieces/)).toBeVisible();
  await settled(page);
  const before = await meshFacts(page);
  expect(before.uvPieces).toBe(6);
  const shape = before.triangles;

  const window = page.getByRole("group", { name: "UV window" });
  const canvas = window.getByLabel("The UV map of the mesh");
  const box = (await canvas.boundingBox())!;

  // Nothing is chosen yet: the piece buttons are off
  await expect(window.getByRole("button", { name: "Bigger" })).toBeDisabled();

  // Click the first piece (a spot of the map near the lower left, where the packing starts)
  await canvas.click({
    position: { x: box.width * 0.06, y: box.height * 0.94 },
  });
  await expect(window.getByRole("button", { name: "Bigger" })).toBeEnabled();

  // Smaller then Bigger changes the area the map covers, and the shape never changes
  await window.getByRole("button", { name: "Smaller" }).click();
  await expect
    .poll(async () => (await meshFacts(page)).uvArea, { timeout: 20_000 })
    .toBeLessThan(before.uvArea);
  const smaller = await settled(page);
  expect(smaller.triangles).toBe(shape);
  expectGoodMesh(smaller);

  // A mirrored piece is turned over on the map, which the Stretch view counts as folded; mirroring again undoes it
  await window.getByRole("button", { name: "Mirror" }).click();
  await expect
    .poll(async () => (await meshFacts(page)).uvFolded, { timeout: 20_000 })
    .toBeGreaterThan(0);
  await window.getByRole("button", { name: "Mirror" }).click();
  await expect
    .poll(async () => (await meshFacts(page)).uvFolded, { timeout: 20_000 })
    .toBe(0);
  await window.getByRole("button", { name: "Turn left" }).click();
  await settled(page);

  // Dragging the chosen piece moves it, as one change
  await window.getByRole("button", { name: "Mirror" }).waitFor();
  await page.mouse.move(box.x + box.width * 0.06, box.y + box.height * 0.94);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.9, {
    steps: 5,
  });
  await page.mouse.up();
  const dragged = await settled(page);
  expect(dragged.uvPieces).toBe(6);

  // Pack puts every piece back inside the square without overlap: the same pieces, none turned over
  await window.getByRole("button", { name: "Pack", exact: true }).click();
  await settled(page);
  const packed = await meshFacts(page);
  expect(packed.uvPieces).toBe(6);
  expect(packed.uvFolded).toBe(0);
  expect(packed.triangles).toBe(shape);
  expectGoodMesh(packed);
  await page.screenshot({ path: "test-results/crate-uv-edited.png" });

  // Undo goes back one step at a time: Pack, the drag, the turn, two mirrors and Smaller are six steps, after which
  // the map covers the area it did right after Unwrap
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
  }
  await expect
    .poll(async () => (await meshFacts(page)).uvArea, { timeout: 20_000 })
    .toBeCloseTo(before.uvArea, 4);
});
