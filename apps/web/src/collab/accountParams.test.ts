import { describe, expect, it, vi } from "vitest";
import { parseAccountParams } from "./accountParams";

describe("parseAccountParams", () => {
  it("is null when the address does not ask for it", () => {
    expect(parseAccountParams("")).toBeNull();
    expect(parseAccountParams("?collab=ws://x&token=y")).toBeNull();
  });

  it("reads ?online=account, with or without a scene", () => {
    expect(parseAccountParams("?online=account")).toEqual({});
    expect(parseAccountParams("?online=account&scene=s_1")).toEqual({
      sceneId: "s_1",
    });
  });

  it("refuses anything else", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(parseAccountParams("?online=yes")).toBeNull();
    expect(parseAccountParams("?online=account&scene=../x")).toBeNull();
  });
});
