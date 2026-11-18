import { expect, test, type Page } from "@playwright/test";
import {
  addShape,
  blurFocus,
  expectGoodMesh,
  factsAfterChange,
  meshFacts,
  moveSelected,
  newProject,
  selectBox,
  setColor,
  setNumber,
  setSliderNumber,
  setTransform,
  settled,
} from "./helpers";

/** Presses a button of the edit panel by its name. */
const press = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).click();

/** Extrudes whatever is selected: the settings are typed in, then it waits for the mesh to settle. Returns the mesh facts. */
async function extrude(
  page: Page,
  distance: number,
  divisions: number,
  scalePercent: number,
) {
  const before = (await meshFacts(page)).triangles;
  await press(page, "Extrude");
  await expect(page.getByText("Extrude settings")).toBeVisible();
  await setNumber(page, "Distance", distance);
  await setNumber(page, "Divisions", divisions);
  await setNumber(page, "Scale", scalePercent);
  await factsAfterChange(page, before);
  const facts = await settled(page);
  expectGoodMesh(facts);
  return facts;
}

/** Insets whatever is selected (a smaller face inside it, with a border round it), so neighbours stay apart. */
async function inset(page: Page, facePercent: number) {
  const before = (await meshFacts(page)).triangles;
  await press(page, "Inset");
  await expect(page.getByText("Inset settings")).toBeVisible();
  await setNumber(page, "Face size", facePercent);
  await factsAfterChange(page, before);
  expectGoodMesh(await settled(page));
}

/**
 * Models a hand with the real buttons, from one cube:
 *  - the palm is the cube; a wrist and forearm come out of its back (Extrude with a taper),
 *  - four fingers come out of the front face: each is three squares of a 5 by 5 grid (Divide), pulled apart from its
 *    neighbours (Inset), pushed out in three segments for the joints and tapered (Extrude), then its tip is curled,
 *  - the thumb comes out of the side, lower down, and is turned towards the fingers,
 *  - then it is unwrapped (to check the map), given palm proportions, rounded with Smooth and coloured.
 * After every step the mesh must stay valid and closed. Screenshots go to test-results/, and the hand to
 * e2e-output/hand.sceneroom (open it from the home screen).
 */
test("model a realistic hand: divide, inset, extrude, curl, unwrap, smooth", async ({
  page,
}) => {
  test.setTimeout(480_000);
  await newProject(page);
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "UV window", exact: true }).click();

  // 1. Every side of the cube becomes a 5 by 5 grid (nothing selected divides the whole mesh), so the grids of
  // neighbouring sides match along their shared edges: the fingers and the thumb come out of the squares
  await press(page, "Divide");
  await setNumber(page, "Cuts", 4);
  await factsAfterChange(page, 12);
  let facts = await settled(page);
  expectGoodMesh(facts);
  expect(facts.hasUvs).toBe(true);
  expect(facts.triangles).toBe(6 * 25 * 2);

  // 2. The wrist: the back face is pushed out, narrowing to a wrist
  await selectBox(page, [-0.5, -0.5, -0.51], [0.5, 0.5, -0.49]);
  facts = await extrude(page, 0.55, 3, 65);
  expect(facts.boundsMin[2]).toBeLessThan(-0.9);
  await page.screenshot({ path: "test-results/hand-1-wrist.png" });

  // 3. Four fingers (little, ring, middle, index): three squares tall, pulled apart, three segments, tapered, curled
  const fingers = [
    { x: -0.4, length: 0.6, curl: -0.05 },
    { x: -0.2, length: 0.78, curl: -0.06 },
    { x: 0, length: 0.86, curl: -0.07 },
    { x: 0.2, length: 0.8, curl: -0.06 },
  ];
  for (const finger of fingers) {
    await selectBox(
      page,
      [finger.x - 0.1, -0.3, 0.49],
      [finger.x + 0.1, 0.3, 0.51],
    );
    await inset(page, 72);
    facts = await extrude(page, finger.length, 3, 78);
    // The tip is selected after the extrusion: curl it down a little
    await moveSelected(page, [0, finger.curl, 0]);
    expectGoodMesh(await settled(page));
  }
  expect(facts.boundsMax[2]).toBeGreaterThan(1.2);
  await page.screenshot({ path: "test-results/hand-2-fingers.png" });

  // 4. The thumb comes out of a square of the right side, back from the fingers, and is turned towards them
  await selectBox(page, [0.49, -0.3, 0.09], [0.51, 0.3, 0.31]);
  await inset(page, 70);
  facts = await extrude(page, 0.5, 2, 72);
  await moveSelected(page, [0.05, -0.04, 0.3]);
  expectGoodMesh(await settled(page));
  expect(facts.boundsMax[0]).toBeGreaterThan(0.95);
  await page.screenshot({ path: "test-results/hand-3-thumb.png" });

  // 5. Unwrap: a map for the whole hand, with nothing folded over
  await press(page, "Unwrap");
  await expect(page.getByText(/Unwrapped into \d+ pieces/)).toBeVisible();
  facts = await settled(page);
  expectGoodMesh(facts);
  expect(facts.hasUvs).toBe(true);
  expect(facts.uvFolded).toBe(0);
  await page.screenshot({ path: "test-results/hand-4-unwrapped.png" });

  // 6. Out of edit mode: palm proportions (wide, flat and long), a turn to look at it, skin colour
  await page.getByRole("button", { name: /Leave edit mode/ }).click();
  await setTransform(page, { scale: [1.7, 0.6, 2.0], rotation: [-28, -35, 0] });
  await setColor(page, "#E2B392");
  await blurFocus(page);
  await page.keyboard.press("f");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/hand-5-blocky.png" });

  // 7. Smooth rounds everything off (two levels): fingers and palm lose their corners
  await page.getByRole("button", { name: "Smooth", exact: true }).click();
  await setSliderNumber(page, "Smoothness", 2);
  await blurFocus(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/hand-6-smooth.png" });

  // 8. The hand is kept as a project file, so it can be opened in the editor and looked at (Open file on the home screen)
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  await download.saveAs("e2e-output/hand.sceneroom");
});
