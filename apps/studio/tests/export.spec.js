import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

// Export: frame-exact MP4 (WebCodecs), GIF and PNG, made in the page.
const run = (page, o) => page.evaluate(async (o) => {
  const r = await window.Studio.exportVideo(o), bytes = new Uint8Array(await r.blob.arrayBuffer());
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  return { frames: r.frames, width: r.width, height: r.height, codec: r.codec, audio: r.audio, type: r.blob.type, size: r.blob.size, b64: btoa(bin), t: window.Studio.conductor.songT };
}, o);
const head = (b64, n) => Buffer.from(b64, 'base64').subarray(0, n);

test('an MP4 has exactly one frame per step, the soundtrack, and leaves the studio where it was', async ({ page }, info) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.evaluate(() => { const C = window.Studio.conductor; C.seek(12.3); });
  const r = await run(page, { format: 'mp4', from: 49.6, to: 51.6, height: 360, fps: 30, sound: true });
  expect(r.type).toBe('video/mp4');
  expect(head(r.b64, 8).subarray(4).toString('latin1')).toBe('ftyp');
  expect(r.frames).toBe(60);
  expect([r.width, r.height]).toEqual([640, 360]);            // 16:9 by default
  expect(r.audio).toBeTruthy();
  expect(r.t).toBeCloseTo(12.3, 3);                         // put back where it was
  // when ffprobe is around, check the file itself
  const file = info.outputPath('clip.mp4'); writeFileSync(file, Buffer.from(r.b64, 'base64'));
  let probe = null; try { probe = execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,nb_read_frames', '-of', 'csv=p=0', file]).toString(); } catch { /* no ffprobe */ }
  if (probe) { expect(probe).toContain('video,60'); expect(probe).toMatch(/audio/); }
});

test('a GIF and a PNG come out with the right headers', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  const g = await run(page, { format: 'gif', from: 30, to: 31, height: 200, fps: 30 });
  expect(head(g.b64, 6).toString('latin1')).toBe('GIF89a');
  expect([g.frames, g.height]).toEqual([25, 200]);         // a GIF is capped at 25 fps
  const p = await run(page, { format: 'png', height: 300 });
  expect(head(p.b64, 4).toString('latin1')).toBe('\x89PNG');
  expect(p.height).toBe(300);
});

test('the Export dialog downloads a file', async ({ page }) => {
  await page.goto('/?capture');
  await page.waitForFunction(() => window.Studio);
  await page.click('#bFree');
  await page.evaluate(() => window.Studio.step(0.02));      // capture mode: one frame clears the intro
  await page.click('#bExport');
  await expect(page.locator('#exportDlg')).toBeVisible();
  await page.selectOption('#exportDlg select >> nth=0', 'png');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportDlg .go')]);
  expect(dl.suggestedFilename()).toMatch(/\.png$/);
  await expect(page.locator('#exportDlg')).toContainText('Done');
  await page.click('#exportDlg .xbtns button >> nth=0');
  await expect(page.locator('#exportDlg')).toHaveCount(0);
});
