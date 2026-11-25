import { describe, expect, it, vi } from "vitest";
import { verifyAdminRequest } from "@sceneroom/link-token";
import { disconnectFromCollab } from "./collabAdmin";

const SECRET = "k".repeat(40);
const env = {
  COLLAB_SECRET: SECRET,
  COLLAB_ADMIN_URL: "http://127.0.0.1:1234",
};

describe("disconnectFromCollab", () => {
  it("sends a signed request that the collab server's check accepts", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    await disconnectFromCollab(
      env,
      { projectId: "p1", userId: "u1" },
      { fetchImpl, nowSeconds: () => 5000 },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      URL,
      RequestInit,
    ];
    expect(String(url)).toBe("http://127.0.0.1:1234/internal/disconnect");
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"projectId":"p1","userId":"u1"}');
    const headers = init.headers as Record<string, string>;
    expect(
      verifyAdminRequest(
        SECRET,
        Number(headers["X-Admin-Timestamp"]),
        String(init.body),
        headers["X-Admin-Signature"]!,
        5000,
      ),
    ).toEqual({ ok: true });
  });

  it("without a person it asks for the whole project", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}"));
    await disconnectFromCollab(env, { projectId: "p1" }, { fetchImpl });
    expect(
      (fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1].body,
    ).toBe('{"projectId":"p1"}');
  });

  it("does nothing when no collab address is set", async () => {
    const fetchImpl = vi.fn();
    await disconnectFromCollab(
      { COLLAB_SECRET: SECRET, COLLAB_ADMIN_URL: undefined },
      { projectId: "p1" },
      { fetchImpl: fetchImpl as never },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never throws: a refusal or an unreachable server is only logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      disconnectFromCollab(
        env,
        { projectId: "p1" },
        { fetchImpl: async () => new Response("no", { status: 401 }) },
      ),
    ).resolves.toBeUndefined();
    await expect(
      disconnectFromCollab(
        env,
        { projectId: "p1" },
        { fetchImpl: async () => Promise.reject(new Error("down")) },
      ),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
