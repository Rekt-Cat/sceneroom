import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The database package is TypeScript source in this repo; Next compiles it with the app
  transpilePackages: ["@sceneroom/db"],
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
