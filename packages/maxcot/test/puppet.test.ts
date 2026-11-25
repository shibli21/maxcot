import { describe, expect, it } from 'vitest';
import { Actor } from '../src/index';
import { DEFAULT_BANK, Puppet } from '../src/puppet/index';

const settle = (p: Puppet, n = 60) => { for (let i = 0; i < n; i++) p.update(1 / 60); };
const pad = (axes: number[], pressed: number[] = [], values: Record<number, number> = {}) =>
  [axes, Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: values[i] ?? (pressed.includes(i) ? 1 : 0) }))] as const;

describe('puppet', () => {
  it('the pointer steers gaze and head, the button opens the mouth', () => {
    const a = new Actor(), p = new Puppet({ target: a });
    p.point(1, -1); p.button(true); settle(p);
    const C = a.frame(1).C;
    expect(C['eyes.lookX']).toBeGreaterThan(0.8);
    expect(C['eyes.lookY']).toBeLessThan(-0.5);
    expect(C.twist).toBeGreaterThan(0.25);
    expect(C['mouth.open']).toBeGreaterThan(0.7);
    p.button(false); p.point(0, 0); settle(p, 120);
    expect(a.frame(1).C['mouth.open']).toBeLessThan(0.05);
  });
  it('number keys strike the bank, 0 goes back to rest, and every pose is reported', () => {
    const a = new Actor(), p = new Puppet({ target: a }), seen: string[] = [];
    p.onPose = (n) => seen.push(n);
    expect(p.key('Digit1', true)).toBe(true); p.key('Digit1', true);   // held: fires once
    p.key('Digit1', false); p.key('Numpad3', true); p.key('Digit0', true);
    expect(seen).toEqual([DEFAULT_BANK[0], DEFAULT_BANK[2], 'rest']);
    expect(a.poseName).toBe('rest');
    expect(p.key('KeyZ', true)).toBe(false);
  });
  it('W hops, S squashes, A and D ask the host to step', () => {
    const a = new Actor(), p = new Puppet({ target: a }), steps: number[] = [];
    p.onStep = (d) => steps.push(d);
    p.key('KeyA', true); p.key('KeyA', false); p.key('KeyD', true);
    expect(steps).toEqual([-1, 1]);
    p.key('KeyW', true); for (let i = 0; i < 12; i++) p.update(1 / 60);
    expect(a.offsets!.y).toBeGreaterThan(0.1);
    settle(p); expect(a.offsets!.y).toBe(0);
    p.key('KeyS', true); settle(p); expect(a.offsets!.squash).toBeGreaterThan(0.3);
  });
  it('a gamepad: sticks, triggers, face buttons on the bank, and an idle pad leaves the mouse alone', () => {
    const a = new Actor(), p = new Puppet({ target: a }), seen: string[] = [];
    p.onPose = (n) => seen.push(n);
    p.point(0.8, 0); p.pad(...pad([0.05, 0, 0, 0])); settle(p);       // inside the dead zone
    expect(p.now.x).toBeGreaterThan(0.7);
    p.pad(...pad([-1, 0, 0, 1], [], { 7: 1 })); settle(p);
    expect(p.now.x).toBeLessThan(-0.9); expect(p.now.mouth).toBeGreaterThan(0.9); expect(a.offsets!['handR.y']).toBeLessThan(-0.25);
    p.pad(...pad([0, 0, 0, 0], [1])); p.pad(...pad([0, 0, 0, 0], [1])); p.pad(...pad([0, 0, 0, 0], [3]));
    expect(seen).toEqual([DEFAULT_BANK[1], DEFAULT_BANK[3]]);
  });
  it('attaching another actor lets the first one go', () => {
    const a = new Actor(), b = new Actor(), p = new Puppet({ target: a });
    p.point(1, 0); settle(p, 5); expect(a.offsets).not.toBeNull();
    p.attach(b); expect(a.offsets).toBeNull(); settle(p, 5); expect(b.offsets).not.toBeNull();
  });
});
