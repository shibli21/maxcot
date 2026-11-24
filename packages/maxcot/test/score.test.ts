import { describe, expect, it } from 'vitest';
import { createConductor, parseScore } from '../src/score/index.js';

describe('parseScore', () => {
  it('reads the hand-written syntax: comments, unquoted keys, quotes, trailing commas', () => {
    const r = parseScore(`
      // a tiny score
      {
        title: 'Hi', bpm: 120,
        events: [
          { at: [1, 1], pose: 'wave' },   /* first */
          { at: [2, 1.5], "style": "riso", palette: 'cyan', },
        ],
      }`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.score.title).toBe('Hi');
    expect(r.score.bpm).toBe(120);
    expect(r.score.events).toEqual([{ at: [1, 1], pose: 'wave' }, { at: [2, 1.5], style: 'riso', palette: 'cyan' }]);
    expect(r.lines).toEqual([5, 6]);
  });
  it('accepts a bare list of events', () => {
    const r = parseScore(`[{ at: [1, 1], pose: 'wave' }]`);
    expect(r.ok && r.score.events.length).toBe(1);
  });
  it('points at the line and column of a mistake', () => {
    const r = parseScore(`{ events: [\n  { at: [1, 1], pose: 'wave' }\n  { at: [2, 1], pose: 'shrug' }\n] }`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.line).toBe(3);
    expect(r.error.message).toMatch(/Missing `,` before this item/);
  });
  it('never evaluates code', () => {
    for (const src of [`[{ at: [1, 1], pose: alert(1) }]`, `[{ at: [1, 1], pose: fetch }]`, `{ events: [], __proto__: { x: 1 } }`]) {
      const r = parseScore(src);
      expect(r.ok).toBe(false);
    }
  });
  it('explains a bare name, which used to be allowed', () => {
    const r = parseScore(`[{ at: [2, 1], create: max }]`);
    expect(!r.ok && r.error.message).toMatch(/Did you mean the text 'max'/);
  });
  it('checks the shape of each event', () => {
    expect(parseScore(`[{ pose: 'wave' }]`).ok).toBe(false);
    expect(parseScore(`[{ at: [0, 1], pose: 'wave' }]`).ok).toBe(false);
    expect(parseScore(`[{ at: [1, 1] }]`).ok).toBe(false);
    expect(parseScore(`{ bpm: 'fast', events: [] }`).ok).toBe(false);
  });
});

describe('conductor.load', () => {
  it('swaps events and tempo, keeping the playhead, and replays the new state', () => {
    const log: unknown[] = [];
    const c = createConductor({ bpm: 60, tail: 5, events: [{ at: [1, 1], pose: 'a' }], onCommand: (cmd, v) => log.push(v), onReset: () => log.push('reset') });
    c.seek(3);
    log.length = 0;
    c.load([{ at: [1, 1], pose: 'b' }, { at: [1, 2], pose: 'c' }, { at: [2, 1], pose: 'd' }], { bpm: 120 });
    expect(c.bpm).toBe(120);
    expect(c.songT).toBe(3);                // the playhead stays put
    expect(c.total).toBe(2 + 5);            // [2, 1] at 120 bpm is 2 s, plus the tail
    expect(log).toEqual(['reset', 'b', 'c', 'd']);
  });
});

describe('parseScore messages', () => {
  it('names a missing comma between two fields', () => {
    const r = parseScore(`[{ at: [1, 1] pose: 'wave' }]`);
    expect(!r.ok && r.error.message).toMatch(/Missing `,` before `pose`/);
  });
});
