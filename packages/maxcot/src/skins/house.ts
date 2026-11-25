// skins/house.ts: HOUSE. Maxcot's own looks: the sticker, the chalkboard,
// the paper cut-out and the crayon.
import K from '../kit.js';
import type { Ctx2D, FillKey, Pt, Scene, Skin } from '../types.js';

type Pal = Partial<Record<FillKey, string | null>>;
const Skins: Record<string, Skin> = {};
const tv = K.tv;
const offset = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((q): Pt => [q[0] + dx, q[1] + dy]);
/** HSL (degrees, percent, percent) to #rrggbb. */
export function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100; const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12, c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}

// ── maxcot: the house style. A die-cut sticker: white border, hard shadow, fat round ink ──
const HOUSE: Pal = {
  body: '#ff7a59', side: '#ff7a59', hand: '#ffd166', eyeWhite: '#fffaf0', pupil: '#23201c', glint: '#fff', brow: '#23201c',
  mouth: '#5b1f2a', teeth: '#fffaf0', tongue: '#ff4f6d', shadow: null, tear: '#7ec8ff', blush: 'rgba(255,79,109,0.45)', heart: '#ff4f6d'
};
Skins.maxcot = {
  name: 'maxcot', label: 'Maxcot', group: 'house', about: 'The house style: a die-cut sticker with a white border, a hard shadow and fat round ink.',
  fps: 12, hold: 'skin', params: [['maxcot.hue', 'Colour', 0, 360, 14]],
  ground: { css: '#fff4e0', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#fff4e0'; ctx.fillRect(0, 0, w, h);
    var g = Math.max(14, Math.min(w, h) / 26); ctx.fillStyle = 'rgba(35,32,28,0.12)';
    for (var y = g / 2; y < h; y += g) for (var x = g / 2; x < w; x += g) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, g * 0.07), 0, K.TAU); ctx.fill(); }
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit, body = hslHex(tv('maxcot.hue', 14), 100, 67), ink = '#23201c';
    // the sticker: a hard shadow, then a white border around everyone's silhouette
    K.actorsOf(S).forEach(function (A) {
      ctx.fillStyle = 'rgba(35,32,28,0.9)'; K.smoothPath(ctx, offset(A.sil, u * 0.035, u * 0.045), true); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = u * 0.07; ctx.lineJoin = 'round'; K.smoothPath(ctx, A.sil, true); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fill();
    });
    K.toon(S, ctx, {
      lw: 0.02, ink: ink,
      fill: function (p) {
        if (p.fill === 'body' || p.fill === 'side') return K.shadeHex(body, p.shade == null ? 0.7 : 0.25 + p.shade * 0.6);
        return K.paint(HOUSE, p);
      },
      texture: function (c, p) {
        if (p.role === 'front') { var b = K.bbox(p.pts); c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(b.x + b.w * 0.24, b.y + b.h * 0.1, b.w * 0.12, b.h * 0.035, -0.3, 0, K.TAU); c.fill(); }
      },
      skip: function (p) { return p.role === 'shadow'; }
    });
  }
};

// ── chalk: a school chalkboard, dusty strokes and smudged fills ─────────────
function chalkLine(c: Ctx2D, pts: Pt[], closed: boolean, rnd: () => number, w: number, color: string) {
  var src = K.resample(pts, Math.max(3, w * 1.5), closed);
  if (closed && src.length) src.push(src[0]!);
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (var pass = 0; pass < 3; pass++) {
    c.strokeStyle = color; c.globalAlpha = pass ? 0.35 : 0.75; c.lineWidth = w * (pass ? 0.55 : 1);
    c.setLineDash([w * (1.5 + rnd() * 3), w * (0.3 + rnd() * 0.8)]);
    K.smoothPath(c, K.wobble(src, w * 0.45, rnd), false); c.stroke();
  }
  c.setLineDash([]); c.globalAlpha = 1;
}
Skins.chalk = {
  name: 'chalk', label: 'Chalkboard', group: 'house', about: 'Drawn on a school chalkboard: dusty broken strokes and rubbed-in colour.',
  fps: 6, hold: 'skin',
  ground: { css: '#2f4a3a', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#2f4a3a'; ctx.fillRect(0, 0, w, h);
    var rnd = K.rng(31);
    for (var i = 0; i < 26; i++) {                  // old rubbings
      var x = rnd() * w, y = rnd() * h, r = Math.min(w, h) * (0.08 + rnd() * 0.22), g = ctx.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    K.paper(ctx, w, h, 'rgba(0,0,0,0)', 0.6);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit, rnd = K.rng(S.seed * 7 + 2), w = Math.max(1.2, u * 0.009);
    var COL: Pal = { body: 'rgba(255,214,120,0.28)', side: 'rgba(255,214,120,0.16)', hand: 'rgba(255,255,255,0.3)', eyeWhite: 'rgba(255,255,255,0.75)', pupil: 'rgba(255,255,255,0.95)', glint: null,
      brow: 'rgba(255,255,255,0.9)', mouth: 'rgba(255,140,160,0.5)', teeth: 'rgba(255,255,255,0.8)', tongue: 'rgba(255,140,160,0.6)', shadow: 'rgba(255,255,255,0.06)', tear: 'rgba(140,210,255,0.7)', blush: 'rgba(255,140,160,0.35)', heart: 'rgba(255,120,150,0.8)' };
    K.toon(S, ctx, {
      fill: function (p) { return COL[p.fill as FillKey] ?? null; },
      texture: function (c, p) { if (p.fill === 'body' || p.fill === 'side') K.hatch(c, p.pts, { angle: -0.5, gap: Math.max(2, u * 0.018), width: w * 0.6, color: '#fff', alpha: 0.12, rnd: rnd }); },
      line: function (c, pts, closed, p) { chalkLine(c, pts, closed, rnd, w * (p.lw || 1) * (p.fat ? 1.4 : 1), p.fill === 'pupil' ? '#fff' : '#f3f1e6'); }
    });
  }
};

// ── papercut: coloured paper, cut out and pinned up in layers ─────────────
const PAPER: Pal = {
  body: '#4fb3bf', side: '#2f8a96', hand: '#f6d55c', eyeWhite: '#fdfbf3', pupil: '#2b2d42', glint: '#fdfbf3', brow: '#2b2d42',
  mouth: '#8d2b3a', teeth: '#fdfbf3', tongue: '#ed553b', shadow: null, tear: '#9ad1f5', blush: '#f7a1a1', heart: '#ed553b'
};
Skins.papercut = {
  name: 'papercut', label: 'Paper cut-out', group: 'house', about: 'Coloured card cut out with scissors and layered up, each piece casting its own shadow.',
  fps: 4, hold: 'skin',
  ground: { css: '#f2e8cf', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#f2e8cf'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#e8d9b5'; ctx.beginPath(); ctx.moveTo(0, h * 0.78); for (var x = 0; x <= w; x += w / 12) ctx.lineTo(x, h * (0.76 + 0.02 * Math.sin(x * 0.02))); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();
    K.paper(ctx, w, h, 'rgba(0,0,0,0)', 1.2);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit, rnd = K.rng(S.seed * 3 + 1);
    // the whole cut-out is re-pinned a hair off each frame, like stop-motion
    ctx.save(); ctx.translate((rnd() - 0.5) * u * 0.006, (rnd() - 0.5) * u * 0.006); ctx.rotate((rnd() - 0.5) * 0.004);
    K.toon(S, ctx, {
      fill: function (p) { return K.paint(PAPER, p); },
      pre: function (c) { c.shadowColor = 'rgba(60,40,10,0.35)'; c.shadowBlur = u * 0.02; c.shadowOffsetX = u * 0.008; c.shadowOffsetY = u * 0.012; },
      noLines: function () { return true; },
      skip: function (p) { return p.role === 'shadow' || p.role === 'guide'; }
    });
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.restore();
    // fibres on the card
    K.actorsOf(S).forEach(function (A) { K.withClip(ctx, A.sil, function () { K.hatch(ctx, A.sil, { angle: 0.3, gap: Math.max(3, u * 0.02), width: 0.6, color: '#fff', alpha: 0.12, rnd: rnd }); }); });
  }
};

// ── crayon: waxy scribbles that never stay inside the lines ─────────────────
const CRAYON: Pal = {
  body: '#3a86ff', side: '#1d4fbf', hand: '#ffbe0b', eyeWhite: '#ffffff', pupil: '#1b1b1b', glint: null, brow: '#1b1b1b',
  mouth: '#d62828', teeth: '#ffffff', tongue: '#ff5d8f', shadow: 'rgba(80,80,80,0.25)', tear: '#4cc9f0', blush: '#ff5d8f', heart: '#d62828'
};
Skins.crayon = {
  name: 'crayon', label: 'Crayon', group: 'house', about: 'A kid’s crayon drawing: waxy scribbled colour that never stays inside the lines.',
  fps: 6, hold: 'skin',
  ground: { css: '#fffdf7', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#fffdf7', 1.6); } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit, rnd = K.rng(S.seed * 17 + 5);
    var waxLine = function (c: Ctx2D, pts: Pt[], closed: boolean, color: string, width: number) {
      var src = K.resample(pts, Math.max(4, u * 0.02), closed); if (closed && src.length) src.push(src[0]!);
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (var pass = 0; pass < 2; pass++) {
        c.strokeStyle = color; c.globalAlpha = 0.75; c.lineWidth = width * (0.7 + pass * 0.4);
        c.setLineDash([width * 0.6, width * 0.25, width * 2, width * 0.2]);
        K.smoothPath(c, K.wobble(src, u * 0.006, rnd), false); c.stroke();
      }
      c.setLineDash([]); c.globalAlpha = 1;
    };
    K.toon(S, ctx, {
      fill: function () { return null; },
      texture: function (c, p) {
        var col = K.paint(CRAYON, p); if (!col || p.line) return;
        var spill = p.pts.map((q): Pt => [q[0] + (rnd() - 0.5) * u * 0.03, q[1] + (rnd() - 0.5) * u * 0.03]);
        K.withClip(c, spill, function () { K.hatch(c, spill, { angle: -0.4 + rnd() * 0.3, gap: Math.max(2, u * 0.012), width: Math.max(1.5, u * 0.01), color: col!, alpha: 0.55, rnd: rnd }); });
      },
      line: function (c, pts, closed, p) { waxLine(c, pts, closed, p.fill === 'mouth' ? '#9b1d20' : '#2b2b2b', Math.max(1.6, u * 0.011) * (p.lw || 1) * (p.fat ? 1.3 : 1)); }
    });
  }
};

export const maxcot: Skin = Skins.maxcot!;
export const chalk: Skin = Skins.chalk!;
export const papercut: Skin = Skins.papercut!;
export const crayon: Skin = Skins.crayon!;
