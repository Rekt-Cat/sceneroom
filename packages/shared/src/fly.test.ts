import { describe, expect, it } from "vitest";
import {
  FLY_FAST_FACTOR,
  FLY_MAX_SPEED,
  FLY_MIN_SPEED,
  NO_FLY_KEYS,
  flyDirection,
  flySpeed,
  flyStep,
  rightOf,
  type FlyKeys,
} from "./fly";

const keys = (down: Partial<FlyKeys>): FlyKeys => ({ ...NO_FLY_KEYS, ...down });
const near = (a: readonly number[], b: readonly number[]) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe("flying the camera", () => {
  const looking: [number, number, number] = [0, 0, -1]; // looking down -z

  it("no keys, no movement", () => {
    expect(flyDirection(NO_FLY_KEYS, looking)).toEqual([0, 0, 0]);
  });

  it("W goes where the camera looks, S the other way", () => {
    near(flyDirection(keys({ forward: true }), looking), [0, 0, -1]);
    near(flyDirection(keys({ back: true }), looking), [0, 0, 1]);
    // looking up and ahead, W goes up and ahead
    near(flyDirection(keys({ forward: true }), [0, 1, -1]), [
      0,
      Math.SQRT1_2,
      -Math.SQRT1_2,
    ]);
  });

  it("A and D slide sideways, level with the ground", () => {
    near(flyDirection(keys({ right: true }), looking), [1, 0, 0]);
    near(flyDirection(keys({ left: true }), looking), [-1, 0, 0]);
    // even when looking steeply down
    near(
      flyDirection(keys({ right: true }), [0, -1, -0.2]),
      rightOf([0, -1, -0.2]),
    );
    expect(flyDirection(keys({ right: true }), [0, -1, -0.2])[1]).toBeCloseTo(
      0,
      6,
    );
  });

  it("E goes straight up and Q straight down, whatever way the camera looks", () => {
    near(flyDirection(keys({ up: true }), [1, 0.3, -0.5]), [0, 1, 0]);
    near(flyDirection(keys({ down: true }), looking), [0, -1, 0]);
  });

  it("opposite keys cancel, and going diagonally is not faster", () => {
    expect(flyDirection(keys({ forward: true, back: true }), looking)).toEqual([
      0, 0, 0,
    ]);
    const diagonal = flyDirection(
      keys({ forward: true, right: true }),
      looking,
    );
    expect(Math.hypot(...diagonal)).toBeCloseTo(1, 6);
  });

  it("straight up or down has no 'right' from the view, so the x axis is used", () => {
    expect(rightOf([0, 1, 0])).toEqual([1, 0, 0]);
    expect(rightOf([0, -1, 0])).toEqual([1, 0, 0]);
  });

  it("copes with a camera direction that is zero", () => {
    near(flyDirection(keys({ forward: true }), [0, 0, 0]), [0, 0, -1]);
  });
});

describe("how fast", () => {
  it("is faster the further the camera is from what it looks at, within limits", () => {
    expect(flySpeed(0.1, false)).toBe(FLY_MIN_SPEED);
    expect(flySpeed(10, false)).toBeGreaterThan(flySpeed(5, false));
    expect(flySpeed(1000, false)).toBe(FLY_MAX_SPEED);
  });

  it("the fast key makes it faster", () => {
    expect(flySpeed(10, true)).toBeCloseTo(
      flySpeed(10, false) * FLY_FAST_FACTOR,
      6,
    );
  });

  it("a step is speed times time, and a stalled frame is cut short", () => {
    const step = flyStep(keys({ forward: true }), [0, 0, -1], 10, false, 0.1);
    near(step, [0, 0, -flySpeed(10, false) * 0.1]);
    // a half-second frame moves no more than a tenth-of-a-second one
    expect(
      flyStep(keys({ forward: true }), [0, 0, -1], 10, false, 0.5),
    ).toEqual(step);
    expect(flyStep(NO_FLY_KEYS, [0, 0, -1], 10, false, 0.1)).toEqual([0, 0, 0]);
  });
});
