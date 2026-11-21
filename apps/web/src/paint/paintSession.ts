import {
  blankPaint,
  hexToRgb,
  paintSegment,
  PAINT_TEXTURE_SIZE,
  type AssetInfo,
} from "@sceneroom/shared";
import { CanvasTexture, SRGBColorSpace } from "three";
import { assetStorage } from "@/assets/assetStorage";
import { sha256Hex } from "@/assets/hash";
import { loadMeshData } from "@/assets/meshStorage";
import { useImportStore } from "@/store/importStore";
import { useEditStore } from "@/store/editStore";
import { usePaintStore } from "@/store/paintStore";
import { useSceneStore } from "@/store/sceneStore";

/**
 * Painting on a mesh. A session keeps the picture as a block of pixels while the brush works on it (fast, no file
 * writing), shows it live through a canvas texture, and stores the picture as a PNG texture file at the end of each
 * stroke: one undo step per stroke. Leaving paint mode ends the session; the picture then comes from the stored file.
 */

type Session = {
  nodeId: string;
  pixels: Uint8ClampedArray;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  image: ImageData;
  texture: CanvasTexture;
  /** The texture file the object uses now (what the pixels were last stored as, or loaded from). */
  assetId: string | null;
  /** Where the last touch of the current stroke was on the map; null when no stroke is on. */
  last: [number, number] | null;
  changed: boolean;
};

let session: Session | null = null;
/** Stores run one after the other, so strokes are numbered in the order they were made. */
let queue: Promise<void> = Promise.resolve();

const say = (text: string, tone: "info" | "error" = "error") =>
  useImportStore.getState().setMessage({ tone, text });

/** The live picture of an object being painted, or null (not painting it). */
export function liveTextureFor(nodeId: string): CanvasTexture | null {
  return session?.nodeId === nodeId ? session.texture : null;
}

/** A canvas with a stored PNG drawn on it. */
export async function decodePng(
  bytes: ArrayBuffer,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: "image/png" }),
  );
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser cannot draw pictures.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/** The pixels an object's picture starts from: its stored colour map, or one flat colour (its own colour). */
async function startingPixels(
  assetId: string | null,
  fallbackColor: string,
): Promise<Uint8ClampedArray> {
  const bytes = assetId ? await assetStorage.get(assetId) : undefined;
  if (!bytes) {
    return blankPaint(PAINT_TEXTURE_SIZE, hexToRgb(fallbackColor));
  }
  const canvas = await decodePng(bytes);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser cannot read pictures.");
  const size = PAINT_TEXTURE_SIZE;
  // A picture of another size is stretched to the working size
  const scaled = document.createElement("canvas");
  scaled.width = size;
  scaled.height = size;
  const scaledContext = scaled.getContext("2d");
  if (!scaledContext) throw new Error("The browser cannot read pictures.");
  scaledContext.drawImage(canvas, 0, 0, size, size);
  return scaledContext.getImageData(0, 0, size, size).data;
}

function showPixels(s: Session): void {
  s.context.putImageData(s.image, 0, 0);
  s.texture.needsUpdate = true;
}

/**
 * Starts painting the object. Needs an editable mesh with a UV map (the map says where on the picture each spot of
 * the surface is). Says in the bar over the 3D view if it cannot. Returns whether painting started.
 */
export async function startPaint(nodeId: string): Promise<boolean> {
  const node = useSceneStore.getState().scene.nodes[nodeId];
  if (!node || node.kind !== "mesh" || !node.assetId) return false;
  if (useEditStore.getState().nodeId !== null) {
    say("Leave Edit points first (press Done), then paint.");
    return false;
  }
  if (node.locked) {
    say("This object is locked, so it cannot be painted.");
    return false;
  }
  try {
    const mesh = await loadMeshData(node.assetId);
    if (!mesh.uvs) {
      say(
        `"${node.name}" has no UV map, so there is nowhere to put paint. Open Edit points, then the UV window, and press Unwrap.`,
      );
      return false;
    }
    await stopPaint();
    const assetId = node.material.colorMap;
    const pixels = await startingPixels(assetId, node.color);
    const canvas = document.createElement("canvas");
    canvas.width = PAINT_TEXTURE_SIZE;
    canvas.height = PAINT_TEXTURE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The browser cannot draw pictures.");
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    session = {
      nodeId,
      pixels,
      canvas,
      context,
      image: new ImageData(
        pixels as Uint8ClampedArray<ArrayBuffer>,
        PAINT_TEXTURE_SIZE,
        PAINT_TEXTURE_SIZE,
      ),
      texture,
      assetId,
      last: null,
      changed: false,
    };
    showPixels(session);
    usePaintStore.getState().setNodeId(nodeId);
    return true;
  } catch (error) {
    console.error("Could not start painting:", error);
    say("Could not start painting this object. Please try again.");
    return false;
  }
}

/** One touch of the brush at a spot of the map (u, v). The first touch of a stroke makes one dab; the next ones draw lines. */
export function paintTouch(uv: readonly [number, number]): void {
  if (!session) return;
  const { color, radius, hardness, opacity } = usePaintStore.getState();
  const dirty = paintSegment(
    session.pixels,
    PAINT_TEXTURE_SIZE,
    session.last,
    uv,
    {
      color: hexToRgb(color),
      radius,
      hardness,
      opacity,
    },
  );
  session.last = [uv[0], uv[1]];
  if (!dirty) return;
  session.changed = true;
  session.context.putImageData(
    session.image,
    0,
    0,
    dirty.x0,
    dirty.y0,
    dirty.x1 - dirty.x0 + 1,
    dirty.y1 - dirty.y0 + 1,
  );
  session.texture.needsUpdate = true;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("The picture could not be saved."));
      else blob.arrayBuffer().then(resolve, reject);
    }, "image/png");
  });
}

/** Ends the stroke: the picture is stored as a texture file and the object uses it, as one undo step. */
export function endStroke(): void {
  const s = session;
  if (!s) return;
  s.last = null;
  if (!s.changed) return;
  s.changed = false;
  // The pixels as they are now: a later stroke may start before this store has finished
  const snapshot = document.createElement("canvas");
  snapshot.width = PAINT_TEXTURE_SIZE;
  snapshot.height = PAINT_TEXTURE_SIZE;
  snapshot.getContext("2d")?.drawImage(s.canvas, 0, 0);
  queue = queue.then(async () => {
    try {
      const bytes = await canvasToPng(snapshot);
      const id = await sha256Hex(bytes);
      await assetStorage.put(id, bytes);
      const store = useSceneStore.getState();
      const node = store.scene.nodes[s.nodeId];
      if (!node) return;
      const info: AssetInfo = {
        id,
        name: `${node.name} paint`,
        type: "texture",
        bytes: bytes.byteLength,
        triangles: 0,
        boundsMin: [0, 0, 0],
        boundsMax: [0, 0, 0],
        note: "",
      };
      s.assetId = id;
      store.setNodeColorMap(s.nodeId, info, "Paint stroke");
    } catch (error) {
      console.error("Storing the painting failed:", error);
      say("Could not store the painting. Please try again.");
    }
  });
}

/** Waits until every finished stroke is stored (the browser tests and Done wait for this). */
export function paintSettled(): Promise<void> {
  return queue;
}

/**
 * After Undo or Redo the object uses another picture than the session shows: load that one (or the flat colour when
 * the paint is gone).
 */
export async function syncPaintWith(colorMap: string | null): Promise<void> {
  await queue;
  const s = session;
  if (!s || s.assetId === colorMap) return;
  const node = useSceneStore.getState().scene.nodes[s.nodeId];
  if (!node) return;
  try {
    const pixels = await startingPixels(colorMap, node.color);
    if (session !== s) return;
    s.pixels.set(pixels);
    s.assetId = colorMap;
    s.last = null;
    showPixels(s);
    usePaintStore.getState().bump();
  } catch (error) {
    console.error("Could not reload the painting:", error);
  }
}

/** Ends paint mode. Finished strokes are stored first. */
export async function stopPaint(): Promise<void> {
  const s = session;
  if (!s) return;
  endStroke();
  await queue;
  if (session !== s) return;
  session = null;
  usePaintStore.getState().setNodeId(null);
  if (s.assetId) rememberTexture(s.assetId, s.texture);
}

/** What the surface of every object shows from its stored colour map (kept so a repaint does not read the file again). */
const stored = new Map<string, CanvasTexture>();

export function rememberTexture(id: string, texture: CanvasTexture): void {
  stored.set(id, texture);
}

export function cachedTexture(id: string): CanvasTexture | undefined {
  return stored.get(id);
}

/** Reads a stored colour map into a texture (and keeps it). Null if the file is missing or cannot be read. */
export async function loadColorMap(id: string): Promise<CanvasTexture | null> {
  const cached = stored.get(id);
  if (cached) return cached;
  try {
    const bytes = await assetStorage.get(id);
    if (!bytes) return null;
    const texture = new CanvasTexture(await decodePng(bytes));
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    stored.set(id, texture);
    return texture;
  } catch (error) {
    console.warn("Could not read a painted picture:", error);
    return null;
  }
}
