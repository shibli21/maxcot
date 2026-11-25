import { describe, expect, it, afterEach } from 'vitest';
import { createCanvas } from '@napi-rs/canvas';
import { Fx, applyFx, setCanvasFactory, type CanvasLike, type Ctx2D } from '../src/index';

setCanvasFactory((w, h) => createCanvas(w, h) as unknown as CanvasLike);
function scene() {
  const c = createCanvas(64, 48), ctx = c.getContext('2d') as unknown as Ctx2D;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 48); ctx.fillStyle = '#fff'; ctx.fillRect(28, 0, 8, 48);
  return { c, ctx, px: () => Array.from(c.getContext('2d').getImageData(0, 0, 64, 48).data) };
}
afterEach(() => { Fx.enabled = true; });

describe('effects layer', () => {
  it('runs the Canvas 2D version where there is no WebGL', () => {
    const s = scene(), before = s.px();
    expect(applyFx(s.ctx, [{ type: 'blur', radius: 2 }], { t: 0, key: 'a', seed: 1 })).toBe('2d');
    expect(s.px()).not.toEqual(before);
    expect(Fx.last).toBe('2d');
  });
  it('does nothing when switched off or given no passes', () => {
    const s = scene(), before = s.px();
    Fx.enabled = false;
    expect(applyFx(s.ctx, [{ type: 'bloom' }], { t: 0, key: 'b', seed: 1 })).toBe('off');
    Fx.enabled = true;
    expect(applyFx(s.ctx, [], { t: 0, key: 'b', seed: 1 })).toBe('off');
    expect(s.px()).toEqual(before);
  });
  it('feedback remembers the last frame per key', () => {
    const a = scene(); applyFx(a.ctx, [{ type: 'feedback', amount: 1, zoom: 1.2 }], { t: 0, key: 'fb', seed: 1 });
    const b = scene(), fresh = b.px();
    applyFx(b.ctx, [{ type: 'feedback', amount: 1, zoom: 1.2 }], { t: 0.1, key: 'fb', seed: 2 });
    expect(b.px()).not.toEqual(fresh);                     // the zoomed last frame shows through
  });
  it('glitch tears the same way for the same seed', () => {
    const a = scene(), b = scene();
    applyFx(a.ctx, [{ type: 'glitch', amount: 1 }], { t: 0, key: 'g1', seed: 5 });
    applyFx(b.ctx, [{ type: 'glitch', amount: 1 }], { t: 0, key: 'g2', seed: 5 });
    expect(a.px()).toEqual(b.px());
  });
});
