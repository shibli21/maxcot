import { expect, test } from '@playwright/test';

// Manner: each actor moves in its own way; the Motion panel and the score can change it.
test('the Motion panel edits the selected actor’s manner; the score can too', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.selectOption('#demo', { label: 'Ensemble' });
  // let layout settle (a resize clears and rescales the canvas) before measuring where actors are
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const kidAt = await page.evaluate(() => {
    const S = window.Studio, C = S.conductor; C.seek(C.timeOf([6, 3.5])); S.step(0.04);
    const b = S.stage.S.actors.find((A) => A.F.who === 'child').body, r = document.querySelector('#main').getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
    return { x: r.left + b.cx / dpr, y: r.top + b.cy / dpr };
  });
  await page.mouse.click(kidAt.x, kidAt.y);
  await page.evaluate(() => window.Studio.openPanel('Motion'));
  await expect(page.locator('#panelBody h4').first()).toHaveText('Manner of kid');
  await expect(page.locator('[data-k="m:idle"] select')).toHaveValue('bouncy');      // the child's own habit
  await page.selectOption('[data-k="m:idle"] select', 'sway');
  expect(await page.evaluate(() => window.Studio.stage.get('kid').manner.idle)).toBe('sway');
  expect(await page.evaluate(() => window.Studio.stage.get('max').manner.idle)).toBe('none');

  // the score's manner command, aimed with on:
  const boss = await page.evaluate(() => { const S = window.Studio, C = S.conductor; C.seek(C.timeOf([10, 1.5])); return S.stage.get('boss').manner; });
  expect(boss).toMatchObject({ weight: 0.2, idle: 'bouncy' });
});
