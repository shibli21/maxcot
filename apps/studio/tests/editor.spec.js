import { expect, test } from '@playwright/test';

// The score editor: typing applies the score live; mistakes are marked on their line.
test('score editor: an edit plays immediately, a syntax error is pinned to its line', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');                       // 'Open the studio', as a person would
  await page.evaluate(() => window.Studio.step(0));  // capture mode: draw one frame so the start screen goes
  const status = page.locator('#scoreStatus');

  // retype the style at bar 5 beat 1
  await page.evaluate(() => {
    const ta = document.querySelector('#scoreEdit'), i = ta.value.indexOf("'inkpunch'");
    ta.focus(); ta.setSelectionRange(i + 1, i + 9);
  });
  await page.keyboard.type('neon');
  await expect(status).toHaveText(/edited/);
  const style = await page.evaluate(() => { const C = window.Studio.conductor; C.seek(C.timeOf([5, 1.2])); return window.Studio.state.style; });
  expect(style).toBe('neon');

  // delete a comma: the error names the line and the old score keeps playing
  const events = await page.evaluate(() => window.Studio.conductor.events.length);
  await page.evaluate(() => {
    const ta = document.querySelector('#scoreEdit'), i = ta.value.indexOf("pose: 'thinking' },") + "pose: 'thinking' }".length;
    ta.focus(); ta.setSelectionRange(i, i + 1);
  });
  await page.keyboard.press('Delete');
  await expect(status).toHaveText(/^Line \d+: Missing `,` before this item/);
  await expect(page.locator('#scoreHl .ln.error')).toHaveCount(1);
  expect(await page.evaluate(() => window.Studio.conductor.events.length)).toBe(events);

  // a typo is only a warning, with a suggestion
  await page.click('#bRevert');
  await page.evaluate(() => window.Studio.setScore(document.querySelector('#scoreEdit').value.replace("pose: 'thinking'", "pose: 'thinkin'")));
  await expect(status).toHaveText(/did you mean 'thinking'/);
});
