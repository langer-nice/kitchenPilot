const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm start",
    port: 3000,
    cwd: __dirname,
    reuseExistingServer: true,
    timeout: 30_000
  }
});
