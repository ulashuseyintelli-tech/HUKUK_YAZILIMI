import { defineConfig, devices } from '@playwright/test';

const webBaseUrl = process.env.CLIENT_WORKSPACE_WEB_BASE_URL ?? 'http://127.0.0.1:3002';

export default defineConfig({
  testDir: './e2e/client-workspace',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: 'playwright-report/client-workspace' }],
      ]
    : 'list',
  use: {
    baseURL: webBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'contract',
      testMatch: /.*\.contract\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-chromium',
      testIgnore: /.*\.contract\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile-chromium',
      testIgnore: /.*\.contract\.spec\.ts/,
      use: { ...devices['Pixel 5'] },
    },
  ],
});