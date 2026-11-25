import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_USER_HEADER, testUserId } from "./session";

afterEach(() => vi.unstubAllEnvs());
const asking = (id: string) => new Headers({ [TEST_USER_HEADER]: id });

describe("the test-only sign-in", () => {
  it("is off unless the server was started with SCENEROOM_TEST_AUTH=1", () => {
    expect(testUserId(asking("alice"))).toBeNull();
    vi.stubEnv("SCENEROOM_TEST_AUTH", "0");
    expect(testUserId(asking("alice"))).toBeNull();
  });

  it("works when it is on and there is a header with a safe id", () => {
    vi.stubEnv("SCENEROOM_TEST_AUTH", "1");
    expect(testUserId(asking("alice"))).toBe("alice");
    expect(testUserId(new Headers())).toBeNull();
    expect(testUserId(asking("a b"))).toBeNull();
    expect(testUserId(asking("x".repeat(65)))).toBeNull();
  });

  it("is never on in a production build, even when the variable is set", () => {
    vi.stubEnv("SCENEROOM_TEST_AUTH", "1");
    vi.stubEnv("NODE_ENV", "production");
    expect(testUserId(asking("alice"))).toBeNull();
  });
});
