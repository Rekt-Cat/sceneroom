"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only allowed inside a Client Component (Next.js docs: Lazy Loading),
// so this thin wrapper exists to load the WebGL viewport in the browser only.
const Viewport = dynamic(() => import("./Viewport"), {
  ssr: false,
  loading: () => (
    <p className="p-6 text-sm text-zinc-400">Loading 3D viewport…</p>
  ),
});

export default function ViewportLoader() {
  return <Viewport />;
}
