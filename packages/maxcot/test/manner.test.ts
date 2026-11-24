import { describe, expect, it } from 'vitest';
import { Actor, CAST, mannerOf } from '../src/index.js';

const settleTime = (who: string) => {
  const a = new Actor({ who }); a.pose('rest').snap(); a.pose('feel-excited');
  let t = 0; while (Math.abs(a.ch['mouth.open']! - a.to['mouth.open']!) > 0.02 && t < 5) { a.update(1 / 60); t += 1 / 60; }
  return t;
};

describe('manner', () => {
  it('leaves Max moving exactly as before', () => {
    const a = new Actor();
    expect(a.stiff).toBe(15);
    expect(a.damp).toBeCloseTo(0.68, 10);
    expect(a.manner).toEqual({ weight: 0.5, idle: 'none', gaze: 'steady', rest: 'rest' });
  });
  it('gives every actor a manner, and heavy actors move slower than light ones', () => {
    for (const k of Object.keys(CAST)) expect(CAST[k]!.manner.weight).toBeGreaterThanOrEqual(0);
    expect(settleTime('boss')).toBeGreaterThan(settleTime('child'));
  });
  it('starts an actor in its rest pose', () => {
    expect(new Actor({ who: 'boss' }).disc.handL).toBe('fist');     // the boss rests with hands on hips
    expect(new Actor({ who: 'max' }).poseName).toBe('rest');
  });
  it('recasting swaps the manner, and the rest pose if the actor was resting', () => {
    const a = new Actor({ who: 'boss' });
    a.cast('clerk');
    expect(a.manner.idle).toBe('fidget');
    expect(a.poseName).toBe('rub');
    const b = new Actor({ who: 'boss' }).pose('wave');
    b.cast('clerk');
    expect(b.poseName).toBe('wave');                                 // a deliberate pose is kept
  });
  it('idle and gaze habits change the frame over time', () => {
    const kid = new Actor({ who: 'child' }), looks = new Set<number>();
    for (let t = 0; t < 5; t += 0.45) looks.add(Math.round(kid.frame(t).C['eyes.lookX']! * 100));
    expect(looks.size).toBeGreaterThan(2);                            // darting eyes
    const clerk = new Actor({ who: 'clerk' });
    expect(clerk.frame(1).C['handR.rot']).not.toBeCloseTo(clerk.frame(2.3).C['handR.rot']!, 3);
  });
  it('an explicit gaze beats the habit', () => {
    const kid = new Actor({ who: 'child' }); kid.gaze = 'us';
    expect(Math.abs(kid.frame(1).C['eyes.lookX']!)).toBeLessThan(0.3);
  });
  it('setManner overrides part of it', () => {
    const a = new Actor().setManner({ weight: 1 });
    expect(a.stiff).toBeLessThan(15); expect(a.damp).toBeGreaterThan(0.68);
    expect(mannerOf('max').weight).toBe(0.5);                         // the cast table is untouched
  });
});
