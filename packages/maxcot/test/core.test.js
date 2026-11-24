import { describe, expect, it } from 'vitest';
import { Actor, CAST, DESIGN, DESIGN_DEFAULTS, POSES, POSE_SECTIONS, camera, resolveDesign, resolvePose, scene } from '../src/index.js';
import { createConductor } from '../src/score/index.js';
import { allSkins, skinsByName } from '../src/skins/index.js';

describe('design', () => {
  it('has a default for every dial, inside its range', () => {
    for (const [key, , , , min, max, def] of DESIGN) {
      expect(DESIGN_DEFAULTS[key]).toBe(def);
      expect(def).toBeGreaterThanOrEqual(min);
      expect(def).toBeLessThanOrEqual(max);
    }
  });
  it('layers a cast member over the defaults', () => {
    const boss = resolveDesign('boss');
    expect(boss['body.w']).toBe(CAST.boss.values['body.w']);
    expect(boss['eyes.lash']).toBe(DESIGN_DEFAULTS['eyes.lash']);
  });
  it('falls back to max for an unknown actor', () => {
    expect(resolveDesign('nobody')).toEqual(resolveDesign('max'));
  });
});

describe('poses', () => {
  it('lists every pose in exactly one panel section', () => {
    const listed = Object.values(POSE_SECTIONS).flat();
    expect(new Set(listed).size).toBe(listed.length);
    for (const name of listed) expect(POSES[name]).toBeDefined();
  });
  it('composes a feeling from body, eyes and mouth', () => {
    const { layer, values } = resolvePose('feel-crying');
    expect(layer).toBe('all');
    expect(values.eyeMode).toBe('shut');
    expect(values['fx.tears']).toBe(1);
    expect(values.nod).toBeLessThan(0);
  });
  it('a hands-layer pose leaves the face alone', () => {
    const a = new Actor();
    a.pose('feel-furious').snap();
    const brow = a.ch['brows.angle.L'];
    a.pose('thumbsup').snap();
    expect(a.ch['brows.angle.L']).toBe(brow);
    expect(a.disc.handR).toBe('thumbsup');
  });
});

describe('actor springs', () => {
  it('settles on the target', () => {
    const a = new Actor();
    a.pose('laughing');
    for (let i = 0; i < 200; i++) a.update(1 / 60);
    expect(a.ch['mouth.open']).toBeCloseTo(a.to['mouth.open'], 3);
  });
  it('morphs the design toward a new cast member', () => {
    const a = new Actor();
    a.cast('oldman');
    for (let i = 0; i < 120; i++) a.update(1 / 60);
    expect(a.design['body.h']).toBeCloseTo(CAST.oldman.values['body.h'], 2);
  });
});

describe('conductor', () => {
  const events = [{ at: [1, 1], a: 1 }, { at: [1, 3], b: 2 }, { at: [2, 1], a: 3, palette: 'x' }];
  const make = (log) => createConductor({
    bpm: 60, events, modifiers: ['at', 'palette'],
    onCommand: (cmd, v, e, ctx) => log.push([cmd, v, ctx.instant]),
    onReset: () => log.push(['reset'])
  });
  it('converts bars and beats to seconds', () => {
    const c = make([]);
    expect(c.timeOf([2, 1])).toBe(4);
    expect(c.timeOf([1, 2.5])).toBe(1.5);
    expect(c.barBeat(5.5)).toEqual([2, 2.5]);
  });
  it('fires commands on time, skipping modifiers', () => {
    const log = []; const c = make(log);
    c.play(); c.tick(0.5); c.tick(1.6);
    expect(log).toEqual([['a', 1, false], ['b', 2, false]]);
    c.tick(2);
    expect(log.at(-1)).toEqual(['a', 3, false]);
  });
  it('seeks by resetting and replaying instantly', () => {
    const log = []; const c = make(log);
    c.seek(2.5);
    expect(log).toEqual([['reset'], ['a', 1, true], ['b', 2, true]]);
    expect(c.songT).toBe(2.5);
  });
});

describe('scene', () => {
  const build = (who, pose) => {
    const a = new Actor({ who }); a.pose(pose).snap();
    const F = a.frame(1);
    return scene(F, { w: 800, h: 600, cam: camera(F.P, 800, 600, 'full') });
  };
  it('produces a visible front face and a silhouette', () => {
    const S = build('max', 'rest');
    const front = S.parts.find((p) => p.role === 'front');
    expect(front.pts.length).toBeGreaterThan(8);
    const area = front.pts.reduce((s, p, i, a) => s + p[0] * a[(i + 1) % a.length][1] - a[(i + 1) % a.length][0] * p[1], 0) / 2;
    expect(area).toBeLessThan(0);
    expect(S.sil.length).toBeGreaterThan(3);
  });
  it('keeps the figure inside the frame for every actor', () => {
    for (const who of Object.keys(CAST)) {
      const b = build(who, 'rest').body;
      expect(b.x).toBeGreaterThan(0); expect(b.y).toBeGreaterThan(0);
      expect(b.x + b.w).toBeLessThan(800); expect(b.y + b.h).toBeLessThan(600);
    }
  });
  it('draws two eyes when open and eye lines when shut', () => {
    expect(build('max', 'rest').parts.filter((p) => p.role === 'eye')).toHaveLength(2);
    expect(build('max', 'eyes-shut-tight').parts.filter((p) => p.role === 'eye-line')).toHaveLength(2);
  });
});

describe('skins', () => {
  it('exports 26 uniquely named skins in five groups', () => {
    expect(allSkins).toHaveLength(26);
    expect(Object.keys(skinsByName())).toHaveLength(26);
    expect(new Set(allSkins.map((s) => s.group))).toEqual(new Set(['drawn', 'print', 'screens', 'signal', 'time']));
    for (const s of allSkins) { expect(typeof s.draw).toBe('function'); expect(s.label).toBeTruthy(); }
  });
});
