// analyze.ts: from a slice of sound to a mouth shape.
//
// Pure functions, no WebAudio: loudness opens the mouth, the spectrum shapes it.
// A low first formant (i, u) keeps the mouth half shut, a second formant up above
// 1.6 kHz (e, i) pulls it wide, a spectrum with nothing above 1 kHz (o, u) rounds it, and hiss (s, sh, f)
// shows the teeth. It is a rough vowel guess, not speech recognition, which is
// exactly what cartoon lip-sync needs.
import type { Lips } from '../types.js';

export type { Lips };
/** A closed, silent mouth. */
export const QUIET: Lips = Object.freeze({ open: 0, round: 0, wide: 1, teeth: 0, level: 0 });

export interface AnalyzeOptions {
  /** Loudness (dBFS) where the mouth starts to open. Lower hears quieter voices. Default -50. */
  gate?: number;
  /** Decibels from the gate to a fully open mouth. Default 32. */
  range?: number;
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const windows = new Map<number, Float32Array>();
function hann(n: number): Float32Array {
  let w = windows.get(n);
  if (!w) { w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)); windows.set(n, w); }
  return w;
}
/** In-place radix-2 FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]!; re[i] = re[j]!; re[j] = t; t = im[i]!; im[i] = im[j]!; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, xr = re[b]! * cr - im[b]! * ci, xi = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - xr; im[b] = im[a]! - xi; re[a] = re[a]! + xr; im[a] = im[a]! + xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** The mouth for one slice of sound (the last power-of-two window of `samples`, up to 2048). */
export function analyze(samples: ArrayLike<number>, sampleRate: number, o: AnalyzeOptions = {}): Lips {
  let n = 256; while (n * 2 <= Math.min(2048, samples.length)) n *= 2;
  if (samples.length < 256) return QUIET;
  const off = samples.length - n, w = hann(n), re = new Float64Array(n), im = new Float64Array(n);
  let sq = 0;
  // pre-emphasis (+6 dB an octave) undoes the voice's natural tilt, so upper formants count
  for (let i = 0; i < n; i++) { const s = samples[off + i]!, prev = off + i > 0 ? samples[off + i - 1]! : 0; sq += s * s; re[i] = (s - 0.95 * prev) * w[i]!; }
  const db = 10 * Math.log10(sq / n + 1e-12), gate = o.gate ?? -50, range = o.range ?? 32;
  const level = clamp((db - gate) / range, 0, 1);
  if (level <= 0) return QUIET;
  fft(re, im);
  const hz = sampleRate / n, nyq = sampleRate / 2;
  let low = 0, mid = 0, high = 0, sib = 0, f1w = 0, f1p = 0;
  for (let k = 1; k < n / 2; k++) {
    const f = k * hz, p = re[k]! * re[k]! + im[k]! * im[k]!;
    if (f < 150) continue;
    if (f < 1000) low += p; else if (f < 1600) mid += p; else if (f < 3500) high += p; else if (f >= 4000 && f < Math.min(9000, nyq)) sib += p;
    if (f < 1000) { f1w += f * p; f1p += p; }
  }
  const voiced = low + mid + high, total = voiced + sib;
  if (total <= 0) return QUIET;
  // band levels in dB: front vowels (e, i) carry their second formant above 1.6 kHz,
  // back vowels (o, u) keep almost everything below 1 kHz
  const dB = (p: number) => 10 * Math.log10(p + 1e-20), L = dB(low), M = dB(mid), H = dB(high);
  const hiss = sib / total, f1 = f1p > 0 ? f1w / f1p : 500;
  const front = clamp((H - M - 2) / 10, 0, 1);
  const round = clamp((L - M - 12) / 10, 0, 1) * (1 - front) * (1 - hiss);
  const jaw = clamp((f1 - 260) / 400, 0, 1);                 // i, u ~0 ... a ~1
  const wide = 1 + front * 0.3 - round * 0.55;
  return {
    open: level * (0.3 + 0.75 * jaw) * (1 - 0.7 * hiss),
    round, wide,
    teeth: clamp((hiss - 0.25) * 3, 0, 1) * level,
    level
  };
}

/** Eases raw shapes over time: mouths snap open and fall shut a little slower. */
export class LipSmoother {
  /** Rates per second for opening and for closing. */
  attack = 30;
  release = 13;
  lips: Lips = Object.assign({}, QUIET);
  push(raw: Lips, dt: number): Lips {
    const L = this.lips, rate = raw.open > L.open ? this.attack : this.release, a = 1 - Math.exp(-rate * dt), b = 1 - Math.exp(-18 * dt);
    L.open += (raw.open - L.open) * a; L.level += (raw.level - L.level) * a; L.teeth += (raw.teeth - L.teeth) * a;
    // the shape only follows while there is sound to shape it
    if (raw.level > 0) { L.round += (raw.round - L.round) * b; L.wide += (raw.wide - L.wide) * b; }
    return { open: L.open, round: L.round, wide: L.wide, teeth: L.teeth, level: L.level };
  }
  reset(): void { this.lips = Object.assign({}, QUIET); }
}

/** A whole recording turned into mouth shapes, one per frame. Deterministic: the same sound gives the same track. */
export function lipTrack(samples: ArrayLike<number>, sampleRate: number, fps = 60, o: AnalyzeOptions = {}): Lips[] {
  const out: Lips[] = [], sm = new LipSmoother(), win = 1024, frames = Math.ceil((samples.length / sampleRate) * fps);
  const slice = new Float32Array(win);
  for (let f = 0; f < frames; f++) {
    const end = Math.round(((f + 0.5) / fps) * sampleRate) + win / 2;
    for (let i = 0; i < win; i++) { const j = end - win + i; slice[i] = j >= 0 && j < samples.length ? samples[j]! : 0; }
    out.push(sm.push(analyze(slice, sampleRate, o), 1 / fps));
  }
  return out;
}

/** The mouth at time `t` (seconds) in a track, blended between frames. Silent outside it. */
export function lipsAt(track: Lips[], fps: number, t: number): Lips {
  const x = t * fps - 0.5, i = Math.floor(x);
  if (!track.length || t < 0 || i >= track.length) return QUIET;
  const a = track[clamp(i, 0, track.length - 1)]!, b = track[clamp(i + 1, 0, track.length - 1)]!, u = clamp(x - i, 0, 1);
  const m = (k: keyof Lips) => a[k] + (b[k] - a[k]) * u;
  return { open: m('open'), round: m('round'), wide: m('wide'), teeth: m('teeth'), level: m('level') };
}
