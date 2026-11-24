import { expect, test } from '@playwright/test';

// Voice: lip-sync from sound. A score's `talk` lines, the test voice, and the microphone.
test.use({ permissions: ['microphone'], launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] } });

test('a scored talk line moves that actor’s mouth, and only while it lasts', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.selectOption('#demo', { label: 'Small talk' });
  await expect(page.locator('#scoreStatus')).not.toHaveClass(/error|warn/);
  const read = (bb) => page.evaluate((bb) => {
    const S = window.Studio, C = S.conductor; C.seek(C.timeOf(bb)); S.step(0.02);
    const out = {}; ['max', 'gran'].forEach((id) => { const a = S.stage.get(id); out[id] = { lips: a.lips ? a.lips.level : null, open: a.frame(1).C['mouth.open'] }; });
    return out;
  }, bb);
  // across Max's first line, his mouth opens and shuts; gran's stays shut
  const opens = [];
  for (let b = 1.1; b < 3.8; b += 0.15) { const r = await read([2, b]); opens.push(r.max.open); expect(r.gran.lips).toBeNull(); }
  expect(Math.max(...opens)).toBeGreaterThan(0.35);
  expect(Math.min(...opens)).toBeLessThan(0.15);
  // gran's line, aimed with on:
  const g = await read([3, 3]);
  expect(g.gran.lips).not.toBeNull();
  // when it is over the mouth is let go
  const after = await read([3, 4.9]);
  expect(after.max.lips).toBeNull();
  // the source pane shows the analysis
  await expect(page.locator('#engineFile')).toHaveText(/voice\/analyze\.ts|design\.ts|rig\.ts|character\.ts/);
  await expect(page.locator('#tabs button.on')).toHaveText('Voice');
});

test('the Voice tab drives the selected actor from the test voice and the microphone', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.evaluate(() => window.Studio.openPanel('Voice'));
  await expect(page.locator('#panelBody h4').first()).toHaveText('Lip-sync for max');
  await page.click('[data-k="voice:test"]');
  await page.waitForFunction(() => window.Studio.voice.source === 'file' && window.Studio.voice.lips.level > 0.2, null, { timeout: 10000 });
  expect(await page.evaluate(() => !!window.Studio.stage.get('max').lips)).toBe(true);
  await expect(page.locator('.voiceStatus')).toContainText('test voice');
  await page.click('[data-k="voice:none"]');
  expect(await page.evaluate(() => [window.Studio.voice.active, window.Studio.stage.get('max').lips])).toEqual([false, null]);
  // a fake microphone (Chrome's test device)
  await page.click('[data-k="voice:microphone"]');
  await page.waitForFunction(() => window.Studio.voice.source === 'microphone', null, { timeout: 10000 });
  await expect(page.locator('.voiceStatus')).toContainText('microphone');
  await page.click('[data-k="voice:none"]');
});
