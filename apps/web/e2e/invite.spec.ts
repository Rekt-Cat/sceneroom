import { expect, test } from "@playwright/test";
import { addShape, newProject } from "./helpers";
import {
  signedIn,
  signedOut,
  status,
  summary,
  setUpAccountTests,
} from "./accountsSupport";

// Invitations: the owner makes a link, another person opens it, signs in, accepts and is in the project with that role;
// a link works once, can be revoked, and a removed person is cut off at once (see accountsSupport.ts for sign-in).
setUpAccountTests();

test("invite, join, see the project on the home screen, and be removed live", async ({
  browser,
}) => {
  // Alice puts a project online and makes an invitation link for an editor
  const alice = await signedIn(browser, "e2e-alice");
  await newProject(alice);
  const projectId = /\/p\/([^/?#]+)/.exec(alice.url())![1]!;
  await alice.getByRole("button", { name: "Share" }).click();
  await alice
    .getByRole("button", { name: "Put online with my account" })
    .click();
  await expect(status(alice)).toHaveText("Online");
  await expect(alice.getByTestId("account-members")).toBeVisible();
  await alice.getByLabel("Invitation role").selectOption("editor");
  await alice.getByRole("button", { name: "Make invitation link" }).click();
  const link = await alice.getByTestId("invite-link").inputValue();
  expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{43}$/);
  await alice.keyboard.press("Escape");
  await addShape(alice, "Sphere");

  // Someone who is not signed in sees what the link is for, and is asked to sign in
  const visitor = await signedOut(browser);
  await visitor.goto(link);
  await expect(visitor.getByTestId("invite-summary")).toContainText(
    "as editor",
  );
  await expect(
    visitor.getByRole("button", { name: "Sign in with GitHub" }),
  ).toBeVisible();
  await expect(
    visitor.getByRole("button", { name: "Accept invitation" }),
  ).toHaveCount(0);

  // Bob is signed in: he accepts and lands in the project, online as an editor, with Alice's scene
  const bob = await signedIn(browser, "e2e-bob");
  await bob.goto(link);
  await expect(bob.getByTestId("invite-summary")).toContainText("as editor");
  await bob.getByRole("button", { name: "Accept invitation" }).click();
  await bob.waitForURL(new RegExp(`/p/${projectId}\\?online=account`));
  await expect(status(bob)).toHaveText("Online");
  await expect
    .poll(async () => Object.keys(await summary(bob)))
    .toContain("Sphere");
  await addShape(bob, "Cone");
  await expect
    .poll(async () => Object.keys(await summary(alice)))
    .toContain("Cone");

  // The project shows on Bob's home screen with his role
  await bob.goto("/");
  await expect(
    bob.getByRole("heading", { name: "Online projects" }),
  ).toBeVisible();
  await expect(
    bob.getByRole("link", { name: /editor/ }).first(),
  ).toHaveAttribute(
    "href",
    new RegExp(`/p/${projectId}\\?online=account&scene=`),
  );

  // The link was for one person: Carol finds it used up
  const carol = await signedIn(browser, "e2e-carol");
  await carol.goto(link);
  await expect(carol.getByTestId("invite-problem")).toContainText(
    "already used",
  );

  // Alice sees Bob in the members, then removes him: he is cut off at once
  await bob.goBack();
  await expect(status(bob)).toHaveText("Online");
  // The Share box opens if it is not open already (the button toggles it)
  if (!(await alice.getByTestId("account-members").isVisible())) {
    await alice.getByRole("button", { name: "Share" }).click();
  }
  await expect(alice.getByRole("list", { name: "Members" })).toContainText(
    "e2e-bob",
  );
  await alice.getByRole("button", { name: "Remove e2e-bob" }).click();
  await alice.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(alice.getByRole("list", { name: "Members" })).not.toContainText(
    "e2e-bob",
  );
  await expect(status(bob)).toHaveText("Link not accepted");
});

test("a revoked link no longer works", async ({ browser }) => {
  const alice = await signedIn(browser, "e2e-alice");
  await newProject(alice);
  await alice.getByRole("button", { name: "Share" }).click();
  await alice
    .getByRole("button", { name: "Put online with my account" })
    .click();
  await expect(status(alice)).toHaveText("Online");
  await alice.getByRole("button", { name: "Make invitation link" }).click();
  const link = await alice.getByTestId("invite-link").inputValue();
  await expect(
    alice.getByRole("list", { name: "Waiting invitations" }),
  ).toBeVisible();
  await alice.getByRole("button", { name: "Revoke" }).click();
  await expect(
    alice.getByRole("list", { name: "Waiting invitations" }),
  ).toHaveCount(0);

  const bob = await signedIn(browser, "e2e-bob");
  await bob.goto(link);
  await expect(bob.getByTestId("invite-problem")).toContainText("cancelled");
});

test("a person who leaves is disconnected and the owner cannot be removed", async ({
  browser,
}) => {
  const alice = await signedIn(browser, "e2e-alice");
  await newProject(alice);
  const projectId = /\/p\/([^/?#]+)/.exec(alice.url())![1]!;
  await alice.getByRole("button", { name: "Share" }).click();
  await alice
    .getByRole("button", { name: "Put online with my account" })
    .click();
  await expect(status(alice)).toHaveText("Online");
  // The owner row has no Remove button
  await expect(
    alice.getByRole("button", { name: /Remove e2e-alice|Leave/ }),
  ).toHaveCount(0);
  const owner = await alice.request.delete(
    `/api/projects/${projectId}/members/e2e-alice`,
  );
  expect(owner.status()).toBe(400);
});
