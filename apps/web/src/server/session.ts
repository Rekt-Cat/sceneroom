import { headers } from "next/headers";
import { getAccounts } from "./auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

/** The header a browser test sends to act as a person without going through GitHub (see `testUser`). */
export const TEST_USER_HEADER = "x-test-user";

/**
 * Test-only sign-in. It exists only when the server is started with SCENEROOM_TEST_AUTH=1 (the browser tests do this)
 * and never in a production build: GitHub's round trip cannot be done by a test, so tests send this header instead.
 */
export function testUserId(request: Headers): string | null {
  if (process.env.SCENEROOM_TEST_AUTH !== "1") return null;
  if (process.env.NODE_ENV === "production") return null;
  const id = request.get(TEST_USER_HEADER);
  return id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

/** Who is signed in for this request, or null (not signed in, or accounts are not set up). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const accounts = getAccounts();
  if (!accounts) return null;
  const requestHeaders = await headers();

  const testId = testUserId(requestHeaders);
  if (testId) {
    const user = await accounts.db.user.upsert({
      where: { id: testId },
      update: {},
      create: { id: testId, name: testId, email: `${testId}@example.test` },
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
    };
  }

  const session = await accounts.auth.api.getSession({
    headers: requestHeaders,
  });
  if (!session) return null;
  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}
