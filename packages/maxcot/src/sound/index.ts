// maxcot/sound: sound for films and scores. Synthesised effects (sfx), spoken
// lines (a babbling voice per actor, see maxcot/voice), and a mixer that lays
// them onto one track and writes a WAV. Plain samples throughout: no files,
// no dependencies, and the same result live and offline.
import { babble, pitchOf } from '../voice/babble.js';
import { SFX_LEN, isSfx, sfx } from './sfx.js';

export * from './sfx.js';
export * from './mix.js';

/** A spoken line: `len` seconds of babble in the speaker's voice. */
export interface SayLine { len: number; pitch?: number; seed?: number; vowels?: string }
/** One sound at `at` seconds: an effect by name, or a spoken line. */
export interface SoundClip { at: number; sfx?: string; say?: number | SayLine; gain?: number }

/** The spoken line of a clip, if it has one, with its length filled in. */
export function lineOf(c: SoundClip): SayLine | null {
  if (c.say == null) return null;
  const s = typeof c.say === 'number' ? { len: c.say } : c.say;
  return Object.assign({}, s, { len: Math.max(0.1, Math.min(30, Number(s.len) || 1)) });
}
/** How long a clip sounds, in seconds. */
export function clipLength(c: SoundClip): number {
  const line = lineOf(c); if (line) return line.len;
  return c.sfx && isSfx(c.sfx) ? SFX_LEN[c.sfx] : 0.3;
}
/** The samples a clip makes. `who` picks the voice for a spoken line. */
export function clipSamples(c: SoundClip, who = 'max', sampleRate = 22050, seed = 1): Float32Array {
  const line = lineOf(c);
  if (line) return babble({ seconds: line.len, sampleRate, pitch: pitchOf(who) * (line.pitch || 1), seed: line.seed ?? seed, vowels: line.vowels });
  return sfx(c.sfx || 'pop', { sampleRate, seed });
}
