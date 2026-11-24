import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { createLinkToken } from "@sceneroom/link-token";
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
  await expect(viewer.getByTestId("collab-status")).toHaveText(
    "Online, view only",
  );
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

/** Lets go of the selection (Escape, then a click on empty space): the object is free for the other person again. */
async function letGo(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.mouse.click(1000, 600);
}

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
  // (the mesh stays Alice's while she has it selected, so she lets go before Bob picks it)
  await letGo(alice);

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
  await letGo(alice);
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

test("Undo online takes back only my own change, and Redo puts it back", async ({
  browser,
}) => {
  const alice = await person(browser);
  const bob = await person(browser);
  const { projectId, sceneId } = await startShared(alice);
  await bob.goto(sharedAddress(projectId, "editor", sceneId));
  await waitOnline(bob);

  // Alice adds a cube, Bob adds a sphere; both see both
  await addShape(alice, "Cube");
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Cube"]);
  await addShape(bob, "Sphere");
  await expect
    .poll(async () => Object.keys(await summary(alice)).sort())
    .toEqual(["Cube", "Sphere"]);

  // Alice undoes: her cube goes, Bob's sphere stays, in both windows
  await alice.getByRole("button", { name: /^Undo add cube/i }).click();
  await expect
    .poll(async () => Object.keys(await summary(alice)))
    .toEqual(["Sphere"]);
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Sphere"]);

  // Bob's own Undo takes back his sphere (and not anything of Alice's)
  await bob.getByRole("button", { name: /^Undo add sphere/i }).click();
  await expect.poll(async () => Object.keys(await summary(alice))).toEqual([]);

  // Alice redoes her cube; it comes back for both
  await alice.getByRole("button", { name: /^Redo add cube/i }).click();
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Cube"]);
});

test("one editor per object: while one person edits a mesh, the other is told and cannot", async ({
  browser,
}) => {
  const alice = await person(browser);
  const bob = await person(browser);
  const { projectId, sceneId } = await startShared(alice);
  await addShape(alice, "Cube");
  await bob.goto(sharedAddress(projectId, "editor", sceneId));
  await waitOnline(bob);
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Cube"]);

  // Alice enters Edit points on the cube (it is selected after she added it)
  await alice.getByRole("button", { name: /Edit points/ }).click();
  await expect(
    alice.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();

  // Bob sees who holds it
  await expect(bob.getByTestId("edit-lock")).toBeVisible();

  // Bob tries to select the cube: with selection locks it is Alice's while she has it selected, so he is told and gets nothing
  await bob.getByRole("button", { name: "Cube", exact: true }).first().click();
  await expect(bob.getByText(/is working on "Cube"/)).toBeVisible();
  await expect(bob.getByRole("button", { name: /Edit points/ })).toHaveCount(0);

  // Alice leaves Edit points and lets go of the cube (a click on empty space); the lock goes and Bob can edit
  await alice.getByRole("button", { name: "Done", exact: true }).click();
  await alice.keyboard.press("Escape");
  await alice.mouse.click(1000, 600);
  await expect(bob.getByTestId("edit-lock")).toHaveCount(0);
  await expect(bob.getByTestId("held-by")).toHaveCount(0);
  await bob.getByRole("button", { name: "Cube", exact: true }).first().click();
  await bob.getByRole("button", { name: /Edit points/ }).click();
  await expect(
    bob.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
});

test("presence: names, who selected what, and the other person's pointer", async ({
  browser,
}) => {
  const alice = await person(browser);
  const bob = await person(browser);
  const { projectId, sceneId } = await startShared(alice);
  await addShape(alice, "Cube");
  await bob.goto(sharedAddress(projectId, "editor", sceneId));
  await waitOnline(bob);
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Cube"]);

  // Each sees one other person in the top bar, with a guest name until one is chosen
  await expect(alice.getByTestId("presence-person")).toHaveCount(1);
  await expect(bob.getByTestId("presence-person")).toHaveCount(1);

  // Bob chooses a name; Alice sees it
  await bob.getByTestId("presence-me").click();
  await bob.getByLabel("Name others see").fill("Bobby");
  await bob.getByLabel("Name others see").press("Enter");
  await expect(alice.getByTestId("presence-person")).toHaveAttribute(
    "aria-label",
    "Bobby",
  );

  // Alice has the cube selected (she added it): Bob's list shows a marker, and a box is drawn
  await expect(bob.getByTestId("selected-by")).toHaveCount(1);
  // Alice deselects (a click on empty space): the marker goes
  await alice.keyboard.press("Escape");
  await alice.mouse.click(1000, 600);
  await expect(bob.getByTestId("selected-by")).toHaveCount(0);

  // Bob's pointer over his 3D view shows up in Alice's, with his name
  const canvas = bob.locator("canvas").first();
  const box = (await canvas.boundingBox())!;
  for (let i = 0; i < 12; i++) {
    await bob.mouse.move(
      box.x + box.width / 2 + i * 6,
      box.y + box.height / 2 + i * 3,
    );
    await bob.waitForTimeout(120);
  }
  await expect(alice.getByText("Bobby", { exact: true })).toBeVisible();

  // The name is kept in Bob's browser and can be reset
  await bob.getByTestId("presence-me").click();
  await bob.getByRole("button", { name: "Reset name" }).click();
  await expect(alice.getByTestId("presence-person")).not.toHaveAttribute(
    "aria-label",
    "Bobby",
  );
});

/** Opens the Share box, makes a link and returns it. The first link also puts the project online (the owner's own connection). */
async function makeLink(
  page: Page,
  role: "editor" | "viewer" = "editor",
): Promise<string> {
  if (
    !(await page
      .getByRole("dialog", { name: "Share this project" })
      .isVisible())
  ) {
    await page.getByRole("button", { name: "Share", exact: true }).click();
  }
  const dialog = page.getByRole("dialog", { name: "Share this project" });
  const server = dialog.getByLabel("Collab server address");
  if (await server.isEnabled()) {
    await server.fill(COLLAB_TEST_URL);
    await server.blur();
  }
  await dialog.getByLabel("What the link allows").selectOption(role);
  await dialog.getByRole("button", { name: "Create link" }).click();
  const field = dialog.getByTestId("share-link");
  await expect(field).toHaveValue(/collab=/);
  return field.inputValue();
}

test("Share: make a link, the other person opens it and works in the same scene; reopening reconnects", async ({
  browser,
}) => {
  const alice = await person(browser);
  const bob = await person(browser);
  await newProject(alice);
  await addShape(alice, "Cube");

  const link = await makeLink(alice);
  await waitOnline(alice);

  await bob.goto(link);
  await waitOnline(bob);
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Cube"]);

  // Bob adds something; Alice sees it
  await addShape(bob, "Sphere");
  await expect
    .poll(async () => Object.keys(await summary(alice)).sort())
    .toEqual(["Cube", "Sphere"]);

  // Bob later opens the project without the link in the address (as from the home screen): the saved link reconnects
  const address = new URL(bob.url());
  await bob.goto(address.pathname);
  await waitOnline(bob);
  await expect
    .poll(async () => Object.keys(await summary(bob)).sort())
    .toEqual(["Cube", "Sphere"]);
});

test("Share: a view-only link shows the scene, and changes are put back", async ({
  browser,
}) => {
  const alice = await person(browser);
  const viewer = await person(browser);
  await newProject(alice);
  await addShape(alice, "Cube");
  const link = await makeLink(alice, "viewer");
  await waitOnline(alice);

  await viewer.goto(link);
  await expect(viewer.getByTestId("collab-status")).toHaveText(
    "Online, view only",
  );
  await expect
    .poll(async () => Object.keys(await summary(viewer)))
    .toEqual(["Cube"]);

  // The viewer tries to add a shape: it is put back, and nothing reaches Alice
  await addShape(viewer, "Sphere");
  await expect
    .poll(async () => Object.keys(await summary(viewer)))
    .toEqual(["Cube"]);
  await addShape(alice, "Cone");
  await expect
    .poll(async () => Object.keys(await summary(viewer)).sort())
    .toEqual(["Cone", "Cube"]);
  expect(Object.keys(await summary(alice))).not.toContain("Sphere");

  // Edit points is refused with a reason
  await viewer
    .getByRole("button", { name: "Cube", exact: true })
    .first()
    .click();
  await viewer.getByRole("button", { name: /Edit points/ }).click();
  await expect(viewer.getByText(/open as view only/)).toBeVisible();
});

test("Share: only the person who started sharing can make links, and cancelling all links disconnects everyone", async ({
  browser,
}) => {
  const alice = await person(browser);
  const bob = await person(browser);
  await newProject(alice);
  await addShape(alice, "Cube");
  const oldLink = await makeLink(alice);
  await waitOnline(alice);
  await bob.goto(oldLink);
  await waitOnline(bob);

  // Bob is not the owner: he cannot make links
  await bob.getByRole("button", { name: "Share", exact: true }).click();
  await bob.getByRole("button", { name: "Create link" }).click();
  await expect(
    bob.getByRole("dialog", { name: "Share this project" }).getByRole("alert"),
  ).toContainText("did not start sharing");

  // Alice cancels all links
  await alice.getByRole("button", { name: "Cancel all links…" }).click();
  await alice
    .getByRole("button", { name: "Cancel all links", exact: true })
    .click();
  await expect(alice.getByText(/All links are cancelled/)).toBeVisible();

  // Alice stays online; Bob is disconnected and cannot come back with the old link
  await waitOnline(alice);
  await expect(bob.getByTestId("collab-status")).not.toHaveText("Online");
  const late = await person(browser);
  await late.goto(oldLink);
  await expect(late.getByTestId("collab-status")).toHaveText(
    "Link not accepted",
  );

  // A new link works
  const newLink = await makeLink(alice);
  const carol = await person(browser);
  await carol.goto(newLink);
  await waitOnline(carol);
  await expect
    .poll(async () => Object.keys(await summary(carol)))
    .toEqual(["Cube"]);
});

test("selecting an object holds it: others see who has it and cannot select it, until it is let go", async ({
  browser,
}) => {
  const alice = await person(browser);
  const bob = await person(browser);
  const { projectId, sceneId } = await startShared(alice);
  await addShape(alice, "Cube"); // she has it selected after adding it
  await bob.goto(sharedAddress(projectId, "editor", sceneId));
  await waitOnline(bob);
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toEqual(["Cube"]);

  // Bob sees the cube highlighted with the name of the person who has it, in the 3D view and in the list
  await expect(bob.getByTestId("held-label")).toContainText(
    "is working on this",
  );
  await expect(bob.getByTestId("held-by")).toHaveCount(1);
  await bob.screenshot({ path: "test-results/locks-bob.png" });

  // Bob cannot select it: he is told who has it, and gets no tools for it
  await bob.getByRole("button", { name: "Cube", exact: true }).first().click();
  await expect(bob.getByText(/is working on "Cube"/)).toBeVisible();
  await expect(bob.getByRole("button", { name: /Edit points/ })).toHaveCount(0);

  // Bob adds a sphere: it is his now, and Alice cannot take it
  await addShape(bob, "Sphere");
  await expect(alice.getByTestId("held-by")).toHaveCount(1);
  await alice
    .getByRole("button", { name: "Sphere", exact: true })
    .first()
    .click();
  await expect(alice.getByText(/is working on "Sphere"/)).toBeVisible();

  // Alice lets go of the cube (a click on empty space): it is free for Bob
  await alice.keyboard.press("Escape");
  await alice.mouse.click(1000, 600);
  await expect(bob.getByTestId("held-label")).toHaveCount(0);
  await bob.getByRole("button", { name: "Cube", exact: true }).first().click();
  await expect(bob.getByRole("button", { name: /Edit points/ })).toBeVisible();
  // ... and now it is Bob's: Alice sees the other holds change
  await expect(alice.getByTestId("held-by")).toHaveCount(1);
});

test("a hold ends after 30 seconds without activity, and the holder is told", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const alice = await person(browser);
  const bob = await person(browser);
  const { projectId, sceneId } = await startShared(alice);
  await addShape(alice, "Cube");
  await bob.goto(sharedAddress(projectId, "editor", sceneId));
  await waitOnline(bob);
  await expect(bob.getByTestId("held-by")).toHaveCount(1);

  // Alice does nothing: after 30 seconds the cube is let go, for Bob and in her own editor
  await expect(bob.getByTestId("held-by")).toHaveCount(0, { timeout: 50_000 });
  await expect(alice.getByText(/was let go for others/)).toBeVisible();
  await expect(alice.getByRole("button", { name: /Edit points/ })).toHaveCount(
    0,
  );

  // Bob can take it now
  await bob.getByRole("button", { name: "Cube", exact: true }).first().click();
  await expect(bob.getByRole("button", { name: /Edit points/ })).toBeVisible();
});
