/** The size of a project's picture, in pixels. Small on purpose: it is a card, not a render. */
export const THUMBNAIL_WIDTH = 480;
export const THUMBNAIL_HEIGHT = 270;
/** JPEG quality (0 to 1) of the picture: about 20 to 40 KB. */
export const THUMBNAIL_QUALITY = 0.7;

/**
 * The part of a source picture that fills a target of another shape without stretching ("cover": the middle,
 * cut on the long side), as x, y, width, height in the source.
 */
export function coverRect(
  source: { width: number; height: number },
  target: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const sourceRatio = source.width / Math.max(source.height, 1);
  const targetRatio = target.width / Math.max(target.height, 1);
  if (sourceRatio > targetRatio) {
    const width = source.height * targetRatio;
    return {
      x: (source.width - width) / 2,
      y: 0,
      width,
      height: source.height,
    };
  }
  const height = source.width / targetRatio;
  return { x: 0, y: (source.height - height) / 2, width: source.width, height };
}

/** A small JPEG (as a data URL) of what a canvas shows, or null if it is empty or cannot be read. */
export function makeThumbnail(source: HTMLCanvasElement): string | null {
  if (source.width < 2 || source.height < 2) return null;
  const target = document.createElement("canvas");
  target.width = THUMBNAIL_WIDTH;
  target.height = THUMBNAIL_HEIGHT;
  const context = target.getContext("2d");
  if (!context) return null;
  const from = coverRect(source, target);
  context.drawImage(
    source,
    from.x,
    from.y,
    from.width,
    from.height,
    0,
    0,
    THUMBNAIL_WIDTH,
    THUMBNAIL_HEIGHT,
  );
  return target.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
}

/** The function that draws the 3D view and returns its picture; set while the viewport is on the page. */
let source: (() => string | null) | null = null;

export function setThumbnailSource(next: (() => string | null) | null): void {
  source = next;
}

/** A picture of the 3D view as it is now, or null if the view is not on the page (or cannot be read). */
export function captureThumbnail(): string | null {
  try {
    if (!source) return null;
    const picture = source();
    if (!picture)
      console.warn("The 3D view gave no picture for the project card.");
    return picture;
  } catch (error) {
    console.warn("Could not take a picture of the 3D view:", error);
    return null;
  }
}
