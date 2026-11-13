"use client";

import { useImportStore } from "@/store/importStore";
import { Icon } from "./icons";

/** The bar at the top of the 3D view that says an import is running, finished, or failed (and why). */
export default function ImportBanner() {
  const busy = useImportStore((state) => state.busy);
  const message = useImportStore((state) => state.message);
  const setMessage = useImportStore((state) => state.setMessage);

  if (!busy && !message) return null;

  const isError = message?.tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`absolute top-3 left-1/2 flex max-w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 items-start gap-3 rounded-lg border px-3.5 py-2.5 text-sm shadow-lg shadow-black/40 backdrop-blur ${
        isError
          ? "border-[#5a2b31] bg-[#2a1215]/95 text-ed-danger"
          : "border-ed-line-strong bg-ed-panel/95 text-ed-text"
      }`}
    >
      <span className="flex-1">
        {busy ? "Importing the model…" : message?.text}
      </span>
      {!busy && (
        <button
          type="button"
          aria-label="Dismiss message"
          onClick={() => setMessage(null)}
          className="grid size-5 shrink-0 place-items-center rounded text-current opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-ed-accent"
        >
          <Icon name="close" className="size-3" />
        </button>
      )}
    </div>
  );
}
