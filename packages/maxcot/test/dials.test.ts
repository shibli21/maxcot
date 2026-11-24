import { describe, expect, it } from 'vitest';
import { Actor, CAST, DESIGN, camera, scene } from '../src/index.js';

const sceneWith = (vals: Record<string, number>, pose = 'rest') => {
  const a = new Actor(); for (const k in vals) a.set(k, vals[k]!); a.pose(pose).snap();
  const F = a.frame(1);
  return scene(F, { w: 400, h: 300, cam: camera(F.P, 400, 300, 'full') });
};
const roles = (vals: Record<string, number>, pose?: string) => sceneWith(vals, pose).parts.map((p) => p.role);
const sig = (vals: Record<string, number>, pose?: string) => JSON.stringify(sceneWith(vals, pose).parts.map((p) => p.pts.map((q) => q.map((n) => Math.round(n * 10)))));

describe('design dials', () => {
  it('every new dial defaults to the old look', () => {
    const fresh = ['body.curl', 'eyes.style', 'eyes.iris', 'eyes.bow', 'eyes.flat', 'eyes.taper', 'eyes.slide', 'brows.style', 'teeth.style', 'mouth.tip', 'mouth.roll'];
    const zero: Record<string, number> = {}; fresh.forEach((k) => { zero[k] = 0; });
    expect(sig(zero)).toBe(sig({}));
    for (const k of fresh) expect(DESIGN.find((r) => r[0] === k)![6]).toBe(0);
  });
  it('each dial changes the drawing', () => {
    const base = sig({}), open = sig({}, 'mouth-happy');
    for (const [k, v] of [['eyes.bow', 1], ['eyes.flat', 1], ['eyes.taper', 1], ['eyes.slide', 1], ['mouth.tip', 1], ['eyes.style', 2], ['eyes.style', 3]] as const) expect(sig({ [k]: v }), k).not.toBe(base);
    for (const t of [1, 2, 3]) expect(sig({ 'teeth.style': t }, 'mouth-happy'), 'teeth ' + t).not.toBe(open);
  });
  it('adds and removes parts as the kinds say', () => {
    expect(roles({ 'eyes.style': 1 })).not.toContain('eye');            // dot eyes have no white
    expect(roles({ 'eyes.iris': 1 })).toContain('iris');
    expect(roles({ 'brows.style': 3 })).not.toContain('brow');
    expect(roles({ 'body.curl': 0.8 })).toContain('curl');
    expect(roles({ 'mouth.roll': 0.8 })).toContain('lip');
    expect(roles({ 'teeth.style': 1 }, 'mouth-happy')).toContain('teeth-line');
    expect(roles({ 'teeth.style': 3 }, 'mouth-happy').filter((r) => r === 'teeth')).toHaveLength(2);
  });
  it('kind dials switch outright instead of morphing', () => {
    const a = new Actor(); a.set('eyes.style', 2); a.update(1 / 60);
    expect(a.design['eyes.style']).toBe(2);
    a.set('eyes.size', 0.3); a.update(1 / 60);
    expect(a.design['eyes.size']).toBeLessThan(0.3);                      // ordinary dials still morph
  });
  it('the grandmother uses them', () => {
    expect(CAST.grandma!.values['eyes.style']).toBe(2);
    expect(CAST.grandma!.values['body.curl']).toBeGreaterThan(0);
  });
});
