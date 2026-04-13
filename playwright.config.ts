import { defineConfig } from '@playwright/test';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv(file: string) {
  try {
    const content = readFileSync(resolve(__dirname, file), 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    }
  } catch { /* noop */ }
}
loadEnv('.env.test');
loadEnv('.env');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3002',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'PORT=3002 npm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
});
