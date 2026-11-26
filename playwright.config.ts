import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  retries: 0,
  reporter: [
    ["list"],
    ["html", { open: "never" }],
    ["junit", { outputFile: "test-results/e2e.xml" }],
  ],
  use: {
    baseURL: process.env.KM_BASE_URL ?? "http://127.0.0.1:3000",
    launchOptions: process.env.KM_CHROMIUM_PATH
      ? { executablePath: process.env.KM_CHROMIUM_PATH }
      : {},
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
