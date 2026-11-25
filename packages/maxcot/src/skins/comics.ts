// skins/comics.ts: COMICS. Ben-Day pop art, a silver-age newsprint page,
// film noir and a clean webcomic panel.
import K from '../kit.js';
import type { Ctx2D, FillKey, Scene, Skin } from '../types.js';

type Pal = Partial<Record<FillKey, string | null>>;
const Skins: Record<string, Skin> = {};

// ── benday: pop-art enlargement, primary colours and big printed dots ──────
const POP: Pal = {
  body: '#ffd400', side: '#ffd400', hand: '#ffffff', eyeWhite: '#ffffff', pupil: '#111', glint: '#fff', brow: '#111',
  mouth: '#e10600', teeth: '#fff', tongue: '#e10600', shadow: null, tear: '#1c5bd8', blush: '#e10600', heart: '#e10600'
};
Skins.benday = {
  name: 'benday', label: 'Ben-Day', group: 'comics', about: 'A pop-art blow-up of a comic panel: primary colours, fat black line and giant printed dots.',
  fps: 8, hold: 'skin',
  ground: { css: '#fff', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    var c = Math.max(10, Math.min(w, h) / 40); ctx.fillStyle = '#8fd3ff';
    for (var y = 0, r = 0; y < h + c; y += c * 0.866, r++) for (var x = (r % 2) * c / 2; x < w + c; x += c) { ctx.beginPath(); ctx.arc(x, y, c * 0.32, 0, K.TAU); ctx.fill(); }
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit;
    K.toon(S, ctx, {
      lw: 0.022, ink: '#111',
      fill: function (p) { return POP[p.fill as FillKey] ?? null; },
      texture: function (c, p) {
        if (p.fill === 'body' || p.fill === 'side') K.halftone(c, p.pts, { cell: Math.max(5, u * 0.03), color: '#e10600', size: p.fill === 'side' ? 0.35 + (1 - (p.shade ?? 0.5)) * 0.5 : 0.28 });
        if (p.fill === 'hand') K.halftone(c, p.pts, { cell: Math.max(5, u * 0.03), color: '#1c5bd8', size: 0.22 });
      },
      skip: function (p) { return p.role === 'shadow'; }
    });
  }
};

// ── silverage: a 1960s newsprint page, slightly off register ───────────────
const SILVER: Pal = {
  body: '#5aa9d6', side: '#2f6f9f', hand: '#f3d27a', eyeWhite: '#fff6dc', pupil: '#1d1a16', glint: '#fff6dc', brow: '#1d1a16',
  mouth: '#a8322d', teeth: '#fff6dc', tongue: '#d4574f', shadow: 'rgba(60,40,20,0.25)', tear: '#7fb7da', blush: '#e48b7d', heart: '#c8342b'
};
Skins.silverage = {
  name: 'silverage', label: 'Silver age', group: 'comics', about: 'A 1960s comic on yellowed newsprint: flat four-colour fills printed a little off register.',
  fps: 8, hold: 'skin',
  ground: { css: '#efe2c0', draw: function (ctx: Ctx2D, w: number, h: number) {
    K.paper(ctx, w, h, '#efe2c0', 1.8);
    var g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(120,80,20,0)'); g.addColorStop(1, 'rgba(120,80,20,0.22)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit, mis = u * 0.012;
    // the colour plate, shifted off the key line
    ctx.save(); ctx.translate(mis, mis * 0.6); ctx.globalAlpha = 0.92; ctx.globalCompositeOperation = 'multiply';
    K.toon(S, ctx, { fill: function (p) { return K.paint(SILVER, p); }, noLines: function () { return true; } });
    ctx.restore();
    // the key line, with a flat dot screen in the shadows
    K.toon(S, ctx, {
      lw: 0.014, ink: '#1d1a16',
      fill: function () { return null; },
      texture: function (c, p) { if (p.fill === 'side' && (p.shade ?? 1) < 0.5) K.halftone(c, p.pts, { cell: Math.max(3, u * 0.014), color: '#1d1a16', size: 0.3 }); },
      line: function (c, pts, closed, p) { K.brush(c, K.resample(pts, 4, closed), u * 0.004, u * 0.012 * (p.lw || 1) * (p.fat ? 1.2 : 1), '#1d1a16', closed); }
    });
  }
};

// ── noir: hard light, deep black, the shadow of a venetian blind ───────────
Skins.noir = {
  name: 'noir', label: 'Noir', group: 'comics', about: 'Film noir in ink: one hard light, deep black shadow and the stripes of a venetian blind.',
  fps: 8, hold: 'skin',
  ground: { css: '#151515', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.transform(1, 0, -0.45, 1, 0, 0); ctx.fillStyle = '#e9e6df';
    var band = h / 11; for (var y = band * 0.6; y < h; y += band) ctx.fillRect(w * 0.15, y, w * 1.2, band * 0.55);
    ctx.restore();
    var g = ctx.createRadialGradient(w * 0.3, h * 0.2, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.7)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit;
    var lit = function (p: { shade?: number }) { return (p.shade ?? 0.6) > 0.62; };
    K.toon(S, ctx, {
      lw: 0.012, ink: '#000',
      fill: function (p) {
        if (p.fill === 'body' || p.fill === 'side') return lit(p) ? '#e9e6df' : '#0b0b0b';
        return ({ hand: '#e9e6df', eyeWhite: '#e9e6df', pupil: '#000', glint: '#fff', brow: '#000', mouth: '#000', teeth: '#e9e6df', tongue: '#444', shadow: 'rgba(0,0,0,0.85)', tear: '#e9e6df', blush: null, heart: '#e9e6df' } as Pal)[p.fill as FillKey] ?? null;
      },
      texture: function (c, p) {
        if (p.role === 'front') {
          // the light comes in from the upper left: the far side of the face falls into shadow
          var b = K.bbox(p.pts); c.save(); K.path(c, p.pts, true); c.clip();
          c.fillStyle = '#0b0b0b'; c.beginPath(); c.moveTo(b.x + b.w * 0.62, b.y - 5); c.lineTo(b.x + b.w + 5, b.y - 5); c.lineTo(b.x + b.w + 5, b.y + b.h + 5); c.lineTo(b.x + b.w * 0.38, b.y + b.h + 5); c.fill();
          c.restore();
        }
      },
      line: function (c, pts, closed, p) { K.brush(c, K.resample(pts, 4, closed), u * 0.003, u * 0.01 * (p.lw || 1), '#000', closed); }
    });
    // the blind's stripes fall across the figure too
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    K.actorsOf(S).forEach(function (A) {
      K.withClip(ctx, A.sil, function () {
        ctx.transform(1, 0, -0.45, 1, 0, 0); ctx.fillStyle = 'rgba(0,0,0,0.55)';
        var band = S.h / 11; for (var y = band * 0.6 + band * 0.55; y < S.h; y += band) ctx.fillRect(-S.w, y, S.w * 3, band * 0.45);
      });
    });
    ctx.restore();
  }
};

// ── webcomic: a clean digital panel, flat fills and a single cel shadow ────
const WEB: Pal = {
  body: '#b8e0d2', side: '#8fc5b4', hand: '#ffe3a3', eyeWhite: '#ffffff', pupil: '#3b3355', glint: '#fff', brow: '#3b3355',
  mouth: '#6b3a5b', teeth: '#fff', tongue: '#ff8fab', shadow: 'rgba(59,51,85,0.15)', tear: '#8ecae6', blush: '#ffb3c6', heart: '#ff6b8b'
};
Skins.webcomic = {
  name: 'webcomic', label: 'Webcomic', group: 'comics', about: 'A clean digital webcomic panel: even line, flat pastel fills, one cel shadow and a panel border.',
  fps: 12, hold: 'skin',
  ground: { css: '#ffffff', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    var m = Math.min(w, h) * 0.035; ctx.fillStyle = '#fdf6ec'; ctx.fillRect(m, m, w - m * 2, h - m * 2);
    ctx.strokeStyle = '#3b3355'; ctx.lineWidth = Math.max(2, m * 0.18); ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    K.toon(S, ctx, {
      lw: 0.009, ink: '#3b3355',
      fill: function (p) { return p.fill === 'side' ? WEB.side! : K.paint(WEB, p); },
      texture: function (c, p) {
        // one cel shadow on the face, cut along a straight light edge
        if (p.role !== 'front') return;
        var b = K.bbox(p.pts); c.save(); K.path(c, p.pts, true); c.clip();
        c.fillStyle = 'rgba(59,51,85,0.16)'; c.beginPath(); c.moveTo(b.x + b.w * 0.72, b.y - 5); c.lineTo(b.x + b.w + 5, b.y - 5); c.lineTo(b.x + b.w + 5, b.y + b.h + 5); c.lineTo(b.x + b.w * 0.55, b.y + b.h + 5); c.fill();
        c.restore();
      }
    });
  }
};

export const benday: Skin = Skins.benday!;
export const silverage: Skin = Skins.silverage!;
export const noir: Skin = Skins.noir!;
export const webcomic: Skin = Skins.webcomic!;
