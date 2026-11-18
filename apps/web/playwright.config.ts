import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser opens the real editor and clicks through it (see e2e/). Run them with
 * `pnpm test:e2e` from the repo root. They are not part of `pnpm test` (those are fast tests without a browser).
 *
 * The browser is Playwright's own Chromium, kept wherever PLAYWRIGHT_BROWSERS_PATH points (set it before running
 * `npx playwright install chromium` and before running the tests; see docs/WHAT-WE-USED.md). The 3D view needs WebGL,
 * so Chromium is started with a software renderer (slower than a graphics card, but works with no screen).
 */
export default defineConfig({
  testDir: "./e2e",
  // One test at a time: they share the dev server and each makes projects in the browser's own storage
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  // Starts the dev server when it is not already running (and uses the one that is)
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
