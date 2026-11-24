import { describe, expect, it } from 'vitest';
import { Actor } from '../src/index';
import { analyze, babble, lipTrack, lipsAt, LipSmoother, pitchOf, QUIET, fft } from '../src/voice/index';

const SR = 22050;
/** The middle of a held vowel. */
function vowel(v: string, pitch = 150) {
  const s = babble({ vowels: v, pure: true, seconds: 1, pitch, rate: 1.2 });
  return analyze(s.subarray(9000, 11048), SR);
}

describe('voice', () => {
  it('fft finds a pure tone', () => {
    const n = 256, re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 8 * i) / n);
    fft(re, im);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]!)).slice(0, n / 2);
    expect(mag.indexOf(Math.max(...mag))).toBe(8);
  });
  it('silence keeps the mouth shut', () => {
    expect(analyze(new Float32Array(2048), SR)).toEqual(QUIET);
    const hum = Float32Array.from({ length: 2048 }, (_, i) => 0.001 * Math.sin(i * 0.1));
    expect(analyze(hum, SR).open).toBe(0);
  });
  it('reads open, round and wide vowels', () => {
    for (const pitch of [110, 150, 290]) {
      const a = vowel('a', pitch), i = vowel('i', pitch), u = vowel('u', pitch);
      expect(a.open).toBeGreaterThan(i.open + 0.3);
      expect(a.open).toBeGreaterThan(u.open + 0.3);
      expect(u.round).toBeGreaterThan(0.6);
      expect(i.round).toBeLessThan(0.2);
      expect(i.wide).toBeGreaterThan(1.15);
      expect(u.wide).toBeLessThan(0.7);
    }
  });
  it('louder opens wider', () => {
    const s = babble({ vowels: 'a', pure: true, seconds: 1, rate: 1.2 }).subarray(9000, 11048);
    const soft = analyze(s.map((x) => x * 0.03), SR), loud = analyze(s, SR);
    expect(loud.level).toBeGreaterThan(soft.level);
    expect(loud.open).toBeGreaterThan(soft.open);
  });
  it('babble is deterministic and varies by seed', () => {
    const a = babble({ seconds: 1, seed: 4 }), b = babble({ seconds: 1, seed: 4 }), c = babble({ seconds: 1, seed: 5 });
    expect(Array.from(a.subarray(5000, 5100))).toEqual(Array.from(b.subarray(5000, 5100)));
    expect(Array.from(a.subarray(5000, 5100))).not.toEqual(Array.from(c.subarray(5000, 5100)));
    expect(Math.max(...Array.from(a, Math.abs))).toBeLessThanOrEqual(0.8001);
  });
  it('a track moves the mouth while there is sound, and is silent outside it', () => {
    const s = babble({ seconds: 2, seed: 2 }), track = lipTrack(s, SR, 60);
    expect(track).toHaveLength(120);
    const opens = track.map((l) => l.open);
    expect(Math.max(...opens)).toBeGreaterThan(0.4);
    expect(Math.min(...opens)).toBeLessThan(0.1);
    expect(lipsAt(track, 60, -1)).toEqual(QUIET);
    expect(lipsAt(track, 60, 5)).toEqual(QUIET);
    const mid = lipsAt(track, 60, 1.0);
    expect(mid.open).toBeGreaterThanOrEqual(0);
  });
  it('the smoother opens fast and closes slower', () => {
    const sm = new LipSmoother(), on = { open: 1, round: 0, wide: 1, teeth: 0, level: 1 };
    const up = sm.push(on, 1 / 60).open;
    for (let i = 0; i < 30; i++) sm.push(on, 1 / 60);
    const down = 1 - sm.push(QUIET, 1 / 60).open;
    expect(up).toBeGreaterThan(down);
  });
  it('an actor speaks over its pose', () => {
    const a = new Actor({ who: 'max' }); a.pose('mouth-smile').snap();
    expect(a.frame(1).C['mouth.open']).toBeCloseTo(0, 3);
    a.lips = { open: 0.8, round: 1, wide: 0.5, teeth: 0, level: 1 };
    const C = a.frame(1).C;
    expect(C['mouth.open']).toBeGreaterThan(0.8);
    expect(C['mouth.round']).toBeCloseTo(1, 3);
    expect(C['mouth.smile']).toBeCloseTo(1, 3);
    a.lips = null;
    expect(a.frame(1).C['mouth.open']).toBeCloseTo(0, 3);
  });
  it('every built-in actor has a voice', () => {
    expect(pitchOf('child')).toBeGreaterThan(pitchOf('boss'));
    expect(pitchOf('someone-new')).toBeGreaterThan(0);
  });
});
