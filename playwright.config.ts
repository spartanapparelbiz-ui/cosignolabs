import { defineConfig } from "@playwright/test";

/**
 * Visual smoke test config. Boots the DEV server: demo mode (in-memory
 * store, offline planner) is development-only by design — in production the
 * fail-closed gate 503s /app without keys — so app-surface screenshots must
 * run under `next dev`. Landing + preview are public in either mode.
 */
export default defineConfig({
  testDir: "./tests/visual",
  timeout: 120_000,
  // Dev server compiles each route on first hit — give assertions room.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3400",
    actionTimeout: 20_000,
    navigationTimeout: 40_000,
    launchOptions: {
      executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    },
  },
  webServer: {
    command: "npx next dev -p 3400",
    url: "http://localhost:3400/api/health",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
