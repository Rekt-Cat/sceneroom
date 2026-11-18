"use client";

import { useEffect, useRef, useState } from "react";
import { uvIslands, uvStretch, type ShapeMesh } from "@sceneroom/shared";
import { loadMeshData } from "@/assets/meshStorage";
import { useEditStore } from "@/store/editStore";
import { useSceneStore } from "@/store/sceneStore";

/** The size of the map picture, in pixels. */
const SIZE = 232;

/**
 * The UV window: the flat map of the mesh being edited, drawn in the corner of the 3D view. Every island has its own
 * colour, the faces are outlined and the seams are red, inside the 0 to 1 square the texture covers. Read-only for
 * now. It shows what Unwrap made.
 */
export default function UvWindow() {
  const on = useEditStore((state) => state.uvWindow);
  const nodeId = useEditStore((state) => state.nodeId);
  const assetId = useSceneStore((state) =>
    nodeId ? state.scene.nodes[nodeId]?.assetId : undefined,
  );
  if (!on || !nodeId || !assetId) return null;
  return <Window assetId={assetId} />;
}

function Window({ assetId }: { assetId: string }) {
  const mode = useEditStore((state) => state.uvWindowMode);
  const setMode = useEditStore((state) => state.setUvWindowMode);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [mesh, setMesh] = useState<ShapeMesh | null | "none">(null);

  // The mesh (with its map) changes with every stored edit: read it again when the asset changes
  useEffect(() => {
    let current = true;
    loadMeshData(assetId)
      .then((loaded) => current && setMesh(loaded.uvs ? loaded : "none"))
      .catch((error) => {
        console.error("Could not read the mesh for the UV window:", error);
        if (current) setMesh("none");
      });
    return () => {
      current = false;
    };
  }, [assetId]);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    draw(context, mesh && mesh !== "none" ? mesh : null, mode);
  }, [mesh, mode]);

  const islands = mesh && mesh !== "none" ? uvIslands(mesh).count : 0;
  const folded = mesh && mesh !== "none" ? uvStretch(mesh).folded : 0;
  return (
    <div
      role="group"
      aria-label="UV window"
      className="pointer-events-auto absolute right-3 bottom-16 z-10 rounded-lg border border-ed-line-strong bg-ed-raised/95 p-2 text-xs shadow-lg shadow-black/40"
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="font-semibold text-ed-text">UV window</span>
        <span className="text-ed-text-3">
          {mesh === "none"
            ? "no map yet"
            : `${islands} piece${islands === 1 ? "" : "s"}`}
        </span>
      </div>
      <canvas
        ref={canvas}
        width={SIZE}
        height={SIZE}
        aria-label="The UV map of the mesh"
        className="block rounded"
      />
      {mesh === "none" && (
        <p className="mt-1 max-w-[232px] text-ed-text-3">
          This mesh has no UV map. Press Unwrap in the UV row of the edit panel.
        </p>
      )}
      <div
        role="group"
        aria-label="What the map is coloured by"
        className="mt-1.5 flex gap-1"
      >
        {(["pieces", "stretch"] as const).map((choice) => (
          <button
            key={choice}
            type="button"
            aria-pressed={mode === choice}
            onClick={() => setMode(choice)}
            title={
              choice === "pieces"
                ? "Give every piece of the map its own colour"
                : "Colour each face by how stretched it is on the map: green is as it should be, red is badly stretched or turned over"
            }
            className={`flex-1 rounded-md border px-2 py-1 font-medium focus-visible:outline-2 focus-visible:outline-ed-accent ${
              mode === choice
                ? "border-ed-select/60 bg-ed-select/25 text-ed-select"
                : "border-ed-line-strong hover:bg-ed-field"
            }`}
          >
            {choice === "pieces" ? "Pieces" : "Stretch"}
          </button>
        ))}
      </div>
      {mode === "stretch" && (
        <div className="mt-1.5">
          <div
            aria-hidden="true"
            className="h-2 rounded-full"
            style={{
              background:
                "linear-gradient(to right, hsl(120 70% 45%), hsl(60 70% 45%), hsl(0 70% 45%))",
            }}
          />
          <div className="mt-0.5 flex justify-between text-ed-text-3">
            <span>even</span>
            <span>stretched</span>
          </div>
          {folded > 0 && (
            <p className="mt-1 max-w-[232px] text-ed-danger">
              {folded} face{folded === 1 ? " is" : "s are"} turned over.
            </p>
          )}
        </div>
      )}
      <p className="mt-1 max-w-[232px] text-ed-text-3">
        The square is the texture. Red lines are seams.
      </p>
    </div>
  );
}

/** Draws the map: the 0 to 1 square, then each island filled and outlined, then the seams on top. */
function draw(
  context: CanvasRenderingContext2D,
  mesh: ShapeMesh | null,
  mode: "pieces" | "stretch",
) {
  context.clearRect(0, 0, SIZE, SIZE);
  context.fillStyle = "#14191d";
  context.fillRect(0, 0, SIZE, SIZE);
  // The texture area
  context.strokeStyle = "#5a6a75";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
  if (!mesh?.uvs) return;
  const uv = mesh.uvs;
  // v goes up in a texture and down on the screen
  const at = (point: number): [number, number] => [
    uv[point * 2]! * SIZE,
    (1 - uv[point * 2 + 1]!) * SIZE,
  ];
  const { island } = uvIslands(mesh);
  const stretch = mode === "stretch" ? uvStretch(mesh).values : null;
  for (let t = 0; t < mesh.indices.length / 3; t++) {
    const [a, b, c] = [
      at(mesh.indices[t * 3]!),
      at(mesh.indices[t * 3 + 1]!),
      at(mesh.indices[t * 3 + 2]!),
    ];
    // Pieces: a colour each. Stretch: green (even) to red (badly stretched)
    const hue = stretch ? 120 * (1 - stretch[t]!) : (island[t]! * 67) % 360;
    context.beginPath();
    context.moveTo(a[0], a[1]);
    context.lineTo(b[0], b[1]);
    context.lineTo(c[0], c[1]);
    context.closePath();
    context.fillStyle = `hsla(${hue}, 60%, 55%, 0.35)`;
    context.fill();
    context.strokeStyle = `hsla(${hue}, 70%, 75%, 0.9)`;
    context.stroke();
  }
  // A seam is drawn only where its two ends are on the same piece: a line between two pieces would be a mistake
  const pieceOfPoint = new Map<number, number>();
  for (let t = 0; t < island.length; t++) {
    for (let k = 0; k < 3; k++)
      pieceOfPoint.set(mesh.indices[t * 3 + k]!, island[t]!);
  }
  context.strokeStyle = "#f0434a";
  context.lineWidth = 2;
  for (const seam of mesh.seams ?? []) {
    if (seam.a * 2 + 1 >= uv.length || seam.b * 2 + 1 >= uv.length) continue;
    if (pieceOfPoint.get(seam.a) !== pieceOfPoint.get(seam.b)) continue;
    const [a, b] = [at(seam.a), at(seam.b)];
    context.beginPath();
    context.moveTo(a[0], a[1]);
    context.lineTo(b[0], b[1]);
    context.stroke();
  }
}
