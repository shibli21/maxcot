// engine/skins/screens.js: SCREENS AND LIGHT. Made of light, not ink.
import K from '../kit.js';
import type { Ctx2D, FillKey, Palette, Part, Pt, Scene, Skin, View } from '../types.js';
import type { LineFn, ToonStyle } from '../kit.js';
type Pal = Partial<Record<FillKey, string | null>>;
void (0 as unknown as Pt | ToonStyle | LineFn);
const Skins: Record<string, Skin> = {};
  var tv = K.tv;
  function bufferOf(S: Scene, name: string, w?: number, h?: number) { return K.buffer(name + S.key, w || S.w, h || S.h); }
  function strokeAll(ctx: Ctx2D, S: Scene, filter?: (p: Part) => boolean) {
    S.parts.forEach(function (p) {
      if (p.role === 'guide' || p.role === 'shadow' || (filter && !filter(p))) return;
      if (p.line || p.edge || p.fill === 'hand' || p.fill === 'pupil') { K.path(ctx, p.pts, p.line ? !!p.closed : true); ctx.stroke(); }
    });
  }

  // ── hologram ─────────────────────────────────────────────────────────────
  var PALETTES: Palette[] = [
    { name: 'cyan', label: 'Cyan beam', value: ['#3ff4ff', '#0a8fa8'] },
    { name: 'green', label: 'Green beam', value: ['#5dff8a', '#11873c'] },
    { name: 'amber', label: 'Amber beam', value: ['#ffc24a', '#a8610a'] },
    { name: 'red', label: 'Red laser', value: ['#ff3b3b', '#9a0d16'] },
    { name: 'blue', label: 'Deep blue', value: ['#5b8cff', '#1b2fa8'] },
    { name: 'white', label: 'Ghost white', value: ['#f4f8ff', '#7e8aa3'] },
    { name: 'foil', label: 'Security foil: green and violet', value: ['#6dffb0', '#b06dff', 'foil'] },
    { name: 'rose', label: 'Foil: rose and gold', value: ['#ff5fa8', '#ffd24a', 'foil'] }
  ];
  var PAL: Record<string, Palette> = {}; PALETTES.forEach(function (p) { PAL[p.name] = p; });
  function stars(ctx: Ctx2D, w: number, h: number, seed: number) {
    var rnd = K.rng(seed); ctx.fillStyle = '#fff';
    for (var i = 0; i < 90; i++) { ctx.globalAlpha = rnd() * 0.6; ctx.fillRect(rnd() * w, rnd() * h, 1.2, 1.2); }
    ctx.globalAlpha = 1;
  }
  Skins.hologram = {
    name: 'hologram', label: 'Hologram', group: 'screens', about: 'A projected volume: scan lines, a lit grid and a base ring, in one of eight beams.',
    fps: 24, hold: { redraw: true }, palettes: PALETTES,
    ground: { css: '#03060c', draw: function (ctx: Ctx2D, w: number, h: number, t: number, K2: unknown, view: View) {
      var c = (PAL[view.palette!] || PALETTES[0]!).value, g = ctx.createRadialGradient(w / 2, h * 0.75, 10, w / 2, h * 0.6, Math.max(w, h) * 0.7);
      g.addColorStop(0, K.rgba(c[1], 0.35)); g.addColorStop(1, '#020408'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); stars(ctx, w, h, 3);
    } },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var P = PAL[view.palette!] || PALETTES[0]!, c0 = P.value[0]!, c1 = P.value[1]!, foil = P.value[2] === 'foil', u = S.unit, t = view.t, b = S.body;
      var flick = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 13), grad: string | CanvasGradient = c0;
      if (foil) { var lg = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h); lg.addColorStop(0, c0); lg.addColorStop(0.5 + 0.3 * Math.sin(t), c1); lg.addColorStop(1, c0); grad = lg; }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = flick;
      // per actor: base projector rings, a beam and the lit volume
      K.actorsOf(S).forEach(function (A) {
      var sh = A.parts.find(function (p) { return p.role === 'shadow'; }) || A.parts[0]!, sb = K.bbox(sh.pts), b = A.body, u = A.unit;
      for (var r = 0; r < 4; r++) { ctx.strokeStyle = K.rgba(c0, 0.5 - r * 0.1); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sb.cx, sb.cy, sb.w * (0.25 + r * 0.14), sb.h * (0.25 + r * 0.14), 0, 0, K.TAU); ctx.stroke(); }
      var beam = ctx.createLinearGradient(0, sb.cy, 0, b.y); beam.addColorStop(0, K.rgba(c0, 0.18)); beam.addColorStop(1, K.rgba(c0, 0));
      ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(sb.x + sb.w * 0.2, sb.cy); ctx.lineTo(b.x - u * 0.05, b.y); ctx.lineTo(b.x + b.w + u * 0.05, b.y); ctx.lineTo(sb.x + sb.w * 0.8, sb.cy); ctx.fill();
      // volume
      ctx.fillStyle = foil ? grad : K.rgba(c0, 0.08); ctx.globalAlpha = flick * (foil ? 0.18 : 1); K.path(ctx, A.sil, true); ctx.fill(); ctx.globalAlpha = flick;
      });
      ctx.shadowColor = c0; ctx.shadowBlur = u * 0.04; ctx.strokeStyle = foil ? grad : K.rgba(c0, 0.55); ctx.lineWidth = Math.max(1, u * 0.003);
      S.mesh.forEach(function (m) { K.path(ctx, m.pts, false); ctx.stroke(); });
      ctx.lineWidth = Math.max(1.2, u * 0.006); ctx.strokeStyle = foil ? grad : c0;
      strokeAll(ctx, S);
      S.parts.forEach(function (p) { if (p.fill === 'pupil' || p.fill === 'brow' || p.fill === 'heart') { ctx.fillStyle = K.rgba(c0, 0.6); K.path(ctx, p.pts, true); ctx.fill(); } });
      ctx.shadowBlur = 0;
      // scan lines and a tear
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (var y = (t * 40) % 4; y < S.h; y += 4) ctx.fillRect(0, y, S.w, 1.5);
      if (Math.sin(t * 3.1) > 0.93) { var ty = b.y + ((t * 300) % b.h); ctx.drawImage(ctx.canvas, b.x, ty, b.w, u * 0.03, b.x + u * 0.04, ty, b.w, u * 0.03); }
      ctx.restore();
    }
  };

  // ── wireframe: vector monitor, 1983 ──────────────────────────────────────
  Skins.wireframe = {
    name: 'wireframe', label: 'Vector wireframe', group: 'screens', about: 'Green vectors on black: every plane a mesh, a grid floor to the horizon.',
    fps: 24, hold: { redraw: true },
    ground: { css: '#000', draw: function (ctx: Ctx2D, w: number, h: number, t: number) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      var hz = h * 0.62; ctx.strokeStyle = 'rgba(60,255,120,0.35)'; ctx.lineWidth = 1;
      for (var i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * w * 0.02, hz); ctx.lineTo(w / 2 + i * w * 0.18, h); ctx.stroke(); }
      for (var k = 0; k < 10; k++) { var y = hz + (h - hz) * Math.pow((k + (t * 0.5 % 1)) / 10, 2); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var u = S.unit; ctx.save(); ctx.strokeStyle = '#3cff78'; ctx.shadowColor = '#3cff78'; ctx.shadowBlur = u * 0.02; ctx.lineWidth = Math.max(1, u * 0.0035);
      S.mesh.forEach(function (m) { K.path(ctx, m.pts, false); ctx.stroke(); });
      S.facets.forEach(function (f) { K.path(ctx, f.pts, true); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1; });
      strokeAll(ctx, S); ctx.restore();
    }
  };

  // ── neon: tubes on a brick wall ──────────────────────────────────────────
  Skins.neon = {
    name: 'neon', label: 'Neon', group: 'screens', about: 'Bent glass tubes on a back-alley brick wall. One of them flickers.',
    fps: 24, hold: { redraw: true },
    ground: { css: '#120c1c', draw: function (ctx: Ctx2D, w: number, h: number) {
      ctx.fillStyle = '#140d1f'; ctx.fillRect(0, 0, w, h); var bh = Math.max(10, h / 18), bw = bh * 2.6;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      for (var r = 0, y = 0; y < h; r++, y += bh) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); for (var x = (r % 2) * bw / 2; x < w; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); } }
    } },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var u = S.unit, t = view.t, off = Math.sin(t * 23) > 0.96;
      var tube = function (color: string, filter: (p: Part) => boolean, dim?: boolean) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = ctx.lineCap = 'round';
        ctx.strokeStyle = color; ctx.globalAlpha = dim ? 0.25 : 1; ctx.shadowColor = color; ctx.shadowBlur = u * 0.07; ctx.lineWidth = u * 0.014; strokeAll(ctx, S, filter);
        ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = u * 0.004; strokeAll(ctx, S, filter); ctx.restore();
      };
      var isFace = function (p: Part) { return /eye|pupil|lid|brow|mouth|teeth|tongue|lash|split|heart|tear|blush|glint/.test(p.role); };
      tube('#ff2fa8', function (p: Part) { return p.role === 'sil' || p.role === 'front' || p.role === 'split-side'; });
      tube('#29e6ff', isFace, off);
      tube('#ffd23f', function (p: Part) { return p.fill === 'hand' || p.role === 'hand-line' || p.role === 'burst' || p.role === 'zzz'; });
    }
  };

  // ── oscilloscope: one beam, phosphor persistence ─────────────────────────
  Skins.oscilloscope = {
    name: 'oscilloscope', label: 'Oscilloscope', group: 'screens', about: 'A single green beam tracing the outline, with phosphor afterglow.',
    fps: 30, hold: { redraw: true },
    ground: { css: '#020a04', draw: function (ctx: Ctx2D, w: number, h: number) { ctx.fillStyle = '#020a04'; ctx.fillRect(0, 0, w, h); } },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var buf = bufferOf(S, 'scope'), c = buf.ctx, u = S.unit, t = view.t;
      c.globalCompositeOperation = 'source-over'; c.fillStyle = 'rgba(2,10,4,0.35)'; c.fillRect(0, 0, S.w, S.h);
      c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(80,255,120,0.9)'; c.shadowColor = '#50ff78'; c.shadowBlur = u * 0.03; c.lineWidth = Math.max(1, u * 0.004);
      S.parts.forEach(function (p, i) {
        if (p.role === 'guide' || p.role === 'shadow' || (!p.line && !p.edge && p.fill !== 'hand')) return;
        var q = K.resample(p.pts, 6, !p.line || p.closed).map(function (pt, j): Pt { return [pt[0] + Math.sin(j * 0.7 + t * 50 + i) * u * 0.002, pt[1] + Math.cos(j * 0.5 + t * 43) * u * 0.002]; });
        K.path(c, q, !p.line || p.closed); c.stroke();
      });
      c.restore();
      ctx.drawImage(buf.canvas, 0, 0);
      ctx.strokeStyle = 'rgba(80,255,120,0.12)'; ctx.lineWidth = 1;
      for (var gx = 0; gx <= 10; gx++) { ctx.beginPath(); ctx.moveTo(gx * S.w / 10, 0); ctx.lineTo(gx * S.w / 10, S.h); ctx.stroke(); }
      for (var gy = 0; gy <= 8; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * S.h / 8); ctx.lineTo(S.w, gy * S.h / 8); ctx.stroke(); }
    }
  };

  // ── teletext: 40 columns, 8 colours, sixel mosaics ───────────────────────
  var TT = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
  var TT_PAL = { body: '#ffff00', side: '#00ffff', hand: '#ff00ff', eyeWhite: '#ffffff', pupil: '#000000', glint: '#ffffff', brow: '#ff0000', mouth: '#ff0000', teeth: '#ffffff', tongue: '#ff00ff', shadow: '#0000ff', tear: '#00ffff', blush: '#ff00ff', heart: '#ff0000' };
  Skins.teletext = {
    name: 'teletext', label: 'Teletext', group: 'screens', about: 'Page 100. Forty columns, eight colours, 2×3 block graphics.',
    fps: 6, hold: 'skin', ground: { css: '#000', draw: function (ctx: Ctx2D, w: number, h: number) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); } },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var cols = 40, cw = S.w / cols, rows = Math.floor(S.h / (cw * 1.25)), ch = S.h / rows;
      var sw = cols * 2, shh = rows * 3, buf = bufferOf(S, 'ttx', sw, shh), c = buf.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, sw, shh);
      c.setTransform(sw / S.w, 0, 0, shh / S.h, 0, 0);
      K.toon(S, c, { lw: 0.02, ink: '#ffffff', fill: function (p) { return p.fill === 'side' ? (p.shade! > 0.5 ? '#00ffff' : '#0000ff') : TT_PAL[p.fill!] || null; } });
      c.setTransform(1, 0, 0, 1, 0, 0);
      var d = c.getImageData(0, 0, sw, shh).data, bw = cw / 2, bh = ch / 3;
      for (var y = 1; y < shh; y++) for (var x = 0; x < sw; x++) {
        var i = (y * sw + x) * 4, best = 0, bd = 1e9;
        for (var k = 0; k < 8; k++) { var e = Math.abs(d[i] - TT[k][0]) + Math.abs(d[i + 1] - TT[k][1]) + Math.abs(d[i + 2] - TT[k][2]); if (e < bd) { bd = e; best = k; } }
        if (!best) continue; ctx.fillStyle = 'rgb(' + TT[best] + ')'; ctx.fillRect(Math.floor(x * bw), Math.floor(y * bh), Math.ceil(bw) - (x % 2 ? 1 : 0), Math.ceil(bh) - 1);
      }
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S.w, ch);
      ctx.font = 'bold ' + Math.floor(ch * 0.8) + 'px monospace'; ctx.textBaseline = 'top';
      ctx.fillStyle = '#fff'; ctx.fillText('P100', cw, ch * 0.1); ctx.fillStyle = '#ff0'; ctx.fillText('STUDIO', cw * 7, ch * 0.1);
      var tm = new Date(); ctx.fillStyle = '#0ff'; ctx.fillText(('0' + tm.getHours()).slice(-2) + ':' + ('0' + tm.getMinutes()).slice(-2) + '/' + ('0' + tm.getSeconds()).slice(-2), S.w - cw * 9, ch * 0.1);
    }
  };

  // ── pixel: a 64-pixel-tall sprite, nearest-neighbour up ──────────────────
  var PX = { body: '#f0e9d2', side: '#a89f86', hand: '#f4b183', eyeWhite: '#ffffff', pupil: '#1a1c2c', glint: '#ffffff', brow: '#1a1c2c', mouth: '#5d275d', teeth: '#ffffff', tongue: '#b13e53', shadow: '#33405e', tear: '#41a6f6', blush: '#ef7d57', heart: '#b13e53' };
  Skins.pixel = {
    name: 'pixel', label: 'Pixel sprite', group: 'screens', about: 'A handheld-console sprite: 64 pixels tall, a 16-colour palette, hard edges.',
    fps: 8, hold: 'skin', params: [['pixel.res', 'Pixels tall', 24, 160, 64]],
    ground: { css: '#94b0c2', draw: function (ctx: Ctx2D, w: number, h: number) {
      ctx.fillStyle = '#94b0c2'; ctx.fillRect(0, 0, w, h); var c = Math.max(8, h / 16);
      ctx.fillStyle = '#87a2b6'; for (var y = 0; y < h; y += c) for (var x = (y / c % 2) * c; x < w; x += c * 2) ctx.fillRect(x, y, c, c);
    } },
    draw: function (S: Scene, ctx: Ctx2D) {
      var res = tv('pixel.res', 64) * (S.h / Math.max(S.h, S.unit * 1.85)) * 1.6, sc = S.h / res, sw = Math.max(8, Math.round(S.w / sc)), shh = Math.max(8, Math.round(S.h / sc));
      var buf = bufferOf(S, 'pix', sw, shh), c = buf.ctx;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, sw, shh); c.imageSmoothingEnabled = false;
      c.setTransform(sw / S.w, 0, 0, shh / S.h, 0, 0);
      K.toon(S, c, { lw: 0.012, ink: '#1a1c2c', fill: function (p) { return p.fill === 'side' ? (p.shade! > 0.45 ? '#a89f86' : '#6f6a5c') : PX[p.fill!] || null; } });
      c.setTransform(1, 0, 0, 1, 0, 0);
      var img = c.getImageData(0, 0, sw, shh), d = img.data;
      for (var i = 0; i < d.length; i += 4) d[i + 3] = d[i + 3] > 110 ? 255 : 0;
      c.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(buf.canvas, 0, 0, sw, shh, 0, 0, S.w, S.h); ctx.imageSmoothingEnabled = true;
    }
  };
export const hologram: Skin = Skins.hologram!;
export const wireframe: Skin = Skins.wireframe!;
export const neon: Skin = Skins.neon!;
export const oscilloscope: Skin = Skins.oscilloscope!;
export const teletext: Skin = Skins.teletext!;
export const pixel: Skin = Skins.pixel!;

