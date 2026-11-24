import { expect, test } from "@playwright/test";
import { addShape, newProject } from "./helpers";
import { ensureUser, memberRoleOf, setMemberRole } from "./accountsDb";
import {
  signedIn,
  status,
  summary,
  setUpAccountTests,
} from "./accountsSupport";

// Online with accounts: the web app signs the tokens after checking membership (see accountsSupport.ts for how a test
// signs in).
setUpAccountTests();

test("an owner puts a project online; members get tokens that match their role; a stranger and a removed member are refused", async ({
  browser,
}) => {
  const alice = await signedIn(browser, "e2e-alice");
  await newProject(alice);
  const projectId = /\/p\/([^/?#]+)/.exec(alice.url())![1]!;
  const sceneId = await alice.evaluate(() =>
    window.__sceneroom!.activeSceneId(),
  );

  // Alice puts the project online with her account (the Share box offers it because she is signed in)
  await alice.getByRole("button", { name: "Share" }).click();
  await alice
    .getByRole("button", { name: "Put online with my account" })
    .click();
  await expect(status(alice)).toHaveText("Online");
  expect(await memberRoleOf(projectId, "e2e-alice")).toBe("owner");
  await alice.keyboard.press("Escape");
  await addShape(alice, "Sphere");

  // Bob is a viewer: he sees Alice's scene but cannot change it
  await ensureUser("e2e-bob");
  await setMemberRole(projectId, "e2e-bob", "viewer");
  const bob = await signedIn(browser, "e2e-bob");
  const address = `/p/${projectId}?online=account&scene=${sceneId}`;
  await bob.goto(address);
  await expect(status(bob)).toHaveText("Online, view only");
  await expect
    .poll(async () => Object.keys(await summary(bob)).sort())
    .toEqual(Object.keys(await summary(alice)).sort());
  await addShape(alice, "Cone");
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toContain("Cone");

  // The owner makes Bob an editor; at his next connect he gets an editor token and his changes reach Alice
  await setMemberRole(projectId, "e2e-bob", "editor");
  await bob.reload();
  await expect(status(bob)).toHaveText("Online");
  await addShape(bob, "Cylinder");
  await expect
    .poll(async () => Object.keys(await summary(alice)))
    .toContain("Cylinder");

  // Carol is not a member: no token, so the server never lets her in
  await ensureUser("e2e-carol");
  const carol = await signedIn(browser, "e2e-carol");
  await carol.goto(address);
  await expect(status(carol)).toHaveText("Link not accepted");
  expect(Object.keys(await summary(carol))).not.toContain("Sphere");

  // Bob is removed by the owner: he is cut off at once, without reloading, and a reload does not bring him back
  const removed = await alice.request.delete(
    `/api/projects/${projectId}/members/e2e-bob`,
  );
  expect(removed.status()).toBe(200);
  await expect(status(bob)).toHaveText("Link not accepted");
  await bob.reload();
  await expect(status(bob)).toHaveText("Link not accepted");
});
