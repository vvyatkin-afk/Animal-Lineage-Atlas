import { mkdirSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

mkdirSync('/tmp/animal-lineage-atlas-qa', { recursive: true });

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['json', { outputFile: '/tmp/animal-lineage-atlas-qa/playwright-report.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:4173/atlas/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
