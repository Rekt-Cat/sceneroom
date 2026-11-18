import { CanvasTexture, SRGBColorSpace } from "three";

/** Cells along each side of the checker picture. */
export const CHECKER_CELLS = 8;
const PICTURE_SIZE = 512;
const LIGHT = "#d9dee3";
const DARK = "#59636d";

let texture: CanvasTexture | null = null;

/**
 * The checkerboard used by the UV checker (made once, in the browser). Null where there is no canvas to draw on.
 * One picture covers the whole 0 to 1 map, so every cell is the same size on a well made map.
 */
export function getCheckerTexture(): CanvasTexture | null {
  if (texture) return texture;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = PICTURE_SIZE;
  canvas.height = PICTURE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const cell = PICTURE_SIZE / CHECKER_CELLS;
  for (let row = 0; row < CHECKER_CELLS; row++) {
    for (let column = 0; column < CHECKER_CELLS; column++) {
      context.fillStyle = (row + column) % 2 === 0 ? LIGHT : DARK;
      context.fillRect(column * cell, row * cell, cell, cell);
    }
  }
  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
