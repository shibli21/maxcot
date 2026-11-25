import { describe, expect, it } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { Actor, setCanvasFactory, type CanvasLike } from 'maxcot';
import { LOOKS, SETS, Stage3D, drawFace, faceCanvas } from '../src/index';

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as CanvasLike);
const opaque = (c: CanvasLike) => { const d = (c as unknown as { getContext(k: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } }).getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]! > 0) n++; return n; };

describe('maxcot-3d', () => {
  it('draws the face front-on into a texture and finds the hands', () => {
    const a = new Actor(); a.pose('wave').snap();
    const { canvas, ctx } = faceCanvas(256, 256);
    const hands = drawFace(ctx, 256, 256, a.frame(1), { ink: '#000', fill: (p) => (p.fill === 'pupil' ? '#000' : p.fill === 'eyeWhite' ? '#fff' : null) });
    expect(opaque(canvas)).toBeGreaterThan(500);                 // eyes, brows, mouth
    expect(opaque(canvas)).toBeLessThan(256 * 256 * 0.6);        // but not the whole block
    expect(hands.L && hands.R).toBeTruthy();
    expect(Math.abs(hands.R!.x)).toBeGreaterThan(0.8);            // beside the body
  });
  it('a stage follows its cast and its actors follow their channels', () => {
    const max = new Actor({ who: 'max' }), kid = new Actor({ who: 'child' });
    const s = new Stage3D();
    s.sync([{ id: 'max', actor: max, x: -0.5, z: 0 }, { id: 'kid', actor: kid, x: 0.5, z: 0 }]).draw(1, 0);
    expect(s.actors.size).toBe(2);
    const a = s.actors.get('max')!;
    expect(a.root.position.x).toBeLessThan(0);
    const before = a.pivot.rotation.y;
    max.offsets = { twist: 0.4 }; s.draw(1, 0);
    expect(a.pivot.rotation.y).toBeGreaterThan(before + 0.3);
    s.sync([{ id: 'max', actor: max, x: 0, z: 0 }]);
    expect(s.actors.size).toBe(1);
  });
  it('the mouth on the face texture opens when the actor talks', () => {
    const a = new Actor(); const s = new Stage3D();
    s.sync([{ id: 'a', actor: a, x: 0, z: 0 }]).draw(1, 0);
    const shut = opaque(s.actors.get('a')!.faceCanvas.canvas);
    a.lips = { open: 1, round: 0, wide: 1, teeth: 0, level: 1 }; s.draw(1, 0);
    expect(opaque(s.actors.get('a')!.faceCanvas.canvas)).toBeGreaterThan(shut + 200);
  });
  it('every look and every set builds, and the camera frames the cast', () => {
    const a = new Actor(), s = new Stage3D();
    s.sync([{ id: 'a', actor: a, x: 0, z: 0 }]);
    for (const [look] of LOOKS) for (const [set] of SETS) { s.setLook(look).setSet(set).draw(1, 0); expect(s.actors.size).toBe(1); }
    s.shot('close', 'a', true); s.draw(1, 0); const near = s.camera.position.z;
    s.shot('wide', undefined, true); s.draw(1, 0);
    expect(s.camera.position.z).toBeGreaterThan(near);
  });
});
