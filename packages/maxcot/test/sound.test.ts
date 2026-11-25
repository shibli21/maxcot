import { describe, expect, it } from 'vitest';
import { Player, type Film } from '../src/film/index';
import { SFX, SFX_LEN, clipLength, clipSamples, lineOf, mixInto, mixdown, sfx, wav } from '../src/sound/index';

const film = (sound: Film['tracks']['sound']): Film => ({
  title: 't', actor: { key: 'max', label: 'Max' },
  shots: [{ id: 'a', from: 0, len: 4, camera: { frame: 'full' }, beats: [] }],
  tracks: { who: [{ from: 0, to: 4, who: 'boss' }], sound }
});

describe('sound', () => {
  it('every effect is synthesised to its length, deterministically, and not too loud', () => {
    for (const name of SFX) {
      const a = sfx(name, { sampleRate: 22050 }), b = sfx(name, { sampleRate: 22050 });
      expect(a.length).toBe(Math.ceil(SFX_LEN[name] * 22050));
      expect(Array.from(a.subarray(0, 400))).toEqual(Array.from(b.subarray(0, 400)));
      const peak = Math.max(...Array.from(a, Math.abs));
      expect(peak).toBeGreaterThan(0.5); expect(peak).toBeLessThanOrEqual(0.7001);
      expect(a.every(Number.isFinite)).toBe(true);
    }
    expect(sfx('no-such-thing').length).toBe(sfx('pop').length);
  });
  it('clips know their length and their voice', () => {
    expect(clipLength({ at: 0, sfx: 'ding' })).toBe(SFX_LEN.ding);
    expect(clipLength({ at: 0, say: 1.5 })).toBe(1.5);
    expect(lineOf({ at: 0, say: { len: 99 } })!.len).toBe(30);
    expect(clipSamples({ at: 0, say: 1 }, 'child', 22050).length).toBe(22050);
    const low = clipSamples({ at: 0, say: { len: 1, vowels: 'a' } }, 'boss'), high = clipSamples({ at: 0, say: { len: 1, vowels: 'a' } }, 'child');
    const crossings = (s: Float32Array) => { let n = 0; for (let i = 1; i < s.length; i++) if ((s[i - 1]! < 0) !== (s[i]! < 0)) n++; return n; };
    expect(crossings(high)).toBeGreaterThan(crossings(low));
  });
  it('mixes at the right time and rate, and writes a WAV', () => {
    const into = new Float32Array(100), one = new Float32Array(10).fill(1);
    mixInto(into, 100, { at: 0.5, samples: one, sampleRate: 50, gain: 0.5 });
    expect(into[49]).toBe(0); expect(into[50]).toBeCloseTo(0.5); expect(into[68]).toBeCloseTo(0.5); expect(into[71]).toBe(0);
    const m = mixdown([{ at: 0, samples: one, sampleRate: 100 }, { at: 0, samples: one, sampleRate: 100 }], 0.2, 100);
    expect(m[3]).toBe(2);
    const w = wav([m, m], 100);
    expect(String.fromCharCode(...w.subarray(0, 4))).toBe('RIFF');
    expect(w.length).toBe(44 + 20 * 2 * 2);
  });
  it('a film speaks its lines through whoever plays the part, and cues its sounds once', () => {
    const cues: Array<[string, number]> = [];
    const p = new Player(film([{ at: 0.5, say: 1 }, { at: 2, sfx: 'boing' }, { at: 0, sfx: 'pop' }]), { onSound: (c, _i, off) => cues.push([c.sfx || 'line', off]) });
    expect(p.actor.lips).toBeNull();
    p.playing = true;
    for (let i = 0; i < 40; i++) p.update(1 / 30);                 // to 1.33 s
    expect(p.lineAt(p.t)).not.toBeNull();
    expect(p.actor.lips).not.toBeNull();
    for (let i = 0; i < 35; i++) p.update(1 / 30);                 // to 2.5 s
    expect(p.actor.lips).toBeNull();
    expect(cues.map((c) => c[0])).toEqual(['pop', 'line', 'boing']);
    cues.forEach((c) => expect(c[1]).toBeLessThan(1 / 30 + 1e-9));
    p.seek(0.8); expect(p.actor.lips).not.toBeNull();                // a seek lands mid-line
  });
  it('a film without a sound track is silent', () => {
    const p = new Player(film(undefined)); p.playing = true; p.update(0.5);
    expect(p.sounds()).toEqual([]); expect(p.actor.lips).toBeNull();
  });
});
