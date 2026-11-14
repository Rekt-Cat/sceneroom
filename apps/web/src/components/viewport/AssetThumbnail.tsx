"use client";

import { useEffect, useState } from "react";
import type { AssetInfo } from "@sceneroom/shared";
import { getThumbnail } from "@/assets/thumbnail";
import { Icon } from "./icons";

/**
 * The small picture of an imported model, drawn once. While the picture is being made (or if it
 * cannot be made) a model icon shows.
 */
export default function AssetThumbnail({ asset }: { asset: AssetInfo }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getThumbnail(asset)
      .then((result) => {
        if (current) setUrl(result);
      })
      .catch((error: unknown) => {
        // The icon stays; the model itself may still show (or have its own error message)
        console.warn("Could not draw a thumbnail:", error);
      });
    return () => {
      current = false;
    };
  }, [asset]);

  return (
    <div
      aria-hidden="true"
      className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-ed-line bg-ed-field text-ed-text-3"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a small picture made in the browser (a data URL), nothing to optimise
        <img
          src={url}
          alt=""
          draggable={false}
          className="size-full object-contain"
        />
      ) : (
        <Icon name="model" className="size-5" />
      )}
    </div>
  );
}
