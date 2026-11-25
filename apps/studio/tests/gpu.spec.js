import { expect, test } from '@playwright/test';

// The effects layer: WebGL passes after a skin draws, a switch, and the Canvas 2D stand-in.
test('a gpu skin runs on WebGL, can be switched off, and falls back to Canvas 2D', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  const sum = () => page.evaluate(() => {
    const S = window.Studio; S.stage.dirty = true; S.step(0);   // same moment each time: neon flickers
    const c = document.querySelector('#main'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i] + d[i + 1] + d[i + 2]; return n;
  });
  await page.evaluate(() => { const S = window.Studio; S.step(0.02); S.exec('style', 'neon'); S.openPanel('Tune'); });
  const lit = await sum();
  expect(await page.evaluate(() => window.Studio.fx.last)).toBe('gpu');
  await page.locator('#panelBody label', { hasText: 'GPU effects' }).locator('input').uncheck();
  const plain = await sum();
  expect(await page.evaluate(() => window.Studio.fx.last)).toBe('off');
  expect(lit).toBeGreaterThan(plain * 1.01);              // bloom adds light
  await page.locator('#panelBody label', { hasText: 'GPU effects' }).locator('input').check();
  await page.evaluate(() => { window.Studio.fx.forceFallback = true; });
  const fallback = await sum();
  expect(await page.evaluate(() => window.Studio.fx.last)).toBe('2d');
  expect(fallback).toBeGreaterThan(plain);
  await page.evaluate(() => { window.Studio.fx.forceFallback = false; });
});
