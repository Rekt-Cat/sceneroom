import { expect, type Page } from "@playwright/test";
import type { MeshFacts } from "../src/testHooks";

/** Opens the home screen, makes a new blank project and waits for the editor (with its 3D view) to be there. */
export async function newProject(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "+ New project" }).click();
  await page.waitForURL(/\/p\/.+/);
  await expect(page.locator("canvas").first()).toBeVisible();
}

/** Adds a built-in shape from the Add menu (the Shapes tab is the one that opens). */
export async function addShape(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${label}`) }).click();
}

/** Types a number into a setting's box (the boxes next to the sliders) and confirms it. */
export async function setNumber(
  page: Page,
  label: string,
  value: number,
): Promise<void> {
  const box = page.getByLabel(`${label} value`);
  await box.fill(String(value));
  await box.press("Enter");
}

/** Facts about the mesh being edited (read through the test hooks). */
export async function meshFacts(page: Page): Promise<MeshFacts> {
  const facts = await page.evaluate(() => window.__sceneroom!.meshFacts());
  expect(facts, "there is a mesh to look at").not.toBeNull();
  return facts!;
}

/** Selects the points of the edited mesh inside a box (in the mesh's own space). */
export async function selectBox(
  page: Page,
  min: [number, number, number],
  max: [number, number, number],
): Promise<number> {
  return page.evaluate(([a, b]) => window.__sceneroom!.selectBox(a, b), [
    min,
    max,
  ] as const);
}

/** Moves the selected points by a distance (one stored change, like letting go of the gizmo). */
export async function moveSelected(
  page: Page,
  delta: [number, number, number],
): Promise<void> {
  const ok = await page.evaluate(
    (d) => window.__sceneroom!.moveSelected(d),
    delta,
  );
  expect(ok).toBe(true);
}

/** Sets the colour of the selected object. */
export async function setColor(page: Page, hex: string): Promise<void> {
  await page.evaluate((c) => window.__sceneroom!.setColor(c), hex);
}

/** Sets the position, rotation (degrees) or scale of the selected object. */
export async function setTransform(
  page: Page,
  change: {
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
  },
): Promise<void> {
  await page.evaluate((c) => window.__sceneroom!.setTransform(c), change);
}

/** What a mesh must always be after a tool: valid, with a map that is not folded, and (when `closed`) a closed shape. */
export function expectGoodMesh(facts: MeshFacts, closed = true): void {
  expect(facts.problem).toBeNull();
  // On a failure the message lists where the bad edges are
  expect(
    facts.crowdedEdges,
    `crowded edges: ${facts.badEdges.join(" | ")}`,
  ).toBe(0);
  if (closed)
    expect(facts.openEdges, `open edges: ${facts.badEdges.join(" | ")}`).toBe(
      0,
    );
}

/** Lets go of whatever has the keyboard focus, so a shortcut key goes to the editor and not into a number box. */
export async function blurFocus(page: Page): Promise<void> {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
}

/**
 * Waits until the mesh being edited has more triangles than `moreThan` (a change takes a moment to be stored after the
 * button or slider is used), then returns its facts.
 */
export async function factsAfterChange(
  page: Page,
  moreThan: number,
): Promise<MeshFacts> {
  await expect
    .poll(async () => (await meshFacts(page)).triangles, { timeout: 20_000 })
    .toBeGreaterThan(moreThan);
  return meshFacts(page);
}

/**
 * Waits until the mesh has stopped changing (the same points and triangles for several reads in a row): a slider or a
 * typed number is stored a moment after it is used, and a person would not press the next button before it was.
 */
export async function settled(page: Page): Promise<MeshFacts> {
  let last = "";
  let same = 0;
  for (let i = 0; i < 80 && same < 4; i++) {
    const facts = await meshFacts(page);
    const now = `${facts.points}/${facts.triangles}/${facts.boundsMax.join(",")}/${facts.uvArea.toFixed(5)}`;
    same = now === last ? same + 1 : 0;
    last = now;
    await page.waitForTimeout(250);
  }
  return meshFacts(page);
}

/** Types a number into the box of an Inspector slider (its label is "<name>, number from <min> to <max>"). */
export async function setSliderNumber(
  page: Page,
  name: string,
  value: number,
): Promise<void> {
  const box = page.getByLabel(new RegExp(`^${name}, number from`));
  await box.fill(String(value), { timeout: 10_000 });
  await box.press("Enter");
}

/** Presses a button of the edit panel by its name. */
export const press = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true }).click();

/** Extrudes whatever is selected: the settings are typed in, then it waits for the mesh to settle. Returns the mesh facts. */
export async function extrude(
  page: Page,
  distance: number,
  divisions: number,
  scalePercent: number,
) {
  const before = (await meshFacts(page)).triangles;
  await press(page, "Extrude");
  // The new extrusion has started when the mesh has more triangles. (The panel of the one before may still be on
  // screen until then: typing into it would change the OLD extrusion.)
  await factsAfterChange(page, before);
  await settled(page);
  await expect(page.getByText("Extrude settings")).toBeVisible();
  await setNumber(page, "Distance", distance);
  await setNumber(page, "Divisions", divisions);
  await setNumber(page, "Scale", scalePercent);
  await settled(page);
  const facts = await settled(page);
  expectGoodMesh(facts);
  return facts;
}

/** Insets whatever is selected (a smaller face inside it, with a border round it), so neighbours stay apart. */
export async function inset(page: Page, facePercent: number) {
  const before = (await meshFacts(page)).triangles;
  await press(page, "Inset");
  await factsAfterChange(page, before);
  await settled(page);
  await expect(page.getByText("Inset settings")).toBeVisible();
  await setNumber(page, "Face size", facePercent);
  expectGoodMesh(await settled(page));
}
