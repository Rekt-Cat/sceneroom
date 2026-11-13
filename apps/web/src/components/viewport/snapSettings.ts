/** Snap steps while snapping is on. Rotation is given in degrees; use toRadians for three.js. */
export const SNAP = {
  translate: 0.5, // world units
  rotateDegrees: 15,
  scale: 0.1,
};

export const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
