import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.MMG_E2E_PORT || 4173);

for (const key of ['NO_PROXY', 'no_proxy']) {
  process.env[key] = [...(process.env[key] || '').split(','), '127.0.0.1', 'localhost']
    .filter(Boolean)
    .join(',');
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 2 : 3,
  fullyParallel: false,
  reporter: [['list'], ['json', { outputFile: 'artifacts/e2e-results.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${e2ePort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `http://127.0.0.1:${e2ePort}/index.html`,
    env: { PORT: String(e2ePort) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', testIgnore: '**/visual.spec.mjs', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'firefox', testIgnore: '**/visual.spec.mjs', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', testIgnore: '**/visual.spec.mjs', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
});
