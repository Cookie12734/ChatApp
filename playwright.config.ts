import nextEnv from "@next/env";
import { defineConfig, devices } from "@playwright/test";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1"
      ? undefined
      : {
          command: "npm run dev",
          reuseExistingServer: true,
          timeout: 120_000,
          url: "http://localhost:3000/auth/login",
        },
});
