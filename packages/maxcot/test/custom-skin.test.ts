import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { Actor, kit as K, render, setCanvasFactory, type Ctx2D, type Skin } from '../src/index.js';

// The "write your own skin" example from the README, verbatim.
const blueprint: Skin = {
  name: 'blueprint', label: 'Blueprint', group: 'drawn', about: 'White lines on blueprint paper.',
  fps: 12, hold: 'skin',
  ground: { css: '#1d4e89' },
  draw(S, ctx) {
    K.toon(S, ctx, {
      ink: '#e8f1ff', lw: 0.006,
      fill: (p) => (p.fill === 'pupil' || p.fill === 'brow' ? '#e8f1ff' : null)
    });
  }
};

describe('a custom skin', () => {
  it('renders with the shared toon renderer', () => {
    setCanvasFactory((w, h) => createCanvas(w, h));
    const c = createCanvas(200, 160);
    const a = new Actor({ who: 'boss' }).pose('deal').snap();
    const S = render(c.getContext('2d') as unknown as Ctx2D, 200, 160, a.frame(1), { skin: blueprint });
    expect(S.style).toBe('blueprint');
    const px = c.getContext('2d').getImageData(100, 80, 1, 1).data;
    expect([px[0], px[1], px[2]]).not.toEqual([0, 0, 0]);
  });
});
