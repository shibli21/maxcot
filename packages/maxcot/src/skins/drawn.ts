// engine/skins/drawn.js: DRAWN. Things a hand did with a tool.
// Each skin: { name, label, group, about, fps, hold, ground: { css, draw }, params, draw(S, ctx, view) }
import K from '../kit.js';
import type { Ctx2D, FillKey, Part, Pt, Scene, Skin, View } from '../types.js';
import type { LineFn, ToonStyle } from '../kit.js';
type Pal = Partial<Record<FillKey, string | null>>;
void (0 as unknown as Pt | ToonStyle | LineFn);
const Skins: Record<string, Skin> = {};
  var tv = K.tv;
  var PAPER = '#f2f1ea';
  function paper(ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, PAPER, 1); }

  // ── pencil ────────────────────────────────────────────────────────────────
  var GRAPH: Pal = { side: null, body: PAPER, eyeWhite: PAPER, pupil: '#2a2a2a', glint: PAPER, brow: '#303030', mouth: '#353535',
    teeth: PAPER, tongue: '#9a9a9a', hand: PAPER, shadow: 'rgba(0,0,0,0.13)', tear: 'rgba(110,150,210,0.55)', blush: 'rgba(215,95,95,0.55)', heart: '#4a4a4a' };
  interface PencilOpts { ink?: string; colour?: Pal; sidesOnly?: boolean }
  function pencilStyle(S: Scene, o?: PencilOpts): ToonStyle {
    o = o || {};
    var rnd = K.rng(S.seed * 7919 + 1), u = S.unit, amp = u * 0.0042 * tv('pencil.wobble', 1), lw = u * 0.004 + 0.55, ink = o.ink || '#272727';
    return {
      lw: 0.004, ink: ink,
      fill: function (p) {
        if (p.fill === 'side') return 'rgba(40,40,40,' + ((1 - p.shade!) * 0.32 * tv('pencil.tone', 1)).toFixed(3) + ')';
        if (o.colour && p.fill && o.colour[p.fill]) return o.colour[p.fill];
        return GRAPH[p.fill!] || null;
      },
      pre: function (c, p, S) {
        if (p.role !== 'front' || tv('pencil.hatch', 1) < 0.05) return;
        var A = K.sceneOf(S, p);
        if (o.sidesOnly) { A.facets.forEach(function (f) { if (f.shade! < 0.55) K.hatch(c, f.pts, { angle: -0.95, gap: Math.max(2.2, u * 0.018), width: lw * 0.55, color: ink, alpha: 0.4, rnd: rnd }); }); return; }
        K.hatch(c, A.sil,{ angle: -0.95, gap: Math.max(2.2, u * 0.018 / tv('pencil.hatch', 1)), width: lw * 0.55, color: ink, alpha: 0.45, rnd: rnd });
      },
      texture: function (c, p) {
        if (p.fill === 'brow' || p.fill === 'pupil') K.hatch(c, p.pts, { angle: 0.7, gap: Math.max(1.5, u * 0.006), width: lw * 0.5, color: '#000', alpha: 0.5, rnd: rnd });
      },
      line: function (c, pts, closed, p) {
        if (p.role === 'burst') { c.strokeStyle = ink; c.lineWidth = lw; K.path(c, pts, false); c.stroke(); return; }
        K.sketch(c, pts, { closed: closed, rnd: rnd, amp: amp, width: lw * (p.lw || 1), color: ink, passes: p.fat ? 1 : 2, over: closed ? 0 : 0.12, step: Math.max(4, u * 0.022) });
      }
    };
  }
  Skins.pencil = {
    name: 'pencil', label: 'Pencil', group: 'drawn', about: 'Graphite on cartridge paper. The line boils on twos.',
    fps: 12, hold: 'skin', ground: { css: PAPER, draw: paper },
    params: [['pencil.wobble', 'Wobble', 0, 3, 1], ['pencil.hatch', 'Hatching', 0, 2, 1], ['pencil.tone', 'Tone', 0, 2, 1]],
    draw: function (S: Scene, ctx: Ctx2D) { K.toon(S, ctx, pencilStyle(S)); }
  };

  // ── sketch: flat colour under the pencil, a little off register ───────────
  var FLAT: Pal = { side: '#e9b949', body: '#f6d365', eyeWhite: '#fffdf5', pupil: '#2a2a2a', brow: '#5b3a1e', mouth: '#7a2630', teeth: '#fff', tongue: '#ef6f7b', hand: '#f08a5d', shadow: 'rgba(0,0,0,0.1)', tear: '#7fb7e6', blush: '#f28b82', heart: '#e94f64', glint: '#fff' };
  Skins.sketch = {
    name: 'sketch', label: 'Sketch', group: 'drawn', about: 'Flat colour under a pencil line, slipped off register.',
    fps: 12, hold: 'skin', ground: { css: PAPER, draw: paper },
    draw: function (S: Scene, ctx: Ctx2D) {
      var off = S.unit * 0.018;
      ctx.save(); ctx.translate(off, off * 0.6);
      K.toon(S, ctx, { fill: function (p) { return p.fill === 'side' ? K.shadeHex(FLAT.side!, p.shade!) : FLAT[p.fill!] || null; }, noLines: function () { return true; }, skip: function (p) { return !!p.line; } });
      ctx.restore();
      K.toon(S, ctx, pencilStyle(S, { sidesOnly: true, colour: { body: 'rgba(0,0,0,0)', eyeWhite: 'rgba(0,0,0,0)', hand: 'rgba(0,0,0,0)', teeth: 'rgba(0,0,0,0)', glint: '#fff', tongue: 'rgba(0,0,0,0)' } }));
    }
  };

  // ── ballpoint: blue biro on a ruled page ─────────────────────────────────
  Skins.ballpoint = {
    name: 'ballpoint', label: 'Ballpoint', group: 'drawn', about: 'A blue biro in the margin of a ruled exercise book.',
    fps: 12, hold: 'skin',
    ground: { css: '#fbfbf6', draw: function (ctx: Ctx2D, w: number, h: number) {
      K.paper(ctx, w, h, '#fbfbf6', 0.6); var g = Math.max(12, h / 22);
      ctx.strokeStyle = 'rgba(80,130,200,0.35)'; ctx.lineWidth = 1;
      for (var y = g * 1.5; y < h; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(220,80,80,0.45)'; ctx.beginPath(); ctx.moveTo(w * 0.08, 0); ctx.lineTo(w * 0.08, h); ctx.stroke();
    } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var rnd = K.rng(S.seed * 31 + 5), u = S.unit, lw = u * 0.003 + 0.5, ink = '#1f3a9e';
      K.toon(S, ctx, {
        fill: function (p) {
          if (p.fill === 'side') return null;
          return ({ body: '#fbfbf6', eyeWhite: '#fbfbf6', hand: '#fbfbf6', teeth: '#fbfbf6', glint: '#fbfbf6', pupil: ink, brow: ink, mouth: '#283e86', tongue: '#7d8fd0', shadow: 'rgba(31,58,158,0.12)', tear: 'rgba(31,58,158,0.3)', blush: 'rgba(31,58,158,0.18)', heart: ink } as Pal)[p.fill!] || null;
        },
        pre: function (c, p, S) {
          if (p.role !== 'front') return;
          var A = K.sceneOf(S, p);
          K.hatch(c, A.sil, { angle: -0.9, gap: Math.max(2, u * 0.014), width: lw * 0.6, color: ink, alpha: 0.6, rnd: rnd });
          A.facets.forEach(function (f) { if (f.shade! < 0.32) K.hatch(c, f.pts, { angle: 0.6, gap: Math.max(2, u * 0.016), width: lw * 0.5, color: ink, alpha: 0.5, rnd: rnd }); });
        },
        line: function (c, pts, closed, p) { K.sketch(c, pts, { closed: closed, rnd: rnd, amp: u * 0.003, width: lw * (p.lw || 1), color: ink, passes: p.fat ? 1 : 3, over: 0.2, step: Math.max(4, u * 0.02), alpha: 0.9 }); }
      });
    }
  };

  // ── felt-tip: chunky marker, streaky fills, a fat black line ─────────────
  Skins.felttip = {
    name: 'felttip', label: 'Felt-tip', group: 'drawn', about: 'Kids’ markers: streaky, over the lines, a fat black outline.',
    fps: 8, hold: 'skin', ground: { css: '#f6f4ee', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#f6f4ee', 0.7); } },
    params: [['felttip.hue', 'Body colour', 0, 360, 150]],
    draw: function (S: Scene, ctx: Ctx2D) {
      var rnd = K.rng(S.seed * 101 + 3), u = S.unit, hue = tv('felttip.hue', 150);
      var col: Pal = { body: 'hsl(' + hue + ',70%,45%)', side: 'hsl(' + (hue + 50) + ',70%,40%)', hand: '#e2412f', pupil: '#111', brow: '#111', mouth: '#7a1020', teeth: '#fff', eyeWhite: '#fff', glint: '#fff', tongue: '#f26d7d', tear: '#3fa7ff', blush: '#ff6f91', heart: '#ff2e63', shadow: 'rgba(0,0,0,0.12)' };
      var streak = function (c: Ctx2D, poly: Pt[], color: string, ang: number) { K.hatch(c, poly, { angle: ang, gap: u * 0.022, width: u * 0.03, color: color, alpha: 0.85, rnd: rnd }); };
      K.toon(S, ctx, {
        lw: 0.011, ink: '#111',
        fill: function (p) { return (p.fill === 'body' || p.fill === 'side' || p.fill === 'hand') ? null : col[p.fill!] || null; },
        texture: function (c, p) {
          if (p.fill === 'body') streak(c, p.pts, col.body!, -0.5);
          else if (p.fill === 'side') { streak(c, p.pts, col.side!, 0.4); }
          else if (p.fill === 'hand') streak(c, p.pts, col.hand!, 1.2);
        },
        line: function (c, pts, closed, p) { K.sketch(c, pts, { closed: closed, rnd: rnd, amp: u * 0.004, width: u * 0.009 * (p.lw || 1) + 1, color: '#111', passes: 1, step: Math.max(5, u * 0.03), alpha: 0.95 }); }
      });
    }
  };

  // ── ink bleed: watercolour washes that run past an ink line ──────────────
  Skins.inkbleed = {
    name: 'inkbleed', label: 'Ink bleed', group: 'drawn', about: 'Wet watercolour that won’t stay inside a dip-pen line.',
    fps: 6, hold: 'skin', ground: { css: '#f7f3ea', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#f7f3ea', 1.4); } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var rnd = K.rng(S.seed * 13 + 9), u = S.unit;
      var washes = ['#2d6cdf', '#20a39e', '#f4a259', '#5b8e7d', '#bc4b51', '#8cb369'];
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.filter = 'blur(' + Math.max(1, u * 0.012).toFixed(1) + 'px)';
      K.actorsOf(S).forEach(function (A) {
      var b = A.body;
      K.withClip(ctx, A.sil.map(function (q): Pt { return [q[0] + (q[0] - b.cx) * 0.06, q[1] + (q[1] - b.cy) * 0.06]; }), function () {
        for (var i = 0; i < 7; i++) {
          ctx.fillStyle = K.rgba(washes[i % washes.length]!, 0.45);
          ctx.beginPath(); ctx.arc(b.x + rnd() * b.w, b.y + rnd() * b.h, A.unit * (0.18 + rnd() * 0.25), 0, K.TAU); ctx.fill();
        }
      });
      (['handL', 'handR'] as const).forEach(function (k) { var hh = A[k]; if (!hh) return; ctx.fillStyle = K.rgba(washes[k === 'handL' ? 4 : 2]!, 0.6); ctx.beginPath(); ctx.arc(hh.x + u * 0.01, hh.y, hh.r * 0.6, 0, K.TAU); ctx.fill(); });
      });
      ctx.restore();
      K.toon(S, ctx, {
        fill: function (p) { return ({ pupil: '#1b1b2f', brow: '#1b1b2f', mouth: '#3a1c2c', tongue: '#d9667a', eyeWhite: 'rgba(255,255,255,0.85)', teeth: '#fff', glint: '#fff', shadow: 'rgba(40,40,80,0.12)', tear: 'rgba(45,108,223,0.5)', heart: '#bc4b51', blush: 'rgba(230,90,100,0.4)' } as Pal)[p.fill!] || null; },
        line: function (c, pts, closed, p) { K.sketch(c, pts, { closed: closed, rnd: rnd, amp: u * 0.003, width: (u * 0.004 + 0.6) * (p.lw || 1), color: '#1b1b2f', passes: 1, step: 5, over: 0.1 }); }
      });
    }
  };

  // ── ink punch: brush and black ink, no greys ─────────────────────────────
  Skins.inkpunch = {
    name: 'inkpunch', label: 'Ink punch', group: 'drawn', about: 'A loaded brush. Solid blacks, no greys, a splatter or two.',
    fps: 8, hold: 'skin', ground: { css: '#f4f1e8', draw: function (ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#f4f1e8', 0.5); } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var rnd = K.rng(S.seed * 17 + 2), u = S.unit;
      K.toon(S, ctx, {
        fill: function (p) {
          if (p.fill === 'side') return p.shade! < 0.42 ? '#0d0d0d' : '#f4f1e8';
          return ({ body: '#f4f1e8', hand: '#f4f1e8', eyeWhite: '#f4f1e8', pupil: '#0d0d0d', brow: '#0d0d0d', mouth: '#0d0d0d', teeth: '#f4f1e8', tongue: '#f4f1e8', glint: '#f4f1e8', shadow: '#0d0d0d', tear: '#f4f1e8', heart: '#0d0d0d', blush: null } as Pal)[p.fill!] || null;
        },
        line: function (c, pts, closed, p) {
          var q = K.wobble(K.resample(pts, 5, closed), u * 0.002, rnd);
          var w = u * 0.016 * (p.lw || 1) * (p.fat ? 1 : 0.8);
          K.brush(c, q, w * 0.25, w, '#0d0d0d', closed);
        }
      });
      ctx.fillStyle = '#0d0d0d';
      for (var i = 0; i < 9; i++) { var b = S.body; ctx.beginPath(); ctx.arc(b.x - b.w * 0.2 + rnd() * b.w * 1.4, b.y - b.h * 0.1 + rnd() * b.h * 1.2, u * 0.004 * (1 + rnd() * 3), 0, K.TAU); ctx.fill(); }
    }
  };

  // ── gloss: a lit, glossy 3D form ─────────────────────────────────────────
  Skins.gloss = {
    name: 'gloss', label: 'Gloss', group: 'drawn', about: 'A lit, glossy 3D form: vinyl toy under a softbox.',
    fps: 30, hold: { redraw: true },
    ground: { css: '#dfe5ea', draw: function (ctx: Ctx2D, w: number, h: number) {
      var g = ctx.createRadialGradient(w / 2, h * 0.4, 10, w / 2, h * 0.5, Math.max(w, h) * 0.7);
      g.addColorStop(0, '#f4f7fa'); g.addColorStop(1, '#b9c4ce'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    } },
    params: [['gloss.hue', 'Colour', 0, 360, 200]],
    draw: function (S: Scene, ctx: Ctx2D) {
      var u = S.unit, hue = tv('gloss.hue', 200), base = 'hsl(' + hue + ',35%,88%)';
      K.toon(S, ctx, {
        fill: function (p) {
          if (p.fill === 'side') return 'hsl(' + hue + ',30%,' + (35 + p.shade! * 50).toFixed(0) + '%)';
          if (p.fill === 'shadow') return 'rgba(30,40,60,0.28)';
          if (p.fill === 'hand') return 'hsl(' + hue + ',25%,94%)';
          return ({ body: base, eyeWhite: '#fff', pupil: '#1a2230', glint: '#fff', brow: '#2a3140', mouth: '#4a1d2a', teeth: '#fff', tongue: '#e46a7f', tear: 'rgba(120,180,255,0.7)', blush: 'rgba(255,120,140,0.5)', heart: '#ff4d6d' } as Pal)[p.fill!] || null;
        },
        pre: function (c, p) { if (p.role === 'shadow') c.filter = 'blur(' + (u * 0.03).toFixed(1) + 'px)'; else c.filter = 'none'; },
        texture: function (c, p) {
          if (p.role === 'front') {
            var b = K.bbox(p.pts), g = c.createLinearGradient(b.x, b.y, b.x + b.w * 0.4, b.y + b.h);
            g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.35, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(0,20,40,0.18)');
            c.fillStyle = g; K.path(c, p.pts, true); c.fill();
            c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(b.x + b.w * 0.25, b.y + b.h * 0.12, b.w * 0.16, b.h * 0.04, -0.15, 0, K.TAU); c.fill();
          }
          if (p.fill === 'hand') { var hb = K.bbox(p.pts), hg = c.createRadialGradient(hb.x + hb.w * 0.3, hb.y + hb.h * 0.3, 1, hb.cx, hb.cy, hb.w); hg.addColorStop(0, 'rgba(255,255,255,0.7)'); hg.addColorStop(1, 'rgba(0,0,0,0.15)'); c.fillStyle = hg; K.path(c, p.pts, true); c.fill(); }
        },
        lw: 0.004, ink: 'rgba(20,30,45,0.55)',
        noLines: function (p) { return p.role === 'sil' || p.role === 'front' || p.role === 'split-side'; }
      });
      ctx.filter = 'none';
    }
  };
export const pencil: Skin = Skins.pencil!;
export const sketch: Skin = Skins.sketch!;
export const ballpoint: Skin = Skins.ballpoint!;
export const felttip: Skin = Skins.felttip!;
export const inkbleed: Skin = Skins.inkbleed!;
export const inkpunch: Skin = Skins.inkpunch!;
export const gloss: Skin = Skins.gloss!;

