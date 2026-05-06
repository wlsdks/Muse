import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm --filter @muse/web dev -- --port 5173",
    reuseExistingServer: true,
    timeout: 120_000,
    url: "http://127.0.0.1:5173"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
