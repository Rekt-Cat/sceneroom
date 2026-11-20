import { expect, test } from "@playwright/test";
import {
  addShape,
  blurFocus,
  expectGoodMesh,
  extrude,
  factsAfterChange,
  inset,
  moveSelected,
  newProject,
  press,
  selectBox,
  setColor,
  setNumber,
  setSliderNumber,
  setTransform,
  settled,
} from "./helpers";

/**
 * Models a simple person (a mannequin) with the real buttons, all from ONE cube, the torso:
 *  - every side is divided into a 5 by 5 grid (Divide on the whole mesh), so neighbouring grids match,
 *  - two legs come out of the bottom (Inset, then Extrude in three segments with a taper, plus a flared foot),
 *  - two arms come out of the sides near the top (the same, then lowered a little), each ending in a hand,
 *  - a neck comes out of the top, flares out (Extrude with a scale above 100 percent) and a head is pushed up from it,
 *  - then it is unwrapped (to check the map), given a person's proportions, coloured and rounded with Smooth.
 * After every step the mesh must stay valid and closed. Screenshots go to test-results/, the person to
 * e2e-output/person.sceneroom (open it from the home screen).
 */
test("model a person: divide, inset, extrude limbs, neck and head, unwrap, smooth", async ({
  page,
}) => {
  test.setTimeout(600_000);
  await newProject(page);
  await addShape(page, "Cube");
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "UV window", exact: true }).click();

  // 1. Every side becomes a 5 by 5 grid
  await press(page, "Divide");
  await setNumber(page, "Cuts", 4);
  await factsAfterChange(page, 12);
  let facts = await settled(page);
  expectGoodMesh(facts);
  expect(facts.triangles).toBe(6 * 25 * 2);

  // 2. Legs: two squares of the bottom (y = -0.5) each, pulled apart, pushed down in three segments, tapered, with a foot
  for (const x of [-0.2, 0.2]) {
    await selectBox(page, [x - 0.1, -0.51, -0.3], [x + 0.1, -0.49, 0.1]);
    await inset(page, 78);
    facts = await extrude(page, 0.65, 3, 78); // thigh to ankle
    facts = await extrude(page, 0.06, 1, 135); // the foot: a short, wider block
    expectGoodMesh(facts);
  }
  expect(facts.boundsMin[1]).toBeLessThan(-1.1);
  await page.screenshot({ path: "test-results/person-1-legs.png" });

  // 3. Arms: out of the sides, near the top, each ending in a hand, then lowered a little
  for (const side of [1, -1]) {
    const x = 0.5 * side;
    await selectBox(page, [x - 0.01, 0.1, -0.3], [x + 0.01, 0.3, 0.1]);
    await inset(page, 75);
    facts = await extrude(page, 0.72, 3, 70); // shoulder to wrist
    await moveSelected(page, [0.12 * side, -0.32, 0]); // lower the arm
    facts = await extrude(page, 0.1, 1, 130); // the hand
    expectGoodMesh(facts);
  }
  expect(facts.boundsMax[0]).toBeGreaterThan(1.1);
  await page.screenshot({ path: "test-results/person-2-arms.png" });

  // 4. Neck and head: out of the top, a flare, then a head pushed up from it
  await selectBox(page, [-0.11, 0.49, -0.3], [0.11, 0.51, 0.1]);
  await inset(page, 70);
  facts = await extrude(page, 0.09, 1, 100); // the neck
  facts = await extrude(page, 0.03, 1, 215); // flares out to the width of the head
  facts = await extrude(page, 0.26, 2, 92); // the head
  expectGoodMesh(facts);
  expect(facts.boundsMax[1]).toBeGreaterThan(0.8);
  await page.screenshot({ path: "test-results/person-3-head.png" });

  // 5. Unwrap: a map for the whole person, with nothing folded over
  await press(page, "Unwrap");
  await expect(page.getByText(/Unwrapped into \d+ pieces/)).toBeVisible();
  facts = await settled(page);
  expectGoodMesh(facts);
  expect(facts.hasUvs).toBe(true);
  expect(facts.uvFolded).toBe(0);
  await page.screenshot({ path: "test-results/person-4-unwrapped.png" });

  // 6. Out of edit mode: a person's proportions (a torso 0.9 wide, 1.3 tall and 0.5 deep), a turn, colour
  await page.getByRole("button", { name: /Leave edit mode/ }).click();
  await setTransform(page, {
    scale: [0.9, 1.3, 0.5],
    rotation: [0, -30, 0],
    position: [0, 1.2, 0],
  });
  await setColor(page, "#D9A07C");
  await blurFocus(page);
  await page.keyboard.press("f");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "test-results/person-5-blocky.png" });

  // 7. Smooth rounds everything off
  await page.getByRole("button", { name: "Smooth", exact: true }).click();
  await setSliderNumber(page, "Smoothness", 2);
  await blurFocus(page);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "test-results/person-6-smooth.png" });

  // 8. Kept as a project file
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save", exact: true }).click(),
  ]);
  await download.saveAs("e2e-output/person.sceneroom");
});
