import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests understand the same "@/..." shortcut for src/ as the app does (see tsconfig.json "paths").
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
