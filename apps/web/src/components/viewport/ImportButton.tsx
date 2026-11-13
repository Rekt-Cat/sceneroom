"use client";

import { useRef } from "react";
import { importFiles } from "@/assets/importFile";
import { useImportStore } from "@/store/importStore";
import { Icon } from "./icons";

/** The "Import" button next to Add: opens the file chooser for a .glb model. */
export default function ImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useImportStore((state) => state.busy);

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        title="Import a .glb model (or drop one onto the 3D view)"
        className="flex h-7 items-center gap-1.5 rounded-md border border-ed-line-strong bg-ed-raised px-2.5 text-sm font-medium transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ed-accent disabled:cursor-wait disabled:opacity-60"
      >
        <Icon name="import" />
        Import
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".glb,model/gltf-binary"
        className="hidden"
        aria-label="Choose a .glb model to import"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          // Empty the box, so choosing the same file again still counts as a change
          event.target.value = "";
          void importFiles(files);
        }}
      />
    </>
  );
}
