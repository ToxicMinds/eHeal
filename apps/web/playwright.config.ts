import { defineConfig, devices } from "@playwright/test";

// Local runs serve the static build. Set E2E_BASE_URL (with E2E_EMAIL and
// E2E_PASSWORD) to run the same checks against the deployed app.
const remote = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: remote ?? "http://127.0.0.1:3210", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: remote
    ? undefined
    : { command: "pnpm exec serve out -l 3210 -L", url: "http://127.0.0.1:3210/sign-in/", reuseExistingServer: false },
});
