import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

// Loads the repo root's .env.test for local runs. It is gitignored: CI supplies the same throwaway
// values as job env, and process.loadEnvFile() never overwrites a variable that is already set.
const here = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(here, '..', '..', '.env.test'));
} catch {
  // Missing file: fall back to whatever the shell already exports.
}

const PORT = '3100';
// Set PLAYWRIGHT_BASE_URL to run a spec against an app that is already running, such as
// `docker compose up` on http://localhost:3000. No server is started then.
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  // The *built* app: only it has the CSP headers and serves the UI. The Vite dev server applies neither.
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'node ../api/dist/server.js',
        url: `http://localhost:${PORT}/health`,
        reuseExistingServer: !process.env.CI,
        env: { ...(process.env as Record<string, string>), PORT },
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
