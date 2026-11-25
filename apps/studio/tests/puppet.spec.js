import { expect, test } from '@playwright/test';

// Puppet: the mouse, the keys and a gamepad play the selected actor; a take can be recorded into the score.
async function open(page) {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.evaluate(() => { window.Studio.step(0.02); window.Studio.openPanel('Puppet'); });
  await page.click('[data-k="puppet:go"]');
  expect(await page.evaluate(() => window.Studio.puppet.bound)).toBe(true);
}
const step = (page, n = 30) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.Studio.step(1 / 30); }, n);

test('the mouse steers and talks, number keys strike poses', async ({ page }) => {
  await open(page);
  const box = await page.locator('#main').boundingBox();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.5);
  await page.mouse.down();
  await step(page);
  const o = await page.evaluate(() => window.Studio.state.actor.offsets);
  expect(o['eyes.lookX']).toBeGreaterThan(0.6);
  expect(o['mouth.open']).toBeGreaterThan(0.5);
  await page.mouse.up();
  await page.keyboard.press('Digit2');
  expect(await page.evaluate(() => window.Studio.state.actor.poseName)).toBe('thumbsup');
  await page.keyboard.press('Digit0');
  expect(await page.evaluate(() => window.Studio.state.actor.poseName)).toBe('rest');
  // Space still plays and pauses: the puppet only takes its own keys
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.Studio.conductor.playing)).toBe(true);
  await page.click('[data-k="puppet:go"]');
  expect(await page.evaluate(() => [window.Studio.puppet.bound, window.Studio.state.actor.offsets])).toEqual([false, null]);
});

test('a recorded take is written into the score at the beats it was struck on', async ({ page }) => {
  await open(page);
  await page.locator('#panelBody label', { hasText: 'Record poses' }).locator('input').check();
  await page.evaluate(() => { const C = window.Studio.conductor; C.seek(C.timeOf([6, 1])); C.play(); });
  await step(page, 10); await page.keyboard.press('Digit1');
  await step(page, 20); await page.keyboard.press('Digit4');
  await step(page, 5);
  await page.evaluate(() => window.Studio.conductor.pause());
  await step(page, 2);
  const text = await page.locator('#scoreEdit').inputValue();
  expect(text).toContain('// recorded with the puppet');
  expect(text).toMatch(/\{ at: \[6, [\d.]+\], pose: 'wave' \}/);
  expect(text).toMatch(/pose: 'shrug' \}\s*\]/);
  await expect(page.locator('#scoreStatus')).not.toHaveClass(/error/);
});

test('a gamepad plays the puppet', async ({ page }) => {
  await page.addInitScript(() => {
    const btn = (p, v) => ({ pressed: p, touched: p, value: v });
    window.__pad = { id: 'Test pad', connected: true, axes: [-1, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(false, i === 7 ? 1 : 0)) };
    navigator.getGamepads = () => [window.__pad];
  });
  await open(page);
  await step(page);
  const o = await page.evaluate(() => window.Studio.state.actor.offsets);
  expect(o['eyes.lookX']).toBeLessThan(-0.6);
  expect(o['mouth.open']).toBeGreaterThan(0.6);
  await expect(page.locator('.padStatus')).toContainText('Test pad');
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: true, touched: true, value: 1 }; });
  await step(page, 2);
  expect(await page.evaluate(() => window.Studio.state.actor.poseName)).toBe('wave');
});
