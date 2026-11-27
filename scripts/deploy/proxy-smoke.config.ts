import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const repositoryRoot = path.resolve(__dirname, '../..');
const webPort = Number(process.env.PROXY_SMOKE_WEB_PORT ?? 3100);
const webOrigin = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: path.join(repositoryRoot, 'scripts/deploy'),
  testMatch: 'proxy-smoke.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: webOrigin,
    trace: 'off',
    channel: 'chromium',
    ...devices['Desktop Chrome'],
  },
});
