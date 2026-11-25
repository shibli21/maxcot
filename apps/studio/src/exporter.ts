// exporter.ts: video, GIF and stills, made in the browser.
//
// The studio is stepped one frame at a time (never against the wall clock),
// so an export never drops a frame however slow the machine is. MP4 uses
// WebCodecs and mp4-muxer; GIF uses gifenc; a still is a PNG. Nothing is
// uploaded anywhere: the file is built in memory and downloaded.
import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { GIFEncoder, applyPalette, quantize } from 'gifenc';

export type ExportFormat = 'mp4' | 'gif' | 'png';

/** What the studio provides: a way to seek, step and draw, and its soundtrack. */
export interface ExportHost {
  /** Get ready to draw frames `w`×`h`. */
  begin(w: number, h: number): void;
  /** Jump to `t` seconds of song time and start playing from there. */
  seek(t: number): void;
  /** Advance `dt` seconds (0 just redraws) and draw the frame into `ctx`. */
  frame(dt: number, ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** The soundtrack from `from` to `to`, as 48 kHz stereo channels, or null for none. */
  soundtrack(from: number, to: number): Promise<Float32Array[] | null>;
  /** Put everything back. */
  end(): void;
}
export interface ExportOptions {
  format: ExportFormat;
  /** Song time range in seconds (ignored for a still). */
  from: number;
  to: number;
  /** Output height in pixels; the width follows `aspect`. */
  height: number;
  /** Width / height of the picture. */
  aspect: number;
  /** Frames a second (a GIF is capped at 25). */
  fps: number;
  /** Include the soundtrack (MP4 only). */
  sound: boolean;
  onProgress?: (done: number) => void;
  signal?: AbortSignal;
}
export interface ExportResult { blob: Blob; frames: number; width: number; height: number; codec: string; audio: string | null }

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const RATE = 48000;

/** Which formats this browser can make. */
export function canExport(): Record<ExportFormat, boolean> {
  return { mp4: typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined', gif: true, png: true };
}

export async function exportVideo(host: ExportHost, o: ExportOptions): Promise<ExportResult> {
  const fps = o.format === 'gif' ? Math.min(25, o.fps) : o.fps;
  const h = even(o.format === 'gif' ? Math.min(o.height, 480) : o.height), w = even(h * o.aspect);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: o.format === 'gif' })!;
  host.begin(w, h);
  try {
    if (o.format === 'png') {
      host.frame(0, ctx, w, h);
      const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not make a PNG.'))), 'image/png'));
      return { blob, frames: 1, width: w, height: h, codec: 'png', audio: null };
    }
    const frames = Math.max(1, Math.round((o.to - o.from) * fps));
    host.seek(o.from);
    return o.format === 'gif' ? await gif(host, o, ctx, w, h, fps, frames) : await mp4(host, o, ctx, canvas, w, h, fps, frames);
  } finally {
    host.end();
  }
}

function check(o: ExportOptions): void { if (o.signal && o.signal.aborted) throw new DOMException('Export cancelled', 'AbortError'); }

async function gif(host: ExportHost, o: ExportOptions, ctx: CanvasRenderingContext2D, w: number, h: number, fps: number, frames: number): Promise<ExportResult> {
  const enc = GIFEncoder(), delay = Math.round(1000 / fps);
  for (let i = 0; i < frames; i++) {
    check(o);
    host.frame(i ? 1 / fps : 0, ctx, w, h);
    const data = ctx.getImageData(0, 0, w, h).data, palette = quantize(data, 256, { format: 'rgb444' });
    enc.writeFrame(applyPalette(data, palette, 'rgb444'), w, h, { palette, delay });
    if (o.onProgress) o.onProgress((i + 1) / frames);
    if (i % 2 === 1) await tick();
  }
  enc.finish();
  return { blob: new Blob([enc.bytes() as BlobPart], { type: 'image/gif' }), frames, width: w, height: h, codec: 'gif', audio: null };
}

/** The first video codec this browser will encode at this size, as [WebCodecs string, mp4-muxer name]. */
async function videoCodec(w: number, h: number, fps: number): Promise<[string, 'avc' | 'vp9' | 'av1']> {
  const tries: Array<[string, 'avc' | 'vp9' | 'av1']> = [['avc1.640033', 'avc'], ['avc1.4d0033', 'avc'], ['avc1.42e033', 'avc'], ['vp09.00.51.08', 'vp9'], ['av01.0.12M.08', 'av1']];
  for (const [codec, name] of tries) {
    try {
      const s = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, framerate: fps, bitrate: bitrate(w, h, fps) });
      if (s.supported) return [codec, name];
    } catch { /* try the next */ }
  }
  throw new Error('This browser cannot encode video at ' + w + '×' + h + '.');
}
const bitrate = (w: number, h: number, fps: number) => Math.round(w * h * fps * 0.12);
async function audioCodec(): Promise<[string, 'aac' | 'opus'] | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  for (const [codec, name] of [['mp4a.40.2', 'aac'], ['opus', 'opus']] as Array<[string, 'aac' | 'opus']>) {
    try { if ((await AudioEncoder.isConfigSupported({ codec, sampleRate: RATE, numberOfChannels: 2, bitrate: 192000 })).supported) return [codec, name]; } catch { /* next */ }
  }
  return null;
}

async function mp4(host: ExportHost, o: ExportOptions, ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, w: number, h: number, fps: number, frames: number): Promise<ExportResult> {
  const [vcodec, vname] = await videoCodec(w, h, fps), acodec = o.sound ? await audioCodec() : null;
  const muxer = new Muxer({
    target: new ArrayBufferTarget(), fastStart: 'in-memory', firstTimestampBehavior: 'offset',
    video: { codec: vname, width: w, height: h, frameRate: fps },
    ...(acodec && { audio: { codec: acodec[1], numberOfChannels: 2, sampleRate: RATE } })
  });
  let failed: Error | null = null;
  const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e as Error; } });
  venc.configure({ codec: vcodec, width: w, height: h, framerate: fps, bitrate: bitrate(w, h, fps), ...(vname === 'avc' && { avc: { format: 'avc' as const } }) });
  const us = 1e6 / fps;
  for (let i = 0; i < frames; i++) {
    check(o); if (failed) throw failed;
    host.frame(i ? 1 / fps : 0, ctx, w, h);
    const f = new VideoFrame(canvas, { timestamp: Math.round(i * us), duration: Math.round(us) });
    venc.encode(f, { keyFrame: i % (fps * 2) === 0 }); f.close();
    while (venc.encodeQueueSize > 6) await tick();
    if (o.onProgress) o.onProgress(((i + 1) / frames) * (acodec ? 0.92 : 1));
    if (i % 3 === 2) await tick();
  }
  await venc.flush(); venc.close();
  if (failed) throw failed;

  // the sound, rendered offline once the pictures are done (every cue the frames triggered is logged by then)
  let audio: string | null = null;
  if (acodec) {
    const chans = await host.soundtrack(o.from, o.from + frames / fps);
    if (chans && chans.length) {
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failed = e as Error; } });
      aenc.configure({ codec: acodec[0], sampleRate: RATE, numberOfChannels: 2, bitrate: 192000 });
      const L = chans[0]!, R = chans[1] || L, step = 4800;
      for (let s = 0; s < L.length; s += step) {
        check(o); const n = Math.min(step, L.length - s), plane = new Float32Array(n * 2);
        plane.set(L.subarray(s, s + n), 0); plane.set(R.subarray(s, s + n), n);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((s / RATE) * 1e6), data: plane });
        aenc.encode(ad); ad.close();
        if (aenc.encodeQueueSize > 20) await tick();
      }
      await aenc.flush(); aenc.close();
      if (failed) throw failed;
      audio = acodec[0];
    }
  }
  muxer.finalize();
  if (o.onProgress) o.onProgress(1);
  return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), frames, width: w, height: h, codec: vcodec, audio };
}
