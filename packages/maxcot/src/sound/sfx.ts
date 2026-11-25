// sfx.ts: cartoon sound effects, synthesised from scratch as plain samples.
//
// Every effect is a pure function of its name (and a seed for the noisy ones),
// so a live studio and an offline export make exactly the same sound. No files,
// no WebAudio: the result is a Float32Array you can play, mix or save.

export const SFX = ['pop', 'boing', 'whoosh', 'ding', 'thud', 'zap', 'blip', 'slide', 'tada', 'crash'] as const;
export type SfxName = (typeof SFX)[number];
/** What each effect sounds like, for pickers. */
export const SFX_LABEL: Record<SfxName, string> = {
  pop: 'Pop', boing: 'Boing', whoosh: 'Whoosh', ding: 'Ding', thud: 'Thud', zap: 'Zap', blip: 'Blip', slide: 'Slide whistle', tada: 'Ta-da', crash: 'Crash'
};
/** Length of each effect in seconds. */
export const SFX_LEN: Record<SfxName, number> = { pop: 0.12, boing: 0.7, whoosh: 0.55, ding: 1.4, thud: 0.4, zap: 0.35, blip: 0.18, slide: 0.8, tada: 1.3, crash: 1.6 };
export function isSfx(name: string): name is SfxName { return (SFX as readonly string[]).includes(name); }

export interface SfxOptions { sampleRate?: number; seed?: number }

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 7;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 * 2 - 1; };
}
const TAU = Math.PI * 2;

/** Synthesise one effect as mono samples in -1..1. */
export function sfx(name: SfxName | string, o: SfxOptions = {}): Float32Array {
  const sr = o.sampleRate ?? 44100, key = (isSfx(name) ? name : 'pop') as SfxName, len = SFX_LEN[key];
  const n = Math.ceil(len * sr), out = new Float32Array(n), noise = rng(o.seed ?? 3);
  let ph = 0, ph2 = 0, lp = 0, bp = 0, lo = 0;
  // a state-variable filter for swept noise
  const svf = (x: number, f: number, q: number) => { const k = 2 * Math.sin(Math.PI * Math.min(f, sr / 6) / sr); lo += k * bp; const hi = x - lo - q * bp; bp += k * hi; return bp; };
  for (let i = 0; i < n; i++) {
    const t = i / sr, u = t / len;
    let y = 0;
    switch (key) {
      case 'pop': { const f = 300 + 900 * Math.exp(-t * 60); ph += f / sr; y = Math.sin(TAU * ph) * Math.exp(-t * 40) + (i < 40 ? noise() * 0.4 : 0); break; }
      case 'boing': { const f = 160 * (1 + 0.45 * Math.sin(TAU * 11 * t) * Math.exp(-t * 3.5)) * (1 + u * 0.3); ph += f / sr; y = Math.sin(TAU * ph) * Math.exp(-t * 4.2) * Math.min(1, t * 200); break; }
      case 'whoosh': { const f = 350 + 2600 * Math.sin(Math.PI * u) ** 2; y = svf(noise(), f, 0.6) * Math.sin(Math.PI * u) ** 1.5 * 1.6; break; }
      case 'ding': {
        const f = 1320; y = (Math.sin(TAU * f * t) * Math.exp(-t * 3) + 0.5 * Math.sin(TAU * f * 2.76 * t) * Math.exp(-t * 6) + 0.25 * Math.sin(TAU * f * 5.4 * t) * Math.exp(-t * 11)) * Math.min(1, t * 800);
        break;
      }
      case 'thud': { const f = 40 + 50 * Math.exp(-t * 18); ph += f / sr; lp += (noise() - lp) * 0.04; y = (Math.sin(TAU * ph) + lp * 2) * Math.exp(-t * 11); break; }
      case 'zap': { const f = 120 + 1700 * Math.exp(-t * 14); ph += f / sr; y = (ph % 1 < 0.5 ? 0.6 : -0.6) * Math.exp(-t * 6); break; }
      case 'blip': { const f = t < 0.08 ? 880 : 1320; ph += f / sr; y = (ph % 1 < 0.5 ? 0.45 : -0.45) * (t % 0.09 < 0.075 ? 1 : 0) * Math.exp(-t * 6); break; }
      case 'slide': { const f = 380 * Math.pow(3.6, u) * (1 + 0.025 * Math.sin(TAU * 6 * t)); ph += f / sr; y = Math.sin(TAU * ph) * Math.min(1, t * 30) * Math.min(1, (len - t) * 12) * 0.8; break; }
      case 'tada': {
        // a short pickup, then the chord, on a buzzy brass-ish saw
        const notes = t < 0.13 ? [523.25] : [523.25, 659.25, 783.99, 1046.5], env = t < 0.13 ? Math.min(1, t * 60) * Math.exp(-t * 4) : Math.min(1, (t - 0.15) * 40) * Math.exp(-(t - 0.15) * 1.6);
        ph += 1 / sr; ph2 = 0; for (const f of notes) ph2 += ((ph * f * (1 + 0.003 * Math.sin(TAU * 5 * t))) % 1) * 2 - 1;
        lp += (ph2 / notes.length - lp) * 0.25; y = lp * (t < 0.13 || t > 0.15 ? env : 0) * 0.9; break;
      }
      case 'crash': { const x = noise(); lp += (x - lp) * 0.5; y = (x - lp) * Math.exp(-t * 2.6) * Math.min(1, t * 400) * 1.2; break; }
    }
    out[i] = y;
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = (out[i]! / peak) * 0.7;
  return out;
}
