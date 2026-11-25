import { expect, test } from '@playwright/test';

// Film sound: score effects and lines, the film's Sound track, and the soundtrack an export gets.
test('every sound the show makes is logged on the song clock and mixed into the export', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.selectOption('#demo', { label: 'Sound check' });
  await expect(page.locator('#scoreStatus')).not.toHaveClass(/error|warn/);
  const log = await page.evaluate(() => {
    const S = window.Studio, C = S.conductor; C.seek(0); C.play();
    for (let i = 0; i < C.total * 30 + 5; i++) S.step(1 / 30);
    return Array.from(S.mixer.log.values()).map((c) => ({ key: c.key, at: c.at, len: c.samples.length / c.sampleRate }));
  });
  const kinds = (k) => log.filter((c) => c.key.indexOf(k + ':') === 0);
  expect(kinds('sfx')).toHaveLength(8);
  expect(kinds('talk')).toHaveLength(2);
  expect(kinds('film')).toHaveLength(8);                    // the tour film's sound track
  // film cues land after the film starts playing at bar 5 beat 3, in order
  const playAt = await page.evaluate(() => window.Studio.conductor.timeOf([5, 3]));
  const film = kinds('film').map((c) => c.at);
  expect(Math.min(...film)).toBeGreaterThan(playAt + 0.5);
  expect(film.slice().sort((a, b) => a - b)).toEqual(film);
  // replaying does not log anything twice
  const again = await page.evaluate(() => { const S = window.Studio, C = S.conductor; C.seek(3); C.seek(20); return S.mixer.log.size; });
  expect(again).toBe(log.length);
  const wavLen = await page.evaluate(async () => (await window.Studio.renderSoundWav(4)).length);
  expect(wavLen).toBeGreaterThan(4 * 48000 * 2 * 2 * 1.3);  // base64 of 4 s of 16-bit stereo
});

test('the timeline’s Sound row swaps, adds and deletes clips, and they survive a share link', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.evaluate(() => { window.Studio.exec('edit', 'Sound'); window.Studio.step(0.02); });
  await expect(page.locator('.tl-lane .blk.snd')).toHaveCount(8);
  await expect(page.locator('.tl-picker [data-k="boing"]')).toBeVisible();
  await page.locator('.tl-lane .blk.snd').nth(2).click();     // the ding
  await page.click('.tl-picker [data-k="boing"]');
  await page.click('.tl-picker .snd-add');
  await expect(page.locator('.tl-lane .blk.snd')).toHaveCount(9);
  await page.click('.tl-picker [data-k="line"]');
  await expect(page.locator('.tl-lane .blk.snd.say')).toHaveCount(4);
  await page.click('.tl-picker .snd-del');
  await expect(page.locator('.tl-lane .blk.snd')).toHaveCount(8);
  const sound = await page.evaluate(() => window.Studio.film.film.tracks.sound);
  expect(sound.filter((c) => c.sfx === 'boing')).toHaveLength(1);
  const code = await page.evaluate(() => window.Studio.shareCode());
  await page.goto('/?capture#p=' + code);
  await page.waitForFunction(() => window.Studio && window.Studio.project().film);
  expect(await page.evaluate(() => window.Studio.project().film.tracks.sound)).toEqual(sound);
});
