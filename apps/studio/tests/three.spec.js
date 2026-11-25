import { expect, test } from '@playwright/test';

// Real 3D: the score cuts between 2D and three.js; looks, sets, the 3D button and export.
const spread = (page) => page.evaluate(() => {
  // how varied the 3D canvas is: a blank or failed render is one flat colour
  const src = document.querySelector('#main3d'), c = document.createElement('canvas'); c.width = 160; c.height = 90;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0, 160, 90);
  const d = x.getImageData(0, 0, 160, 90).data, seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3));
  return seen.size;
});
const at = (page, bb) => page.evaluate((bb) => { const S = window.Studio, C = S.conductor; C.seek(C.timeOf(bb)); for (let k = 0; k < 10; k++) S.step(1 / 30); }, bb);

test('the Into 3D demo cuts to three.js and back', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.selectOption('#demo', { label: 'Into 3D' });
  await expect(page.locator('#scoreStatus')).not.toHaveClass(/error|warn/);
  await page.evaluate(() => window.Studio.load3d());
  await at(page, [1, 3]);
  await expect(page.locator('#main')).toBeVisible();
  await at(page, [2, 3]);
  await expect(page.locator('#main3d')).toBeVisible();
  await expect(page.locator('#main')).toBeHidden();
  expect(await spread(page)).toBeGreaterThan(30);
  const s3 = () => page.evaluate(() => { const s = window.Studio.stage3d; return { n: s.actors.size, look: s.look, set: s.set }; });
  expect(await s3()).toEqual({ n: 1, look: 'toon', set: 'studio' });
  await at(page, [3, 3]);
  expect(await s3()).toEqual({ n: 2, look: 'clay', set: 'room' });
  await at(page, [5, 3]);
  expect(await s3()).toEqual({ n: 2, look: 'hologram', set: 'street' });
  expect(await spread(page)).toBeGreaterThan(30);
  await at(page, [6, 3]);
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('#main3d')).toBeHidden();
  expect(errors).toEqual([]);
});

test('the 3D button switches the stage, and a 3D frame exports', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.evaluate(() => window.Studio.step(0.02));
  await page.evaluate(() => window.Studio.load3d());
  await page.click('#b3d');
  await page.waitForFunction(() => window.Studio.stage3d);
  await page.evaluate(() => { for (let k = 0; k < 5; k++) window.Studio.step(1 / 30); });
  await expect(page.locator('#b3d')).toHaveClass(/on/);
  expect(await page.evaluate(() => window.Studio.state.dim)).toBe('3d');
  const png = await page.evaluate(async () => {
    const r = await window.Studio.exportVideo({ format: 'png', height: 360 }), img = await createImageBitmap(r.blob);
    const c = document.createElement('canvas'); c.width = 64; c.height = 36; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data, seen = new Set(); for (let i = 0; i < d.length; i += 4) seen.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
    return { w: r.width, colours: seen.size };
  });
  expect(png.w).toBe(640);
  expect(png.colours).toBeGreaterThan(30);
  await page.click('#b3d');
  expect(await page.evaluate(() => window.Studio.state.dim)).toBe('2d');
});
