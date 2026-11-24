// babble.ts: a made-up voice for testing and for characters with nothing to say.
//
// A source-filter synth: a buzzing glottal pulse with a wandering pitch, shaped
// by three resonators at each vowel's formants, with the odd hiss or pop in
// front. It speaks no language, but its vowels are real enough for analyze()
// to read, so a babbling character gets a believable mouth.

export interface BabbleOptions {
  /** Length in seconds. Default 2. */
  seconds?: number;
  /** Default 22050. */
  sampleRate?: number;
  /** Base pitch in Hz. Default 150; see pitchOf() for each actor's. */
  pitch?: number;
  /** Same seed, same babble. Default 1. */
  seed?: number;
  /** Syllables per second. Default 4.5. */
  rate?: number;
  /** Say these vowels in order (a, e, i, o, u) instead of picking at random. */
  vowels?: string;
  /** Leave out the consonants (handy for tests). */
  pure?: boolean;
}

/** First three formants (Hz) for each vowel, an adult voice. */
export const FORMANTS: Record<string, [number, number, number]> = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240]
};

/** A speaking pitch for each built-in actor. */
const PITCH: Record<string, number> = { max: 150, child: 290, girl: 240, boss: 100, clerk: 175, teen: 190, professor: 125, oldman: 110, grandma: 215 };
export function pitchOf(who: string): number { return PITCH[who] ?? 160; }

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

interface Syllable { at: number; len: number; vowel: string; cons: '' | 's' | 'p' | 'f'; gap: number }

/** Synthesise a few seconds of babble as mono samples in -1..1. */
export function babble(o: BabbleOptions = {}): Float32Array {
  const sr = o.sampleRate ?? 22050, seconds = o.seconds ?? 2, n = Math.max(1, Math.round(seconds * sr));
  const pitch = o.pitch ?? 150, rand = rng(o.seed ?? 1), rate = o.rate ?? 4.5;
  const scale = Math.pow(pitch / 150, 0.3);                              // smaller heads, higher formants
  // plan the syllables
  const syl: Syllable[] = []; let t = 0.04, vi = 0;
  while (t < seconds - 0.08) {
    const len = (0.75 + rand() * 0.5) / rate, vowel = o.vowels ? o.vowels[vi++ % o.vowels.length]! : 'aeiou'[Math.floor(rand() * 5)]!;
    const r = rand(), cons = o.pure ? '' : r < 0.18 ? 's' : r < 0.36 ? 'p' : r < 0.46 ? 'f' : '';
    const gap = !o.vowels && rand() < 0.16 ? 0.12 + rand() * 0.16 : 0.025;
    syl.push({ at: t, len: Math.min(len, seconds - 0.04 - t), vowel, cons, gap }); t += len + gap;
  }
  const out = new Float32Array(n);
  // resonator state
  const y1 = [0, 0, 0], y2 = [0, 0, 0], bw = [90, 110, 160], gain = [1, 0.55, 0.25];
  let phase = 0, si = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const tt = i / sr;
    while (si < syl.length - 1 && tt > syl[si]!.at + syl[si]!.len + syl[si]!.gap) si++;
    const s = syl[si];
    let src = 0, noise = 0, fm: [number, number, number] = FORMANTS.a!;
    if (s && tt >= s.at && tt < s.at + s.len) {
      const u = (tt - s.at) / s.len, consLen = s.cons ? 0.22 : 0;
      fm = FORMANTS[s.vowel] || FORMANTS.a!;
      if (u < consLen) {
        const k = u / consLen;
        if (s.cons === 's') noise = (rand() * 2 - 1) * 0.35 * Math.sin(k * Math.PI);
        else if (s.cons === 'f') noise = (rand() * 2 - 1) * 0.18 * Math.sin(k * Math.PI);
        else if (k > 0.75) noise = (rand() * 2 - 1) * 0.5 * (1 - (k - 0.75) * 4);                  // a pop at the end of a closure
      } else {
        const v = (u - consLen) / (1 - consLen), env = Math.min(1, v * 12) * Math.min(1, (1 - v) * 6);
        const f0 = pitch * (1 + 0.12 * Math.sin(tt * 2.3 + (o.seed ?? 1)) - 0.08 * v + 0.01 * Math.sin(tt * 31));
        phase += f0 / sr; if (phase >= 1) phase -= 1;
        src = (1 - 2 * phase) * env * 0.5;                                // a sawtooth buzz
      }
    } else phase = 0;
    let y = 0;
    for (let j = 0; j < 3; j++) {
      const f = fm[j]! * scale, r = Math.exp((-Math.PI * bw[j]!) / sr), a1 = 2 * r * Math.cos((2 * Math.PI * f) / sr), a2 = -r * r;
      const v = (1 - r) * src + a1 * y1[j]! + a2 * y2[j]!; y2[j] = y1[j]!; y1[j] = v; y += v * gain[j]!;
    }
    // hiss goes through a crude high-pass so it lands where sibilants live
    const hp = noise - lp; lp += (noise - lp) * 0.3;
    out[i] = y * 6 + hp;
  }
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0) for (let i = 0; i < n; i++) out[i] = (out[i]! / peak) * 0.8;
  return out;
}
