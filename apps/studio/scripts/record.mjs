// scripts/record.mjs: render the score to an MP4.
// Serves the studio with Vite, opens it with ?capture in headless Chrome, steps the studio one frame at a
// time (so the result never drops a frame, however slow the machine), pipes
// each screenshot into ffmpeg and muxes in the synth beat rendered offline.
//
//   bun run record                                  → out/maxcot.mp4, 1920×1080, 30 fps
//   bun run record --start=17 --end=24 --out=out/clip.mp4
//   bun run record --width=1280 --height=720 --fps=60 --chrome="C:/path/chrome.exe"
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const W = +(args.width || 1920), H = +(args.height || 1080), FPS = +(args.fps || 30);
const out = resolve(args.out || join(root, '..', '..', 'out', 'maxcot.mp4'));
const CHROMES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
];
const chrome = args.chrome || CHROMES.find((p) => p && existsSync(p));
if (!chrome) throw new Error('No Chrome found. Pass --chrome=/path/to/chrome or set CHROME_PATH.');
mkdirSync(dirname(out), { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await puppeteer.launch({
  executablePath: chrome, headless: true,
  args: ['--allow-file-access-from-files', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }
});
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(url + '?capture', { waitUntil: 'load' });
  await page.waitForFunction(() => window.Studio && window.Studio.conductor, { timeout: 60000 });

  const total = await page.evaluate(() => Studio.conductor.total);
  const start = Math.max(0, +(args.start || 0)), end = Math.min(total, +(args.end || total));
  const frames = Math.ceil((end - start) * FPS);

  // the soundtrack, rendered offline and sample-accurate to the score
  const wav = join(dirname(out), 'beat.wav');
  const b64 = await page.evaluate((sec) => Studio.renderBeatWav(sec), total);
  writeFileSync(wav, Buffer.from(b64, 'base64'));

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-ss', String(start), '-i', wav, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => ff.on('close', (c) => (c ? fail(new Error('ffmpeg exited ' + c)) : ok())));

  await page.evaluate((s) => { Studio.conductor.seek(s); Studio.conductor.play(); Studio.step(0); }, start);
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    if (i) await page.evaluate((dt) => Studio.step(dt), 1 / FPS);
    const shot = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % FPS === 0) process.stdout.write(`\r${(start + i / FPS).toFixed(0).padStart(3)}s / ${end.toFixed(0)}s  (${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)`);
  }
  ff.stdin.end(); await done;
  console.log(`\nwrote ${out}`);
} finally {
  await browser.close();
  await server.close();
}
