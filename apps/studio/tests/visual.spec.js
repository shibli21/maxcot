import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00'));   // teletext prints the time
});

for (const mode of ['skins', 'poses', 'cast']) {
  test(`sheet: ${mode}`, async ({ page }) => {
    await page.goto(`/sheet.html?mode=${mode}`);
    await expect(page).toHaveTitle(/^OK \d+/);
    await expect(page).toHaveScreenshot(`sheet-${mode}.png`, { fullPage: true });
  });
}

const STATES = { 'poses-panel': [3, 1.2], 'hologram': [8, 1.2], 'film-edit': [14, 4.6], 'faces': [21, 4.6] };
for (const [name, at] of Object.entries(STATES)) {
  test(`studio: ${name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/?capture');
    await page.waitForFunction(() => window.Studio);
    await page.evaluate((at) => {
      const C = window.Studio.conductor;
      C.seek(C.timeOf(at));
      for (let i = 0; i < 12; i++) window.Studio.step(0.04);   // drain thumbnail and tile queues, let throttled views draw
    }, at);
    // let ResizeObserver/layout settle (a resize clears a canvas), then draw again
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => { for (let i = 0; i < 20; i++) window.Studio.step(0.04); });
    await expect(page).toHaveScreenshot(`studio-${name}.png`);
  });
}
