import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createLinkToken } from "../../collab-server/src/linkToken";
import { COLLAB_TEST_SECRET, COLLAB_TEST_URL } from "./collabSettings";
import {
  addShape,
  meshFacts,
  newProject,
  setColor,
  setTransform,
} from "./helpers";

/** The address of a shared project: the project, the server and the link token (and the scene, for a new browser). */
function sharedAddress(
  projectId: string,
  role: "editor" | "viewer",
  sceneId?: string,
): string {
  const token = createLinkToken({ projectId, role }, COLLAB_TEST_SECRET);
  const query = new URLSearchParams({ collab: COLLAB_TEST_URL, token });
  if (sceneId) query.set("scene", sceneId);
  return `/p/${projectId}?${query.toString()}`;
}

/** Every browser context a test opened; closed after the test (pages with a 3D view are heavy to keep around). */
const opened: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

/** A new person: a browser context with its own storage, and a page in it. */
async function person(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  opened.push(context);
  return context.newPage();
}

/** The objects of the open scene (name, colour, position), read from the editor's own state. */
const summary = (page: Page) =>
  page.evaluate(() => window.__sceneroom!.sceneSummary());

async function waitOnline(page: Page): Promise<void> {
  await expect(page.getByTestId("collab-status")).toHaveText("Online");
}

/** Window A makes a project and goes online; returns what window B needs to join it. */
async function startShared(page: Page) {
  await newProject(page);
  const projectId = /\/p\/([^/?#]+)/.exec(page.url())![1]!;
  const sceneId = await page.evaluate(() =>
    window.__sceneroom!.activeSceneId(),
  );
  await page.goto(sharedAddress(projectId, "editor"));
  await waitOnline(page);
  return { projectId, sceneId };
}

test("two windows share one scene: what one person does, the other sees", async ({
  browser,
}) => {
  // Two browser contexts are two people: each has its own storage
  const alice = await person(browser);
  const bob = await person(browser);

  const { projectId, sceneId } = await startShared(alice);
  await bob.goto(sharedAddress(projectId, "editor", sceneId));
  await waitOnline(bob);
  await expect(bob.locator("canvas").first()).toBeVisible();

  // Bob joined with an empty scene and received Alice's (the starting cube)
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(Object.keys(await summary(alice)));

  // Alice adds a sphere and paints it red; Bob sees both
  await addShape(alice, "Sphere");
  await setColor(alice, "#ff0000");
  await expect
    .poll(async () => (await summary(bob))["Sphere"]?.color)
    .toBe("#ff0000");

  // Bob adds a cone and moves it; Alice sees it there
  await addShape(bob, "Cone");
  await setTransform(bob, { position: [3, 0.5, 2] });
  await expect
    .poll(async () => (await summary(alice))["Cone"]?.position)
    .toEqual([3, 0.5, 2]);

  // Both windows now show the same scene
  expect(await summary(alice)).toEqual(await summary(bob));
  await alice.screenshot({ path: "test-results/collab-alice.png" });
  await bob.screenshot({ path: "test-results/collab-bob.png" });
});

test("a reload keeps the shared scene, and a link that is not accepted says so", async ({
  browser,
}) => {
  const alice = await person(browser);
  const { projectId } = await startShared(alice);
  await addShape(alice, "Cube");
  await addShape(alice, "Sphere");
  await expect
    .poll(async () => Object.keys(await summary(alice)).sort())
    .toEqual(["Cube", "Sphere"]);

  await alice.reload();
  await waitOnline(alice);
  await expect
    .poll(async () => Object.keys(await summary(alice)).sort())
    .toEqual(["Cube", "Sphere"]);

  // A link signed with the wrong secret is refused by the server
  const stranger = await person(browser);
  const bad = createLinkToken(
    { projectId, role: "editor" },
    "another-secret-that-is-long-enough-1",
  );
  await stranger.goto(
    `/p/${projectId}?${new URLSearchParams({ collab: COLLAB_TEST_URL, token: bad, scene: "any-scene" })}`,
  );
  await expect(stranger.getByTestId("collab-status")).toHaveText(
    "Link not accepted",
  );
});

test("a viewer sees the scene, and nothing a viewer does reaches the others", async ({
  browser,
}) => {
  const alice = await person(browser);
  const viewer = await person(browser);
  const { projectId, sceneId } = await startShared(alice);
  await addShape(alice, "Cube");
  await expect
    .poll(async () => Object.keys(await summary(alice)))
    .toEqual(["Cube"]);

  await viewer.goto(sharedAddress(projectId, "viewer", sceneId));
  await waitOnline(viewer);
  await expect
    .poll(async () => Object.keys(await summary(viewer)))
    .toEqual(Object.keys(await summary(alice)));

  // The viewer tries to add something. The server ignores it ...
  await addShape(viewer, "Cone");
  // ... while Alice's change goes through, so we know the server had time to act
  await addShape(alice, "Sphere");
  await expect
    .poll(async () => Object.keys(await summary(viewer)).includes("Sphere"))
    .toBe(true);
  expect(Object.keys(await summary(alice))).not.toContain("Cone");
});

/** A cube turned into an editable mesh with a UV map (so it has a stored file): Edit points, Unwrap, Done. */
async function makeUnwrappedCube(page: Page, shape = "Cube"): Promise<void> {
  await addShape(page, shape);
  await page.getByRole("button", { name: /Edit points/ }).click();
  await page.getByRole("button", { name: "UV window", exact: true }).click();
  await page.getByRole("button", { name: "Unwrap", exact: true }).click();
  await expect(page.getByText(/Unwrapped into \d+ pieces/)).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

test("an edited mesh travels with the scene: the other window downloads its file", async ({
  browser,
}) => {
  const alice = await person(browser);
  const bob = await person(browser);
  const { projectId, sceneId } = await startShared(alice);

  // A mesh made before Bob arrives ...
  await makeUnwrappedCube(alice);
  const aliceFacts = await meshFacts(alice);
  expect(aliceFacts.hasUvs).toBe(true);

  await bob.goto(sharedAddress(projectId, "editor", sceneId));
  await waitOnline(bob);
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Cube"]);
  // ... Bob selects it, and its points and map are read from the file he downloaded
  await bob.getByRole("button", { name: "Cube", exact: true }).first().click();
  await expect
    .poll(
      async () =>
        (await bob.evaluate(() => window.__sceneroom!.meshFacts()))?.hasUvs,
    )
    .toBe(true);
  const bobFacts = await meshFacts(bob);
  expect(bobFacts.points).toBe(aliceFacts.points);
  expect(bobFacts.triangles).toBe(aliceFacts.triangles);
  expect(bobFacts.uvPieces).toBe(aliceFacts.uvPieces);

  // ... and one made while Bob is already there arrives the same way
  await makeUnwrappedCube(alice, "Cone");
  const coneFacts = await meshFacts(alice);
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toContain("Cone");
  await bob.getByRole("button", { name: "Cone", exact: true }).first().click();
  await expect
    .poll(
      async () =>
        (await bob.evaluate(() => window.__sceneroom!.meshFacts()))?.points,
    )
    .toBe(coneFacts.points);
});
