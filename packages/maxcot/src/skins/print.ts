// engine/skins/print.js: PRINT AND PASTE. Ink on paper by a machine, a screen or a can.
import K from '../kit.js';
import type { Ctx2D, FillKey, Part, Pt, Scene, Skin, View } from '../types.js';
import type { LineFn, ToonStyle } from '../kit.js';
type Pal = Partial<Record<FillKey, string | null>>;
void (0 as unknown as Pt | ToonStyle | LineFn);
const Skins: Record<string, Skin> = {};
  var tv = K.tv;

  // A flat-colour pass most print skins start from (drawn into a buffer).
  function flat(S: Scene, ctx: Ctx2D, pal: Pal, o?: { lw?: number; ink?: string; noLines?: (p: Part) => boolean; skip?: (p: Part) => boolean; line?: LineFn }) {
    o = o || {};
    K.toon(S, ctx, {
      lw: o.lw || 0.008, ink: o.ink || '#111',
      fill: function (p) { return K.paint(pal, p); },
      noLines: o.noLines, skip: o.skip, line: o.line
    });
  }
  function bufferOf(S: Scene, name: string) { return K.buffer(name + S.key, S.w, S.h); }

  // ── print: CMYK halftone, four rotated screens ────────────────────────────
  var CMYK_PAL = { body: '#f3e6c8', side: '#c9b38a', hand: '#e8623a', eyeWhite: '#ffffff', pupil: '#111', glint: '#fff', brow: '#222', mouth: '#7b1d2d', teeth: '#fff', tongue: '#e85a71', shadow: '#b9b2a4', tear: '#4aa3df', blush: '#f08a8a', heart: '#e8323c' };
  Skins.print = {
    name: 'print', label: 'Print', group: 'print', about: 'Four-colour newsprint: cyan, magenta, yellow and black dot screens.',
    fps: 6, hold: 'skin', ground: { css: '#f1ece0', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#f1ece0', 1); } },
    params: [['print.cell', 'Dot size', 3, 16, 7]],
    draw: function (S: Scene, ctx: Ctx2D) {
      var b = bufferOf(S, 'print'), bc = b.ctx;
      bc.clearRect(0, 0, S.w, S.h); bc.fillStyle = '#fff'; bc.fillRect(0, 0, S.w, S.h);
      flat(S, bc, CMYK_PAL, { noLines: function () { return true; }, skip: function (p) { return !!p.line && p.role !== 'mouth-line'; } });
      var data = bc.getImageData(0, 0, S.w, S.h).data, cell = Math.max(3, tv('print.cell', 7) * S.unit / 260);
      var bb = S.body, x0 = Math.max(0, bb.x - S.unit * 0.8), x1 = Math.min(S.w, bb.x + bb.w + S.unit * 0.8), y0 = Math.max(0, bb.y - S.unit * 0.6), y1 = Math.min(S.h, bb.y + bb.h + S.unit * 0.8);
      var screens: Array<[string, number, number]> = [['#00a3e0', 0.26, 0], ['#e0007a', 1.31, 1], ['#ffe100', 0, 2], ['#1a1a1a', 0.79, 3]];
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      screens.forEach(function (sc) {
        var a = sc[1], ca = Math.cos(a), sa = Math.sin(a), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2;
        ctx.fillStyle = sc[0]; ctx.beginPath();
        for (var u = -R; u <= R; u += cell) for (var v = -R; v <= R; v += cell) {
          var x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
          if (x < x0 || y < y0 || x >= x1 || y >= y1) continue;
          var i = ((y | 0) * S.w + (x | 0)) * 4, r = data[i] / 255, g = data[i + 1] / 255, bl = data[i + 2] / 255;
          var k = 1 - Math.max(r, g, bl), amt = sc[2] === 3 ? k : (k >= 1 ? 0 : ((1 - [r, g, bl][sc[2]]! - k) / (1 - k)));
          if (amt < 0.04) continue;
          var rad = cell * 0.62 * Math.sqrt(amt); ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, K.TAU);
        }
        ctx.fill();
      });
      ctx.restore();
      flat(S, ctx, {}, { lw: 0.005, ink: 'rgba(20,20,20,0.85)' });
    }
  };

  // ── riso: two fluorescent drums, off register, grainy ────────────────────
  Skins.riso = {
    name: 'riso', label: 'Riso', group: 'print', about: 'Risograph: fluorescent pink and medium blue, never quite lined up.',
    fps: 6, hold: 'skin', ground: { css: '#f4efe4', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#f4efe4', 1.2); } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var pink = '#ff48b0', blue = '#0078bf', u = S.unit, rnd = K.rng(S.seed + 77);
      var A = bufferOf(S, 'risoA'), Bf = bufferOf(S, 'risoB');
      A.ctx.clearRect(0, 0, S.w, S.h); Bf.ctx.clearRect(0, 0, S.w, S.h);
      K.toon(S, A.ctx, {
        fill: function (p) {
          if (p.fill === 'body' || p.fill === 'hand') return K.rgba(pink, 0.85);
          if (p.fill === 'side') return K.rgba(pink, 0.4 + (1 - p.shade!) * 0.6);
          if (p.fill === 'tongue' || p.fill === 'blush' || p.fill === 'heart') return pink; return null;
        }, noLines: function () { return true; }, skip: function (p) { return !!p.line; }
      });
      K.toon(S, Bf.ctx, {
        lw: 0.008, ink: blue,
        fill: function (p) {
          if (p.fill === 'side') return K.rgba(blue, (1 - p.shade!) * 0.55);
          return ({ pupil: blue, brow: blue, mouth: blue, shadow: K.rgba(blue, 0.35), tear: K.rgba(blue, 0.5) } as Pal)[p.fill!] || null;
        },
        texture: function (c, p) { if (p.role === 'front') K.halftone(c, p.pts, { cell: Math.max(3, u * 0.022), color: blue, size: function (x, y) { return 0.12 + 0.25 * (y - K.sceneOf(S, p).body.y) / K.sceneOf(S, p).body.h; } }); }
      });
      // grain: knock speckles out of both drums
      [A, Bf].forEach(function (buf) {
        var c = buf.ctx; c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000';
        for (var i = 0; i < 900; i++) c.fillRect(S.body.x - u * 0.4 + rnd() * (S.body.w + u * 0.8), S.body.y - u * 0.3 + rnd() * (S.body.h + u * 0.8), 1 + rnd() * 2, 1 + rnd() * 2);
        c.restore();
      });
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(A.canvas, u * 0.012, -u * 0.008); ctx.drawImage(Bf.canvas, -u * 0.006, u * 0.006);
      ctx.restore();
    }
  };

  // ── gig poster: CMYK blobs, a burst and a fat keyline ─────────────────────
  Skins.gigposter = {
    name: 'gigposter', label: 'Screen-printed gig poster', group: 'print', about: 'Three spot inks splashed into the keyline, Ben-Day dots and a burst.',
    fps: 8, hold: 'skin', ground: { css: '#f5f2ea', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#f5f2ea', 0.8); } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var u = S.unit, b = S.body, rnd = K.rng(Math.floor(S.seed / 6) * 13 + 4), inks = ['#ff1fa0', '#ffe600', '#14b4ff'];
      // burst
      ctx.lineCap = 'round';
      for (var i = 0; i < 26; i++) {
        var a = i / 26 * K.TAU + rnd() * 0.1, r1 = Math.hypot(b.w, b.h) * (0.62 + rnd() * 0.1), r2 = r1 + u * (0.2 + rnd() * 0.25);
        ctx.strokeStyle = inks[i % 3]; ctx.lineWidth = u * 0.012;
        ctx.beginPath(); ctx.moveTo(b.cx + Math.cos(a) * r1, b.cy + Math.sin(a) * r1); ctx.lineTo(b.cx + Math.cos(a) * r2, b.cy + Math.sin(a) * r2); ctx.stroke();
      }
      var blobs = function (c: Ctx2D, poly: Pt[], n: number) {
        K.withClip(c, poly, function () {
          var bb = K.bbox(poly); c.fillStyle = inks[0]; c.fillRect(bb.x - 2, bb.y - 2, bb.w + 4, bb.h + 4);
          for (var k = 0; k < n; k++) {
            c.fillStyle = inks[1 + (k % 2)]; c.beginPath();
            var cx = bb.x + rnd() * bb.w, cy = bb.y + rnd() * bb.h, rr = Math.max(bb.w, bb.h) * (0.2 + rnd() * 0.25);
            for (var j = 0; j < 14; j++) { var aa = j / 14 * K.TAU, q = rr * (0.7 + rnd() * 0.5); c.lineTo(cx + Math.cos(aa) * q, cy + Math.sin(aa) * q); }
            c.fill();
          }
          K.halftone(c, poly, { cell: Math.max(3, u * 0.02), color: 'rgba(255,255,255,0.65)', size: 0.25 });
        });
      };
      K.toon(S, ctx, {
        lw: 0.011, ink: '#111',
        fill: function (p) {
          if (p.fill === 'side') return '#0d6fb8';
          return ({ eyeWhite: '#fff', pupil: '#111', glint: '#fff', brow: '#111', mouth: '#111', teeth: '#fff', tongue: '#ff1fa0', shadow: 'rgba(0,0,0,0.12)', tear: '#14b4ff', heart: '#ff1fa0', blush: '#ff1fa0' } as Pal)[p.fill!] || null;
        },
        texture: function (c, p) { if (p.role === 'front') blobs(c, p.pts, 4); if (p.fill === 'hand') { c.fillStyle = inks[(p.pts.length % 2) + 1]; K.path(c, p.pts, true); c.fill(); } }
      });
    }
  };

  // ── stencil: sprayed through a cut card onto a wall ──────────────────────
  Skins.stencil = {
    name: 'stencil', label: 'Spray stencil', group: 'print', about: 'Cut card and a rattle can on a concrete wall. Overspray included.',
    fps: 12, hold: 'skin',
    ground: { css: '#e5e4e0', draw: function (ctx: Ctx2D, w: number, h: number) {
      K.paper(ctx, w, h, '#cfcdc8', 3); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 2; for (var y = h * 0.33; y < h; y += h * 0.33) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var u = S.unit, A = bufferOf(S, 'stencilA'), rnd = K.rng(S.seed * 3 + 1);
      A.ctx.clearRect(0, 0, S.w, S.h);
      K.toon(S, A.ctx, {
        lw: 0.012, ink: '#141414',
        fill: function (p) {
          if (p.fill === 'side') return p.shade! < 0.45 ? '#141414' : null;
          return ({ body: null, hand: null, pupil: '#141414', brow: '#141414', mouth: '#141414', shadow: 'rgba(20,20,20,0.35)', heart: '#d62828', tear: '#141414', tongue: '#d62828' } as Pal)[p.fill!] || null;
        }
      });
      ctx.save();
      ctx.fillStyle = 'rgba(214,40,40,0.82)'; ctx.filter = 'blur(' + (u * 0.006).toFixed(1) + 'px)';
      K.actorsOf(S).forEach(function (Q) { K.path(ctx, Q.front, true); ctx.fill(); }); ctx.filter = 'none';
      ctx.globalAlpha = 0.35; ctx.filter = 'blur(' + (u * 0.012).toFixed(1) + 'px)'; ctx.drawImage(A.canvas, 0, 0);
      ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.drawImage(A.canvas, 0, 0);
      // speckle overspray
      ctx.fillStyle = 'rgba(20,20,20,0.5)';
      for (var i = 0; i < 500; i++) { var a = rnd() * K.TAU, r = Math.hypot(S.body.w, S.body.h) * (0.45 + rnd() * 0.25); ctx.fillRect(S.body.cx + Math.cos(a) * r, S.body.cy + Math.sin(a) * r * 0.8, 1.2, 1.2); }
      // drips
      ctx.fillStyle = 'rgba(20,20,20,0.75)';
      K.actorsOf(S).forEach(function (Q) { var qb = Q.body;
      for (var d = 0; d < 3; d++) { var x = qb.x + qb.w * (0.2 + d * 0.3), y = qb.y + qb.h * 0.98, len = u * (0.06 + K.hash(d + 9) * 0.12); ctx.fillRect(x, y, Math.max(1.5, u * 0.006), len); ctx.beginPath(); ctx.arc(x + u * 0.003, y + len, u * 0.006, 0, K.TAU); ctx.fill(); }
      });
      ctx.restore();
    }
  };

  // ── manga: screentone and a crisp G-pen ──────────────────────────────────
  Skins.manga = {
    name: 'manga', label: 'Manga', group: 'print', about: 'A black-and-white manga panel: screentone, a G-pen line, speed lines.',
    fps: 8, hold: 'skin',
    ground: { css: '#fff', draw: function (ctx: Ctx2D, w: number, h: number, t: number) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      var rnd = K.rng(Math.floor(t * 8)); ctx.strokeStyle = '#111';
      for (var i = 0; i < 70; i++) { var a = rnd() * K.TAU, r0 = Math.min(w, h) * (0.42 + rnd() * 0.12), r1 = Math.max(w, h); ctx.lineWidth = 0.5 + rnd() * 1.5; ctx.beginPath(); ctx.moveTo(w / 2 + Math.cos(a) * r0, h / 2 + Math.sin(a) * r0); ctx.lineTo(w / 2 + Math.cos(a) * r1, h / 2 + Math.sin(a) * r1); ctx.stroke(); }
    } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var u = S.unit;
      K.toon(S, ctx, {
        fill: function (p) { return ({ body: '#fff', side: '#fff', hand: '#fff', eyeWhite: '#fff', pupil: '#111', glint: '#fff', brow: '#111', mouth: '#111', teeth: '#fff', tongue: '#fff', shadow: 'rgba(0,0,0,0.0)', tear: '#fff', heart: '#111', blush: null } as Pal)[p.fill!] || null; },
        texture: function (c, p) {
          if (p.fill === 'side') K.halftone(c, p.pts, { cell: Math.max(2.5, u * 0.014), color: '#111', size: 0.15 + (1 - p.shade!) * 0.6 });
          if (p.role === 'shadow') K.halftone(c, p.pts, { cell: Math.max(2.5, u * 0.014), color: '#111', size: 0.5 });
          if (p.role === 'blush') K.hatch(c, p.pts, { angle: 1.1, gap: Math.max(2, u * 0.012), width: 1, color: '#111', alpha: 0.9 });
          if (p.fill === 'pupil') { var b = K.bbox(p.pts); c.fillStyle = '#fff'; c.beginPath(); c.arc(b.cx - b.w * 0.2, b.cy + b.h * 0.18, b.w * 0.12, 0, K.TAU); c.fill(); }
        },
        line: function (c, pts, closed, p) { K.brush(c, K.resample(pts, 4, closed), u * 0.003, u * 0.011 * (p.lw || 1) * (p.fat ? 1.2 : 1), '#111', closed); }
      });
    }
  };

  // ── cubist: the figure cut up and pasted back, a little wrong ─────────────
  var OCHRE = { body: '#d8b26e', side: '#8a5a2b', hand: '#c76b3a', eyeWhite: '#efe3c2', pupil: '#2b2118', glint: '#efe3c2', brow: '#2b2118', mouth: '#5a2a1c', teeth: '#efe3c2', tongue: '#b5523b', shadow: '#6b5a44', tear: '#4f7a8a', blush: '#b5523b', heart: '#a33b2b' };
  Skins.cubist = {
    name: 'cubist', label: 'Cubist collage', group: 'print', about: 'Cut into planes and pasted back, each piece seen from somewhere else.',
    fps: 4, hold: 'skin', ground: { css: '#c9b48a', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#c9b48a', 2); } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var A = bufferOf(S, 'cubist'), u = S.unit, rnd = K.rng(Math.floor(S.seed / 2) + 5), b = S.body;
      A.ctx.clearRect(0, 0, S.w, S.h); flat(S, A.ctx, OCHRE, { lw: 0.007, ink: '#2b2118' });
      var x0 = b.x - u * 0.5, y0 = b.y - u * 0.3, w = b.w + u, h = b.h + u * 0.7;
      var tints = ['rgba(60,90,110,0.25)', 'rgba(140,60,30,0.2)', 'rgba(250,240,210,0.25)', 'rgba(40,30,20,0.2)'];
      for (var i = 0; i < 16; i++) {
        var cx = x0 + rnd() * w, cy = y0 + rnd() * h, r = u * (0.18 + rnd() * 0.3), n = 3 + (rnd() * 3 | 0), poly: Pt[] = [];
        for (var k = 0; k < n; k++) { var a = k / n * K.TAU + rnd() * 0.8; poly.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        var dx = (rnd() - 0.5) * u * 0.12, dy = (rnd() - 0.5) * u * 0.08, rot = (rnd() - 0.5) * 0.25;
        ctx.save(); K.path(ctx, poly, true); ctx.clip();
        ctx.translate(cx, cy); ctx.rotate(rot); ctx.translate(-cx + dx, -cy + dy); ctx.drawImage(A.canvas, 0, 0);
        ctx.restore();
        ctx.fillStyle = tints[i % 4]; K.path(ctx, poly, true); ctx.fill();
        ctx.strokeStyle = 'rgba(43,33,24,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = 0.55; ctx.drawImage(A.canvas, 0, 0); ctx.globalAlpha = 1;
    }
  };
export const print: Skin = Skins.print!;
export const riso: Skin = Skins.riso!;
export const gigposter: Skin = Skins.gigposter!;
export const stencil: Skin = Skins.stencil!;
export const manga: Skin = Skins.manga!;
export const cubist: Skin = Skins.cubist!;

