import { describe, expect, it, vi } from "vitest";
import {
  REFRESH_MARGIN_SECONDS,
  asTokenSource,
  createAccountTokenSource,
  fixedToken,
} from "./tokenSource";

function answer(token: string, expiresAt: number, status = 200) {
  return new Response(JSON.stringify({ token, expiresAt }), { status });
}

describe("fixed tokens", () => {
  it("give the same token every time, for connecting and for files", async () => {
    const source = fixedToken("abc");
    expect(await source.fresh()).toBe("abc");
    expect(await source.cached()).toBe("abc");
  });

  it("a plain string is turned into a source; a source is left as it is", () => {
    const source = fixedToken("x");
    expect(asTokenSource(source)).toBe(source);
    expect(asTokenSource("y")).toMatchObject({ fresh: expect.any(Function) });
  });
});

describe("account tokens", () => {
  it("asks the web app for the project's token, with the sign-in cookie", async () => {
    const fetchImpl = vi.fn(async () => answer("t1", 5000));
    const source = createAccountTokenSource("proj-1", {
      fetchImpl,
      nowSeconds: () => 1000,
    });
    expect(await source.fresh()).toBe("t1");
    expect(fetchImpl).toHaveBeenCalledWith("/api/projects/proj-1/token", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("fresh() asks every time, so a changed role is noticed at the next connect", async () => {
    let n = 0;
    const fetchImpl = vi.fn(async () => answer(`t${++n}`, 5000));
    const source = createAccountTokenSource("p", {
      fetchImpl,
      nowSeconds: () => 1000,
    });
    expect(await source.fresh()).toBe("t1");
    expect(await source.fresh()).toBe("t2");
  });

  it("cached() reuses a token until a minute before it runs out", async () => {
    let now = 1000;
    let n = 0;
    const fetchImpl = vi.fn(async () => answer(`t${++n}`, 2000));
    const source = createAccountTokenSource("p", {
      fetchImpl,
      nowSeconds: () => now,
    });
    expect(await source.cached()).toBe("t1");
    now = 2000 - REFRESH_MARGIN_SECONDS - 1;
    expect(await source.cached()).toBe("t1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 2000 - REFRESH_MARGIN_SECONDS;
    expect(await source.cached()).toBe("t2");
  });

  it("says in words what went wrong", async () => {
    const cases: [number, RegExp][] = [
      [401, /signed out/],
      [404, /not a member/],
      [503, /not set up/],
      [500, /500/],
    ];
    for (const [status, words] of cases) {
      const source = createAccountTokenSource("p", {
        fetchImpl: async () => new Response("{}", { status }),
      });
      await expect(source.fresh()).rejects.toThrow(words);
    }
  });

  it("refuses an answer that is not a token", async () => {
    const source = createAccountTokenSource("p", {
      fetchImpl: async () => new Response(JSON.stringify({ nope: 1 })),
    });
    await expect(source.fresh()).rejects.toThrow(/not understood/);
  });
});
