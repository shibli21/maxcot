import { createCanvas } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { Actor, Stage, render, setCanvasFactory, type CanvasLike, type Ctx2D } from '../src/index.js';
import { allSkins, pencil } from '../src/skins/index.js';

const W = 480, H = 300;
const canvas = () => createCanvas(W, H) as unknown as CanvasLike;
const stageOf = (cast: Array<{ id: string; who?: string; x?: number; z?: number; pose?: string }>) => new Stage(canvas(), { skin: pencil, cast, autoplay: false, key: 's' + Math.random() });
const pixels = (c: CanvasLike) => (c.getContext('2d') as unknown as Ctx2D).getImageData(0, 0, W, H).data;

describe('Stage', () => {
  beforeAll(() => setCanvasFactory((w, h) => createCanvas(w, h)));

  it('a cast of one looks exactly like a lone character', () => {
    const st = stageOf([{ id: 'max', pose: 'wave' }]);
    st.draw(1, true);
    const solo = canvas(), a = new Actor().pose('wave').snap();
    a.t = st.get('max').t;
    render(solo.getContext('2d') as unknown as Ctx2D, W, H, a.frame(), { skin: pencil, t: 1, key: st.key });
    expect(Buffer.from(pixels(st.canvas)).equals(Buffer.from(pixels(solo)))).toBe(true);
  });

  it('merges the cast into one scene, far actors first', () => {
    const st = stageOf([{ id: 'max' }, { id: 'kid', who: 'child', z: 1 }]);
    st.draw(1, true);
    const S = st.S!;
    expect(S.actors).toHaveLength(2);
    expect(new Set(S.parts.map((p) => p.actor))).toEqual(new Set([0, 1]));
    const firstBody = S.parts.findIndex((p) => p.role === 'front');
    expect(S.parts[firstBody]!.actor).toBe(0);          // actor 0 in the merge is the far one (the kid)
    expect(S.parts.slice(0, 2).every((p) => p.role === 'shadow')).toBe(true);
  });

  it('a wide shot keeps everyone in frame; a close shot finds one actor', () => {
    const st = stageOf([{ id: 'max' }, { id: 'kid', who: 'child' }, { id: 'boss', who: 'boss' }]);
    st.draw(1, true);
    for (const A of st.S!.actors!) {
      expect(A.body.x).toBeGreaterThan(0); expect(A.body.x + A.body.w).toBeLessThan(W);
    }
    st.shot('close', 'kid', true); st.draw(2, true);
    const kid = st.S!.actors!.find((A) => A.F.who === 'child')!;
    expect(Math.abs(kid.body.cx - W / 2)).toBeLessThan(W * 0.1);
    expect(kid.unit).toBeGreaterThan(st.S!.actors!.find((A) => A.F.who === 'max')!.unit * 0.99);
  });

  it('actors can look at each other', () => {
    const st = stageOf([{ id: 'max', x: -1 }, { id: 'kid', who: 'child', x: 1 }]);
    st.look('kid', 'max').look('max', 'kid');
    st.draw(1, true);
    const [maxScene, kidScene] = ['max', 'child'].map((w) => st.S!.actors!.find((A) => A.F.who === w)!);
    expect(kidScene!.F.C['eyes.lookX']).toBeLessThan(0);   // Max is to the kid's left
    expect(maxScene!.F.C['eyes.lookX']).toBeGreaterThan(0);
  });

  it('eases the camera to a new shot unless cut', () => {
    const st = stageOf([{ id: 'max' }, { id: 'kid', who: 'child' }]);
    st.step(0.016);
    const before = st.S!.actors![0]!.unit;
    st.shot('close', 'max');
    st.step(0.016);
    const after = st.S!.actors!.find((A) => A.F.who === 'max')!.unit;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(before * 2);                // moving, not there yet
  });

  it('rejects a duplicate id and forgets looks at removed actors', () => {
    const st = stageOf([{ id: 'max' }, { id: 'kid', who: 'child' }]);
    expect(() => st.add({ id: 'max' })).toThrow(/already/);
    st.look('max', 'kid'); st.remove('kid');
    expect(st.member('max').lookAt).toBeNull();
  });

  it('every skin paints a cast of two', () => {
    for (const skin of allSkins) {
      const st = new Stage(canvas(), { skin, palette: 'cyan', autoplay: false, key: 'two-' + skin.name, cast: [{ id: 'max', pose: 'wave' }, { id: 'kid', who: 'child', pose: 'feel-happy' }] });
      expect(() => st.draw(1, true), skin.name).not.toThrow();
      expect(st.S!.actors).toHaveLength(2);
    }
  });
});

describe('Stage.pick', () => {
  it('finds the actor under a point, or nobody', () => {
    setCanvasFactory((w, h) => createCanvas(w, h));
    const st = stageOf([{ id: 'max', x: -1 }, { id: 'kid', who: 'child', x: 1 }]);
    st.draw(1, true);
    const kid = st.S!.actors!.find((A) => A.F.who === 'child')!.body;
    expect(st.pick(kid.cx, kid.cy)).toBe('kid');
    expect(st.pick(2, 2)).toBeNull();
  });
});
