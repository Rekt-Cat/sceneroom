import { expect, test } from "@playwright/test";
import { addShape, newProject, setNumber } from "./helpers";

test("a new project opens the editor with a 3D view", async ({ page }) => {
  await newProject(page);
  await expect(
    page.getByRole("button", { name: "Add", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/new-project.png" });
});

test("a cube: divide it with the slider, then unwrap it", async ({ page }) => {
  await newProject(page);
  await addShape(page, "Cube");
  await expect(
    page.getByRole("button", { name: "Cube", exact: true }).first(),
  ).toBeVisible();

  // Edit mode: the cube becomes a mesh of 12 triangles
  await page.getByRole("button", { name: /Edit points/ }).click();
  await expect(page.getByText(/12 triangles/).first()).toBeVisible();

  // Divide only opens its panel; the slider does the cutting (3 cuts: each of the 6 squares becomes 16)
  await page.getByRole("button", { name: "Divide", exact: true }).click();
  await expect(page.getByText("Divide settings")).toBeVisible();
  await expect(page.getByText(/12 triangles/).first()).toBeVisible();
  await setNumber(page, "Cuts", 3);
  await expect(page.getByText(/192 triangles/).first()).toBeVisible();

  // The UV window, then Unwrap: six squares of the cube, each cut into a grid, make six pieces
  await page.getByRole("button", { name: "UV window", exact: true }).click();
  await expect(page.getByRole("group", { name: "UV window" })).toBeVisible();
  await page.getByRole("button", { name: "Unwrap", exact: true }).click();
  await expect(page.getByText(/Unwrapped into 6 pieces/)).toBeVisible();
  await expect(
    page.getByRole("group", { name: "UV window" }).getByText("6 pieces"),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/cube-unwrapped.png" });
});
