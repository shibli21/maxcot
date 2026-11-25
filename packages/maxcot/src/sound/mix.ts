// mix.ts: lay sounds onto one track and write it out as a WAV file.
// Pure sample maths, so the same mix comes out in a browser, a worker or Node.

export interface Mixed { at: number; samples: Float32Array; sampleRate: number; gain?: number }

/** Add `samples` (at their own rate) into `into` (at `rate`) starting at `at` seconds, resampling linearly. */
export function mixInto(into: Float32Array, rate: number, m: Mixed): void {
  const g = m.gain ?? 1, ratio = m.sampleRate / rate, start = Math.round(m.at * rate);
  const n = Math.floor(m.samples.length / ratio);
  for (let i = Math.max(0, -start); i < n; i++) {
    const j = start + i; if (j >= into.length) break;
    const x = i * ratio, k = Math.floor(x), f = x - k, a = m.samples[k]!, b = k + 1 < m.samples.length ? m.samples[k + 1]! : 0;
    into[j] = into[j]! + (a + (b - a) * f) * g;
  }
}

/** Mix many sounds into a fresh mono track `seconds` long. */
export function mixdown(sounds: Mixed[], seconds: number, rate = 48000): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * rate));
  sounds.forEach((s) => mixInto(out, rate, s));
  return out;
}

/** 16-bit PCM WAV bytes from one or more channels of equal length. */
export function wav(channels: Float32Array[], rate: number): Uint8Array {
  const ch = channels.length, n = channels[0] ? channels[0].length : 0, dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
  let o = 0;
  const str = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
  const u32 = (v: number) => { dv.setUint32(o, v, true); o += 4; }, u16 = (v: number) => { dv.setUint16(o, v, true); o += 2; };
  str('RIFF'); u32(36 + n * ch * 2); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(rate); u32(rate * ch * 2); u16(ch * 2); u16(16); str('data'); u32(n * ch * 2);
  for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) { const s = Math.max(-1, Math.min(1, channels[k]![i]!)); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
  return new Uint8Array(dv.buffer);
}
