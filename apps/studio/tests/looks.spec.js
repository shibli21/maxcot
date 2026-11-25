import { expect, test } from '@playwright/test';

// The sixteen new skins, each drawing a two-actor stage in the studio without an error.
test('the New looks demo draws every new skin on a shared stage', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.selectOption('#demo', { label: 'New looks' });
  await expect(page.locator('#scoreStatus')).not.toHaveClass(/error|warn/);
  const seen = await page.evaluate(() => {
    const S = window.Studio, C = S.conductor, out = [];
    for (let bar = 1; bar <= 9; bar++) for (const beat of [2, 4]) {
      C.seek(C.timeOf([bar, beat])); for (let i = 0; i < 3; i++) S.step(0.04);
      out.push(S.stage.skin.name + ':' + S.stage.members.length);
    }
    return out;
  });
  const names = new Set(seen.map((s) => s.split(':')[0]));
  for (const n of ['maxcot', 'chalk', 'papercut', 'crayon', 'benday', 'silverage', 'noir', 'webcomic', 'rubberhose', 'flatvector', 'clay', 'animecel', 'gameboy', 'eightbit', 'isometric', 'ascii']) expect(names).toContain(n);
  expect(seen.filter((s) => s.endsWith(':2')).length).toBeGreaterThan(12);
  expect(errors).toEqual([]);
});
