import { expect, test } from "@playwright/test";
import {
  addShape,
  meshFacts,
  moveSelected,
  newProject,
  press,
  selectBox,
  setNumber,
  settled,
} from "./helpers";

const hiddenFacts = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__sceneroom!.hiddenFacts()!);

/**
 * Hide and show: a cube divided into 2 by 2 squares per side (48 triangles). The top face is hidden with Hide (Faces
 * mode, so only the top face goes), something behind it is moved, and Show all brings the top back. Hiding must not
 * change the stored mesh, moving a point must keep the hidden parts hidden, and a change of shape (Divide) must show
 * them again with a message.
 */
test("hide the top of a cube, edit behind it, show it again", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await newProject(page);
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await press(page, "Divide");
  await setNumber(page, "Cuts", 1);
  const start = await settled(page);
  expect(start.triangles).toBe(48);

  // Faces mode, then the top face: 8 triangles are hidden and no longer drawn, the mesh keeps all 48
  await page.getByRole("button", { name: /^Faces/ }).click();
  await selectBox(page, [-1, 0.49, -1], [1, 1, 1]);
  await press(page, "Hide");
  await expect.poll(async () => (await hiddenFacts(page)).hidden).toBe(8);
  expect((await hiddenFacts(page)).drawn).toBe(40);
  // The points of the top's rim also belong to the sides, so they stay in view (and selected)
  const hiddenMesh = await meshFacts(page);
  expect(hiddenMesh.triangles).toBe(48);
  expect(hiddenMesh.openEdges).toBe(0);
  await page.screenshot({ path: "test-results/hide-top.png" });

  // Moving points behind the hidden top keeps it hidden (the shape did not change)
  await selectBox(page, [-1, -1, -1], [1, -0.49, 1]);
  await moveSelected(page, [0, -0.2, 0]);
  await settled(page);
  expect((await hiddenFacts(page)).hidden).toBe(8);
  expect((await meshFacts(page)).boundsMin[1]).toBeLessThan(-0.6);

  // Show all brings the top back and selects it
  await press(page, "Show all");
  await expect.poll(async () => (await hiddenFacts(page)).hidden).toBe(0);
  expect((await hiddenFacts(page)).drawn).toBe(48);
  expect((await hiddenFacts(page)).selected).toBeGreaterThan(0);

  // Hide others keeps only what is selected in view; a change of the shape shows everything again
  await selectBox(page, [-1, 0.49, -1], [1, 1, 1]);
  await press(page, "Hide others");
  await expect.poll(async () => (await hiddenFacts(page)).drawn).toBe(8);
  await page.getByRole("button", { name: /^Points/ }).click();
  await selectBox(page, [-1, 0.49, -1], [1, 1, 1]);
  await press(page, "Divide");
  await setNumber(page, "Cuts", 1);
  await expect(
    page.getByText("The shape changed, so the hidden parts were shown again."),
  ).toBeVisible();
  expect((await hiddenFacts(page)).hidden).toBe(0);
});
