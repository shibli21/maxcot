// skins/pixels.ts: PIXELS. A handheld's four greens, an 8-bit console,
// an isometric game and plain ASCII.
//
// Each draws the figure small into a buffer, rewrites the pixels (palette,
// dither, outline) and scales the result up with hard edges.
import K from '../kit.js';
import type { ToonStyle } from '../kit.js';
import type { Ctx2D, FillKey, Pt, Scene, Skin } from '../types.js';

type Pal = Partial<Record<FillKey, string | null>>;
type RGB = [number, number, number];
const Skins: Record<string, Skin> = {};

/** Draw the figure at `rows` pixels tall into a buffer, let `post` rewrite the pixels, and scale it up. */
function lowres(S: Scene, ctx: Ctx2D, name: string, rows: number, style: ToonStyle, post: (d: Uint8ClampedArray, w: number, h: number) => void): void {
  var sc = S.h / rows, w = Math.max(8, Math.round(S.w / sc)), h = Math.max(8, Math.round(S.h / sc));
  var buf = K.buffer(name + S.key, w, h), c = buf.ctx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h); c.imageSmoothingEnabled = false;
  c.setTransform(w / S.w, 0, 0, h / S.h, 0, 0);
  K.toon(S, c, style);
  c.setTransform(1, 0, 0, 1, 0, 0);
  var img = c.getImageData(0, 0, w, h);
  post(img.data, w, h);
  c.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(buf.canvas, 0, 0, w, h, 0, 0, S.w, S.h); ctx.imageSmoothingEnabled = true;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const lum = (d: Uint8ClampedArray, i: number) => (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) / 255;
/** Hard alpha, and a one-pixel outline in `ink` around the figure. */
function outline(d: Uint8ClampedArray, w: number, h: number, ink: RGB | null): void {
  for (var i = 3; i < d.length; i += 4) d[i] = d[i]! > 110 ? 255 : 0;
  if (!ink) return;
  var solid = new Uint8Array(w * h); for (var k = 0; k < w * h; k++) solid[k] = d[k * 4 + 3]! ? 1 : 0;
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var k2 = y * w + x; if (solid[k2]) continue;
    if ((x > 0 && solid[k2 - 1]) || (x < w - 1 && solid[k2 + 1]) || (y > 0 && solid[k2 - w]) || (y < h - 1 && solid[k2 + w])) { var j = k2 * 4; d[j] = ink[0]; d[j + 1] = ink[1]; d[j + 2] = ink[2]; d[j + 3] = 255; }
  }
}
function nearest(pal: RGB[], r: number, g: number, b: number): RGB {
  var best = pal[0]!, bd = 1e9;
  for (var p of pal) { var dr = p[0] - r, dg = p[1] - g, db = p[2] - b, dd = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11; if (dd < bd) { bd = dd; best = p; } }
  return best;
}
const NATURAL: Pal = {
  body: '#ff9f43', side: '#ee5a24', hand: '#ffd32a', eyeWhite: '#ffffff', pupil: '#1e272e', glint: '#ffffff', brow: '#1e272e',
  mouth: '#6f1e51', teeth: '#ffffff', tongue: '#ff6b81', shadow: null, tear: '#48dbfb', blush: '#ff6b81', heart: '#ff4757'
};

// ── gameboy: four greens, ordered dither ──────────────────────────────────
const DMG: RGB[] = [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]];
Skins.gameboy = {
  name: 'gameboy', label: 'Game Boy', group: 'pixels', about: 'A pocket handheld’s LCD: four shades of green, 48 pixels tall, ordered dithering.',
  fps: 8, hold: 'skin', params: [['gameboy.res', 'Pixels tall', 24, 120, 48]],
  ground: { css: '#9bbc0f', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#9bbc0f'; ctx.fillRect(0, 0, w, h);
    var c = Math.max(4, h / 96); ctx.fillStyle = 'rgba(15,56,15,0.06)'; for (var x = 0; x < w; x += c) ctx.fillRect(x, 0, 1, h); for (var y = 0; y < h; y += c) ctx.fillRect(0, y, w, 1);
    ctx.fillStyle = '#8bac0f'; ctx.fillRect(0, h * 0.8, w, h * 0.2);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var rows = K.tv('gameboy.res', 48) * 1.6 * (S.h / Math.max(S.h, S.unit * 1.85));
    lowres(S, ctx, 'gb', rows, { lw: 0.014, ink: '#000', fill: function (p) { return K.paint(NATURAL, p); }, skip: function (p) { return p.role === 'shadow'; } }, function (d, w) {
      outline(d, w, d.length / 4 / w, null);
      for (var i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        var k = i / 4, x = k % w, y = (k / w) | 0, v = lum(d, i) * 3 + (BAYER[(y % 4) * 4 + (x % 4)]! / 16 - 0.5) * 0.9;
        var c = DMG[Math.max(0, Math.min(3, Math.round(v)))]!; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
    });
  }
};

// ── eightbit: a 16-colour console sprite with a black outline ─────────────
const SIXTEEN: RGB[] = ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'].map((h) => K.hex(h));
Skins.eightbit = {
  name: 'eightbit', label: '8-bit', group: 'pixels', about: 'An 8-bit console sprite: sixteen fixed colours, chunky pixels and a black outline.',
  fps: 8, hold: 'skin', params: [['eightbit.res', 'Pixels tall', 24, 120, 40]],
  ground: { css: '#1d2b53', draw: function (ctx: Ctx2D, w: number, h: number) {
    var c = Math.max(6, Math.round(h / 60)); ctx.fillStyle = '#1d2b53'; ctx.fillRect(0, 0, w, h);
    var rnd = K.rng(5); ctx.fillStyle = '#fff1e8'; for (var i = 0; i < 40; i++) ctx.fillRect(Math.floor(rnd() * w / c) * c, Math.floor(rnd() * h * 0.7 / c) * c, c, c);
    var gy = Math.floor(h * 0.8 / c) * c; ctx.fillStyle = '#008751'; ctx.fillRect(0, gy, w, h - gy); ctx.fillStyle = '#00e436'; ctx.fillRect(0, gy, w, c);
    ctx.fillStyle = '#ab5236'; for (var x = 0; x < w; x += c * 4) ctx.fillRect(x + c, gy + c * 3, c * 2, c);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var rows = K.tv('eightbit.res', 40) * 1.6 * (S.h / Math.max(S.h, S.unit * 1.85));
    lowres(S, ctx, 'nes', rows, { lw: 0.01, ink: '#000', fill: function (p) { return K.paint(NATURAL, p); }, skip: function (p) { return p.role === 'shadow'; } }, function (d, w) {
      for (var i = 0; i < d.length; i += 4) { if (d[i + 3]! <= 110) continue; var c = nearest(SIXTEEN, d[i]!, d[i + 1]!, d[i + 2]!); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
      outline(d, w, d.length / 4 / w, [0, 0, 0]);
    });
  }
};

// ── isometric: a sprite standing on an isometric tile floor ───────────────
const ISO: RGB[] = ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c', '#d90429', '#ffb703', '#fb8500', '#219ebc', '#023047', '#8ecae6', '#90be6d', '#43aa8b', '#f9c74f', '#f8961e', '#ffffff', '#6d597a'].map((h) => K.hex(h));
Skins.isometric = {
  name: 'isometric', label: 'Isometric', group: 'pixels', about: 'A sprite in an isometric pixel game: a diamond tile floor, a tile shadow, sixteen colours.',
  fps: 8, hold: 'skin',
  ground: { css: '#8ecae6', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#8ecae6'; ctx.fillRect(0, 0, w, h);
    var tw = Math.max(40, Math.min(w, h) / 6), th = tw / 2, top = h * 0.55;
    for (var row = 0; row * th / 2 + top < h + th; row++) for (var col = -1; col * tw < w + tw; col++) {
      var cx = col * tw + (row % 2) * tw / 2, cy = top + row * th / 2;
      ctx.fillStyle = (row + col * 2) % 3 === 0 ? '#90be6d' : '#43aa8b'; ctx.beginPath(); ctx.moveTo(cx, cy - th / 2); ctx.lineTo(cx + tw / 2, cy); ctx.lineTo(cx, cy + th / 2); ctx.lineTo(cx - tw / 2, cy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(2,48,71,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    }
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    // a diamond shadow under each actor
    K.actorsOf(S).forEach(function (A) {
      var b = A.body, cx = b.cx, cy = b.y + b.h * 1.04, r = b.w * 0.75;
      ctx.fillStyle = 'rgba(2,48,71,0.35)'; ctx.beginPath(); ctx.moveTo(cx, cy - r / 2); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r / 2); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill();
    });
    lowres(S, ctx, 'iso', 72 * (S.h / Math.max(S.h, S.unit * 1.85)) * 1.6, { lw: 0.01, ink: '#2b2d42', fill: function (p) { return K.paint(NATURAL, p); }, skip: function (p) { return p.role === 'shadow'; } }, function (d, w) {
      for (var i = 0; i < d.length; i += 4) {
        if (d[i + 3]! <= 110) continue;
        // a lit top-left: brighten up and left, darken down and right
        var k = i / 4, x = k % w, y = (k / w) | 0, shade = 1.08 - (x / w) * 0.12 - (y / (d.length / 4 / w)) * 0.12;
        var c = nearest(ISO, d[i]! * shade, d[i + 1]! * shade, d[i + 2]! * shade); d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
      }
      outline(d, w, d.length / 4 / w, [43, 45, 66]);
    });
  }
};

// ── ascii: the figure typed out in characters on a terminal ───────────────
const RAMP = ' .:-=+*#%@';
Skins.ascii = {
  name: 'ascii', label: 'ASCII', group: 'pixels', about: 'The figure typed out on a terminal: one character per cell, denser where it is brighter.',
  fps: 10, hold: 'skin', params: [['ascii.cols', 'Columns', 30, 160, 72]],
  ground: { css: '#0c0f0a', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#0c0f0a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,255,140,0.035)'; for (var y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var cols = Math.round(K.tv('ascii.cols', 72)), cw = S.w / cols, ch = cw * 1.8, rows = Math.max(4, Math.round(S.h / ch));
    var buf = K.buffer('ascii' + S.key, cols, rows), c = buf.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cols, rows);
    c.setTransform(cols / S.w, 0, 0, rows / S.h, 0, 0);
    K.toon(S, c, { lw: 0.02, ink: '#000', fill: function (p) { return K.paint(NATURAL, p); }, skip: function (p) { return p.role === 'shadow'; } });
    c.setTransform(1, 0, 0, 1, 0, 0);
    var d = c.getImageData(0, 0, cols, rows).data, rnd = K.rng(S.seed);
    ctx.save(); ctx.font = 'bold ' + Math.round(ch * 0.95) + 'px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
      var i = (y * cols + x) * 4, a = d[i + 3]! / 255; if (a < 0.25) continue;
      var L = lum(d, i), ch1 = RAMP[Math.max(1, Math.min(RAMP.length - 1, Math.round(L * (RAMP.length - 1) + (rnd() - 0.5) * 0.6)))]!;
      if (L < 0.12) ch1 = '#';                              // ink lines print solid
      var g = Math.round(120 + L * 135);
      ctx.fillStyle = L < 0.12 ? 'rgb(60,200,90)' : 'rgb(' + Math.round(g * 0.55) + ',' + g + ',' + Math.round(g * 0.6) + ')';
      ctx.fillText(ch1, (x + 0.5) * cw, (y + 0.5) * (S.h / rows));
    }
    ctx.restore();
  }
};

export const gameboy: Skin = Skins.gameboy!;
export const eightbit: Skin = Skins.eightbit!;
export const isometric: Skin = Skins.isometric!;
export const ascii: Skin = Skins.ascii!;
void (0 as unknown as Pt);
