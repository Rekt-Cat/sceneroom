import {
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { cleanUsers } from "./accountsDb";
import { COLLAB_TEST_URL } from "./collabSettings";

/**
 * What the account browser tests share. The GitHub sign-in cannot be done by a test, so each person is a browser that
 * sends the header `x-test-user` (see src/server/session.ts). That works only on a dev server started by these tests
 * (playwright.config.ts) with the accounts settings in apps/web/.env.local; otherwise the tests skip themselves.
 */
export const USERS = ["e2e-alice", "e2e-bob", "e2e-carol"];

async function accountsAvailable(request: APIRequestContext): Promise<boolean> {
  const answer = await request.get("/api/me", {
    headers: { "x-test-user": "e2e-probe" },
  });
  return answer.status() === 200;
}

export const cleanAccounts = () => cleanUsers([...USERS, "e2e-probe"]);

const opened: BrowserContext[] = [];

/** Call once at the top of a spec file: skips when accounts are off, cleans before and after, closes the browsers. */
export function setUpAccountTests(): void {
  test.beforeEach(async ({ request }) => {
    test.skip(
      !(await accountsAvailable(request)),
      "accounts are not set up for this dev server (start it with the tests; apps/web/.env.local needs the accounts settings)",
    );
    await cleanAccounts();
  });
  test.afterEach(async () => {
    await Promise.all(opened.splice(0).map((context) => context.close()));
    await cleanAccounts();
  });
}

/** A signed-in person: a browser context with its own storage that acts as this user and uses the test collab server. */
export async function signedIn(browser: Browser, user: string): Promise<Page> {
  const context = await browser.newContext({
    extraHTTPHeaders: { "x-test-user": user },
  });
  await context.addInitScript((url) => {
    window.localStorage.setItem("sceneroom-collab-server", url);
  }, COLLAB_TEST_URL);
  opened.push(context);
  return context.newPage();
}

/** Someone who is not signed in (no header). */
export async function signedOut(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  opened.push(context);
  return context.newPage();
}

export const summary = (page: Page) =>
  page.evaluate(() => window.__sceneroom!.sceneSummary());
export const status = (page: Page) => page.getByTestId("collab-status");
