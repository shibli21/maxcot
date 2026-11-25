// skins/cartoon.ts: CARTOON. Rubber-hose 1930s film, flat vector,
// claymation and an anime cel.
import K from '../kit.js';
import type { Ctx2D, FillKey, Pt, Scene, Skin } from '../types.js';

type Pal = Partial<Record<FillKey, string | null>>;
const Skins: Record<string, Skin> = {};
const offset = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((q): Pt => [q[0] + dx, q[1] + dy]);

// ── rubberhose: a scratched 1930s cartoon reel ─────────────────────────────
const HOSE: Pal = {
  body: '#1c1a17', side: '#0d0c0a', hand: '#f4efe2', eyeWhite: '#f4efe2', pupil: '#0d0c0a', glint: '#f4efe2', brow: '#0d0c0a',
  mouth: '#0d0c0a', teeth: '#f4efe2', tongue: '#6b6257', shadow: 'rgba(0,0,0,0.35)', tear: '#f4efe2', blush: null, heart: '#f4efe2'
};
Skins.rubberhose = {
  name: 'rubberhose', label: 'Rubber hose', group: 'cartoon', about: 'A 1930s cartoon reel: black-and-white ink, pie-cut eyes, white gloves, flicker, dust and scratches.',
  fps: 12, hold: { redraw: true },
  ground: { css: '#e8dfc8', draw: function (ctx: Ctx2D, w: number, h: number, t: number) {
    var f = Math.floor(t * 12), rnd = K.rng(f * 13 + 1), flick = 0.93 + rnd() * 0.07;
    ctx.fillStyle = 'rgb(' + Math.round(232 * flick) + ',' + Math.round(223 * flick) + ',' + Math.round(200 * flick) + ')'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#cfc3a4'; ctx.fillRect(0, h * 0.74, w, h * 0.26);
    ctx.strokeStyle = '#1c1a17'; ctx.lineWidth = Math.max(2, h * 0.006); ctx.beginPath(); ctx.moveTo(0, h * 0.74); ctx.lineTo(w, h * 0.74); ctx.stroke();
  } },
  draw: function (S: Scene, ctx: Ctx2D, view) {
    var u = S.unit, f = Math.floor(view.t * 12), rnd = K.rng(f * 7 + 3);
    K.toon(S, ctx, {
      lw: 0.016, ink: '#0d0c0a',
      fill: function (p) { return K.paint(HOSE, p); },
      texture: function (c, p) {
        // pie-cut pupils: a wedge of light cut out of each
        if (p.fill === 'pupil') { var b = K.bbox(p.pts); c.fillStyle = '#f4efe2'; c.beginPath(); c.moveTo(b.cx, b.cy); c.arc(b.cx, b.cy, Math.max(b.w, b.h) * 0.6, -1.9, -1.2); c.closePath(); c.fill(); }
        if (p.role === 'front') { var fb = K.bbox(p.pts); c.fillStyle = '#e9dcc0'; c.beginPath(); c.ellipse(fb.cx, fb.cy + fb.h * 0.08, fb.w * 0.4, fb.h * 0.38, 0, 0, K.TAU); c.fill(); }
      },
      skip: function (p) { return p.role === 'glint'; },
      line: function (c, pts, closed, p) { K.brush(c, K.resample(pts, 4, closed), u * 0.006, u * 0.016 * (p.lw || 1) * (p.fat ? 1.2 : 1), '#0d0c0a', closed); }
    });
    // the reel: sepia, dust, a scratch or two, and a burnt vignette
    var W = view.w, H = view.h;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(190,150,90,0.25)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    for (var i = 0; i < 14; i++) { ctx.fillStyle = rnd() < 0.5 ? 'rgba(20,18,15,0.55)' : 'rgba(250,245,230,0.6)'; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 0.5 + rnd() * 2.2, 0, K.TAU); ctx.fill(); }
    if (rnd() < 0.6) { var sx = rnd() * W; ctx.strokeStyle = 'rgba(250,245,230,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + (rnd() - 0.5) * 20, H); ctx.stroke(); }
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,12,4,0.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
};

// ── flatvector: no lines, bold flat shapes and a long cast shadow ──────────
const FLAT: Pal = {
  body: '#6c5ce7', side: '#4834d4', hand: '#fdcb6e', eyeWhite: '#ffffff', pupil: '#2d3436', glint: '#ffffff', brow: '#2d3436',
  mouth: '#2d3436', teeth: '#ffffff', tongue: '#ff7675', shadow: null, tear: '#74b9ff', blush: '#fd79a8', heart: '#ff7675'
};
Skins.flatvector = {
  name: 'flatvector', label: 'Flat vector', group: 'cartoon', about: 'Flat vector illustration: no outlines, bold flat shapes and a long shadow at 45 degrees.',
  fps: 12, hold: 'skin', params: [['flat.hue', 'Colour', 0, 360, 248]],
  ground: { css: '#ffeaa7', draw: function (ctx: Ctx2D, w: number, h: number) {
    ctx.fillStyle = '#ffeaa7'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fab1a0'; ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, Math.min(w, h) * 0.38, 0, K.TAU); ctx.fill();
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit, hue = K.tv('flat.hue', 248), body = 'hsl(' + hue + ',73%,63%)', side = 'hsl(' + hue + ',65%,52%)';
    // the long shadow: the silhouette smeared down and to the right
    // drawn opaque into a buffer and laid down once, so the overlapping copies don't build up
    var sb = K.buffer('flatshadow' + S.key, Math.ceil(S.w), Math.ceil(S.h)), sc = sb.ctx;
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, S.w, S.h); sc.fillStyle = '#000';
    K.actorsOf(S).forEach(function (A) { for (var k = 1; k <= 24; k++) { K.path(sc, offset(A.sil, k * u * 0.025, k * u * 0.025), true); sc.fill(); } });
    ctx.save(); ctx.globalAlpha = 0.14; ctx.drawImage(sb.canvas, 0, 0); ctx.restore();
    K.toon(S, ctx, {
      fill: function (p) {
        if (p.fill === 'body') return body;
        if (p.fill === 'side') return (p.shade ?? 0.5) > 0.5 ? body : side;
        return K.paint(FLAT, p);
      },
      noLines: function (p) { return !(p.line && (p.fill === 'brow' || p.role === 'mouth-line' || p.role === 'eye-line' || p.role === 'lash' || p.role === 'brow')); },
      lw: 0.012, ink: '#2d3436',
      skip: function (p) { return p.role === 'shadow'; }
    });
  }
};

// ── clay: plasticine under a warm lamp, thumbprints and all ────────────────
const CLAY: Pal = {
  body: '#e07a3f', side: '#b85a28', hand: '#f2c14e', eyeWhite: '#f8f4ea', pupil: '#2a1f1a', glint: '#ffffff', brow: '#2a1f1a',
  mouth: '#5a1f1a', teeth: '#f8f4ea', tongue: '#d9534f', shadow: 'rgba(40,25,10,0.35)', tear: '#8fd0ff', blush: '#e8706a', heart: '#d9534f'
};
Skins.clay = {
  name: 'clay', label: 'Claymation', group: 'cartoon', about: 'Plasticine under a warm lamp: soft rounded light, thumbprints, and a model nudged every frame.',
  fps: 8, hold: 'skin',
  ground: { css: '#c9b99a', draw: function (ctx: Ctx2D, w: number, h: number) {
    var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d8cbb0'); g.addColorStop(0.7, '#c9b99a'); g.addColorStop(1, '#a8977a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); K.paper(ctx, w, h, 'rgba(0,0,0,0)', 1);
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit, rnd = K.rng(S.seed * 5 + 3);
    // the animator's nudge between frames
    ctx.save(); ctx.translate((rnd() - 0.5) * u * 0.008, (rnd() - 0.5) * u * 0.006);
    K.toon(S, ctx, {
      fill: function (p) { return K.paint(CLAY, p); },
      pre: function (c, p) { c.filter = p.role === 'shadow' ? 'blur(' + (u * 0.025).toFixed(1) + 'px)' : 'none'; },
      texture: function (c, p) {
        if (!p.fill || p.line || p.role === 'shadow') return;
        var b = K.bbox(p.pts); c.save(); K.path(c, p.pts, true); c.clip();
        // lit from the top left, rounded into shadow
        var g = c.createRadialGradient(b.x + b.w * 0.3, b.y + b.h * 0.25, 1, b.cx, b.cy, Math.max(b.w, b.h) * 0.85);
        g.addColorStop(0, 'rgba(255,240,220,0.4)'); g.addColorStop(0.55, 'rgba(255,240,220,0)'); g.addColorStop(1, 'rgba(40,20,5,0.3)');
        c.fillStyle = g; c.fillRect(b.x, b.y, b.w, b.h);
        // thumbprints
        if (p.fill === 'body' || p.fill === 'side' || p.fill === 'hand') {
          var pr = K.rng(Math.round(b.x * 3 + b.y * 7)); c.strokeStyle = 'rgba(60,30,10,0.12)'; c.lineWidth = Math.max(0.6, u * 0.002);
          for (var i = 0; i < 5; i++) { var x = b.x + pr() * b.w, y = b.y + pr() * b.h; for (var r = 1; r < 5; r++) { c.beginPath(); c.arc(x, y, r * u * 0.008, pr() * 3, pr() * 3 + 2.2); c.stroke(); } }
        }
        c.restore();
      },
      lw: 0.006, ink: 'rgba(60,30,10,0.45)',
      noLines: function (p) { return !p.line; }
    });
    ctx.filter = 'none'; ctx.restore();
  }
};

// ── animecel: crisp coloured line, a hard cel shadow, sparkling eyes ───────
const CEL: Pal = {
  body: '#fbe3d4', side: '#e7b9a2', hand: '#fbe3d4', eyeWhite: '#ffffff', pupil: '#3d2c6b', glint: '#ffffff', brow: '#5b3a2e',
  mouth: '#a63d4a', teeth: '#ffffff', tongue: '#ef6f7f', shadow: 'rgba(80,90,160,0.25)', tear: '#9fd8ff', blush: 'rgba(255,110,130,0.5)', heart: '#ff5d7a'
};
Skins.animecel = {
  name: 'animecel', label: 'Anime cel', group: 'cartoon', about: 'A TV anime cel: thin coloured line, two-tone cel shading, sparkling eyes over a painted sky.',
  fps: 12, hold: 'skin',
  ground: { css: '#8ec5ff', draw: function (ctx: Ctx2D, w: number, h: number) {
    var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5aa8f0'); g.addColorStop(1, '#cfe8ff'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    var rnd = K.rng(19); ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (var i = 0; i < 5; i++) { var cx = rnd() * w, cy = h * (0.1 + rnd() * 0.45), r = Math.min(w, h) * (0.04 + rnd() * 0.05); for (var k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(cx + (k - 2) * r * 0.9, cy + Math.abs(k - 2) * r * 0.25, r * (1.1 - Math.abs(k - 2) * 0.2), 0, K.TAU); ctx.fill(); } }
  } },
  draw: function (S: Scene, ctx: Ctx2D) {
    var u = S.unit;
    K.toon(S, ctx, {
      lw: 0.008, ink: '#5b3a2e',
      fill: function (p) { return p.fill === 'side' ? ((p.shade ?? 0.5) > 0.55 ? CEL.body! : CEL.side!) : K.paint(CEL, p); },
      texture: function (c, p) {
        if (p.role === 'front') {
          var b = K.bbox(p.pts); c.save(); K.path(c, p.pts, true); c.clip();
          c.fillStyle = '#e7b9a2'; c.beginPath(); c.moveTo(b.x + b.w * 0.78, b.y - 5); c.bezierCurveTo(b.x + b.w * 0.6, b.y + b.h * 0.4, b.x + b.w * 0.75, b.y + b.h * 0.7, b.x + b.w * 0.6, b.y + b.h + 5); c.lineTo(b.x + b.w + 5, b.y + b.h + 5); c.lineTo(b.x + b.w + 5, b.y - 5); c.fill();
          c.restore();
        }
        if (p.fill === 'pupil') {
          // a gradient iris with two highlights
          var pb = K.bbox(p.pts), g = c.createLinearGradient(0, pb.y, 0, pb.y + pb.h); g.addColorStop(0, '#2a1d4f'); g.addColorStop(1, '#7a68c9');
          c.fillStyle = g; K.path(c, p.pts, true); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(pb.cx - pb.w * 0.18, pb.cy - pb.h * 0.2, pb.w * 0.2, 0, K.TAU); c.fill();
          c.beginPath(); c.arc(pb.cx + pb.w * 0.2, pb.cy + pb.h * 0.22, pb.w * 0.09, 0, K.TAU); c.fill();
        }
      },
      line: function (c, pts, closed, p) { c.strokeStyle = p.fill === 'pupil' ? '#2a1d4f' : '#5b3a2e'; c.lineWidth = u * 0.008 * (p.lw || 1) * (p.fat ? 1.3 : 1); c.lineJoin = 'round'; c.lineCap = 'round'; K.path(c, pts, closed); c.stroke(); }
    });
  }
};

export const rubberhose: Skin = Skins.rubberhose!;
export const flatvector: Skin = Skins.flatvector!;
export const clay: Skin = Skins.clay!;
export const animecel: Skin = Skins.animecel!;
