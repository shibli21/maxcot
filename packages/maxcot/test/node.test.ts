import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { Actor, render, setCanvasFactory } from '../src/index.js';
import { allSkins } from '../src/skins/index.js';
import type { CanvasLike, Ctx2D } from '../src/types.js';

// The renderer runs outside the browser once you hand it a canvas factory.
describe('rendering in Node', () => {
  setCanvasFactory((w, h) => createCanvas(w, h) as unknown as CanvasLike);
  for (const skin of allSkins) {
    it(`draws ${skin.name}`, () => {
      const c = createCanvas(160, 130), ctx = c.getContext('2d') as unknown as Ctx2D;
      const a = new Actor(); a.pose('feel-happy').snap();
      const S = render(ctx, 160, 130, a.frame(1), { skin, palette: 'cyan', t: 1, key: 'node-' + skin.name });
      expect(S.parts.length).toBeGreaterThan(10);
      // something other than the background was drawn
      const px = c.getContext('2d').getImageData(0, 0, 160, 130).data;
      const colours = new Set<number>(); for (let i = 0; i < px.length; i += 16) colours.add((px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!);
      expect(colours.size).toBeGreaterThan(skin.name === 'gameboy' ? 3 : 8);   // the handheld has four greens
    });
  }
});
