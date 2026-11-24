import { expect, test } from "@playwright/test";

// With accounts set up (apps/web/.env.local has the accounts variables) the home screen offers "Sign in with GitHub".
// Without them (a fresh clone, CI) the button must not appear and the editor works as before. The real GitHub round trip
// cannot be done by a test: it is checked by hand.
test("the home screen offers GitHub sign-in only when accounts are set up", async ({
  page,
  request,
}) => {
  const accountsOn =
    (await request.get("/api/auth/get-session")).status() === 200;
  await page.goto("/");
  await expect(page.getByText("Your projects")).toBeVisible();
  const button = page.getByRole("button", { name: "Sign in with GitHub" });

  if (!accountsOn) {
    await expect(button).toHaveCount(0);
    return;
  }

  // Do not leave for the real GitHub: catch the request and look at where it was going
  let githubAddress: URL | null = null;
  await page.route("https://github.com/login/oauth/authorize**", (route) => {
    githubAddress = new URL(route.request().url());
    return route.fulfill({ status: 200, body: "stopped by the test" });
  });
  await button.click();
  await expect.poll(() => githubAddress !== null).toBe(true);
  expect(githubAddress!.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3000/api/auth/callback/github",
  );
  expect(githubAddress!.searchParams.get("client_id")).toBeTruthy();
});
