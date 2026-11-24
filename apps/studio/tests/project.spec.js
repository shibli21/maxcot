import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Save, open, share: a project is the score text plus the film, and travels as a file or a link.
const editScore = (page, from, to) => page.evaluate(([a, b]) => {
  const ta = document.querySelector('#scoreEdit'); window.Studio.setScore(ta.value.replace(a, b));
}, [from, to]);
const open = async (page, url = '/') => {
  await page.goto(url);
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
};

test('save downloads the project, and opening that file brings it back', async ({ page }, info) => {
  await open(page);
  await editScore(page, "title: 'Tour'", "title: 'My Remix'");
  await editScore(page, "style: 'inkpunch'", "style: 'neon'");
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#bSave')]);
  expect(download.suggestedFilename()).toBe('my-remix.maxcot.json');
  const file = info.outputPath('saved.maxcot.json');
  await download.saveAs(file);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  expect(saved).toMatchObject({ format: 'maxcot-project', version: 1, title: 'My Remix' });
  expect(saved.score).toContain("style: 'neon'");

  await page.click('#bRevert');
  await expect(page.locator('#scoreEdit')).not.toHaveValue(/\{ at: \[5, 1\], style: 'neon' \}/);
  await page.setInputFiles('#fileOpen', file);
  await expect(page.locator('#scoreEdit')).toHaveValue(/\{ at: \[5, 1\], style: 'neon' \}/);
  await expect(page.locator('#scoreFile')).toHaveText('saved.maxcot.json');
});

test('a share link opens the same project in a fresh browser', async ({ page, browser }) => {
  await open(page);
  await editScore(page, "style: 'inkpunch'", "style: 'riso'");
  const code = await page.evaluate(() => window.Studio.shareCode());
  expect(code).toMatch(/^[A-Za-z0-9_-]+$/);

  const fresh = await browser.newPage();
  await fresh.goto('/#p=' + code);
  await fresh.waitForFunction(() => window.Studio);
  await expect(fresh.locator('#scoreEdit')).toHaveValue(/\{ at: \[5, 1\], style: 'riso' \}/);
  await expect(fresh.locator('#scoreFile')).toHaveText(/^shared: Tour/);
  const style = await fresh.evaluate(() => { const C = window.Studio.conductor; C.seek(C.timeOf([5, 1.2])); return window.Studio.state.style; });
  expect(style).toBe('riso');
});

test('unsaved edits survive a reload; Revert forgets them', async ({ page }) => {
  await open(page);
  await editScore(page, "pose: 'thinking'", "pose: 'shrug'");
  await page.waitForTimeout(900);                 // the draft is written 600 ms after the last change
  await page.reload();
  await page.waitForFunction(() => window.Studio);
  await expect(page.locator('#scoreEdit')).toHaveValue(/pose: 'shrug'/);
  await expect(page.locator('#scoreFile')).toHaveText(/^draft: /);
  await page.click('#bFree');
  await page.click('#bRevert');
  await page.waitForTimeout(900);
  await page.reload();
  await page.waitForFunction(() => window.Studio);
  await expect(page.locator('#scoreEdit')).toHaveValue(/pose: 'thinking'/);
});

test('broken or hostile input is refused, never run', async ({ page }) => {
  await open(page);
  const before = await page.locator('#scoreEdit').inputValue();
  const tries = [
    ['not json at all', /not a project file/],
    [JSON.stringify({ format: 'something-else' }), /not a Maxcot project/],
    [JSON.stringify({ format: 'maxcot-project', version: 1, title: 'x', score: '[]', film: { title: 'x', shots: 'nope' } }), /film is damaged/]
  ];
  for (const [text, msg] of tries) {
    await page.setInputFiles('#fileOpen', { name: 'evil.maxcot.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.locator('#toast')).toHaveText(msg);
  }
  expect(await page.locator('#scoreEdit').inputValue()).toBe(before);

  // a score that tries to be code is just a parse error, shown in the editor
  const code = await page.evaluate(async () => {
    const p = { format: 'maxcot-project', version: 1, title: 'evil', score: "[{ at: [1, 1], pose: alert(document.cookie) }]" };
    const bytes = new TextEncoder().encode(JSON.stringify(p));
    const packed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let bin = ''; packed.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  });
  let dialogs = 0; page.on('dialog', (d) => { dialogs++; void d.dismiss(); });
  await page.goto('/#p=' + code);              // same page, only the hash changes: the studio must notice
  await expect(page.locator('#scoreStatus')).toHaveText(/is not a value/);
  expect(dialogs).toBe(0);
});
