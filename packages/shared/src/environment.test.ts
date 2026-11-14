import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVIRONMENT,
  createEmptyScene,
  sceneSchema,
  type EnvironmentSettings,
} from "./scene";
import {
  environmentChangeDiffers,
  sanitizeEnvironmentChange,
  setEnvironment,
  sunPosition,
} from "./environment";

describe("the environment in a scene", () => {
  it("a new scene has the starting environment", () => {
    expect(createEmptyScene().environment).toEqual(DEFAULT_ENVIRONMENT);
  });

  it("an older scene without one loads with the starting environment", () => {
    const { environment, ...old } = createEmptyScene();
    void environment;
    const parsed = sceneSchema.parse(old);
    expect(parsed.environment).toEqual(DEFAULT_ENVIRONMENT);
  });

  it("an environment with only some settings gets the rest from the defaults", () => {
    const parsed = sceneSchema.parse({
      ...createEmptyScene(),
      environment: { fogEnabled: true },
    });
    expect(parsed.environment).toEqual({
      ...DEFAULT_ENVIRONMENT,
      fogEnabled: true,
    });
  });

  it("refuses values out of range", () => {
    const bad = (change: object) =>
      sceneSchema.safeParse({
        ...createEmptyScene(),
        environment: { ...DEFAULT_ENVIRONMENT, ...change },
      }).success;
    expect(bad({ sunElevation: 120 })).toBe(false);
    expect(bad({ reflections: "forest" })).toBe(false);
    expect(bad({ skyTop: "blue" })).toBe(false);
    expect(bad({ sunElevation: 30 })).toBe(true);
  });
});

describe("sanitizeEnvironmentChange", () => {
  it("keeps numbers inside their range and drops what is not a number", () => {
    expect(
      sanitizeEnvironmentChange({
        sunElevation: 200,
        ambientIntensity: -1,
        fogFar: 0,
      }),
    ).toEqual({ sunElevation: 90, ambientIntensity: 0, fogFar: 1 });
    expect(sanitizeEnvironmentChange({ sunIntensity: NaN })).toEqual({});
  });

  it("accepts colours in any case and refuses nonsense", () => {
    expect(sanitizeEnvironmentChange({ skyTop: "#3F6FB5" })).toEqual({
      skyTop: "#3f6fb5",
    });
    expect(sanitizeEnvironmentChange({ fogColor: "grey" })).toEqual({});
  });

  it("accepts only the allowed choices and true or false", () => {
    expect(
      sanitizeEnvironmentChange({ reflections: "sky", backgroundMode: "sky" }),
    ).toEqual({ reflections: "sky", backgroundMode: "sky" });
    expect(
      sanitizeEnvironmentChange({
        reflections: "forest" as EnvironmentSettings["reflections"],
        sunEnabled: "yes" as unknown as boolean,
      }),
    ).toEqual({});
  });
});

describe("setEnvironment and environmentChangeDiffers", () => {
  it("changes some settings and keeps the others, without touching the original", () => {
    const scene = createEmptyScene();
    const next = setEnvironment(scene, { fogEnabled: true });
    expect(next.environment.fogEnabled).toBe(true);
    expect(next.environment.sunIntensity).toBe(
      DEFAULT_ENVIRONMENT.sunIntensity,
    );
    expect(scene.environment.fogEnabled).toBe(false);
  });

  it("sees whether anything would change", () => {
    expect(
      environmentChangeDiffers(DEFAULT_ENVIRONMENT, { sunEnabled: true }),
    ).toBe(false);
    expect(
      environmentChangeDiffers(DEFAULT_ENVIRONMENT, { sunEnabled: false }),
    ).toBe(true);
    expect(environmentChangeDiffers(DEFAULT_ENVIRONMENT, {})).toBe(false);
  });
});

describe("sunPosition", () => {
  it("is straight above at 90 degrees, and on the horizon at 0", () => {
    const [x, y, z] = sunPosition(0, 90);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(12);
    expect(z).toBeCloseTo(0);
    expect(sunPosition(90, 0)[1]).toBeCloseTo(0);
  });

  it("matches the old fixed sun at the default direction", () => {
    const [x, y, z] = sunPosition(
      DEFAULT_ENVIRONMENT.sunAzimuth,
      DEFAULT_ENVIRONMENT.sunElevation,
    );
    // the old sun stood at (5, 8, 4): same direction, scaled
    const k = 12 / Math.hypot(5, 8, 4);
    expect(x).toBeCloseTo(5 * k, 0);
    expect(y).toBeCloseTo(8 * k, 0);
    expect(z).toBeCloseTo(4 * k, 0);
  });

  it("azimuth turns the sun around the middle", () => {
    expect(sunPosition(0, 0)[2]).toBeCloseTo(12);
    expect(sunPosition(90, 0)[0]).toBeCloseTo(12);
    expect(sunPosition(180, 0)[2]).toBeCloseTo(-12);
  });
});
