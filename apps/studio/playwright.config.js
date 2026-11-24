import { defineConfig } from '@playwright/test';

// Visual regression for the engine: contact sheets of every skin, pose and actor,
// plus studio states rendered deterministically through ?capture.
// Uses the Chrome already installed on the machine (no browser download).
export default defineConfig({
  testDir: 'tests',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{platform}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled' } },
  use: { channel: 'chrome', viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, baseURL: 'http://localhost:5174' },
  webServer: { command: 'bunx vite --port 5174 --strictPort', url: 'http://localhost:5174', reuseExistingServer: true },
  workers: 2
});
