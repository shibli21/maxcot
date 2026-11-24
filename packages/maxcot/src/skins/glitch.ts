// engine/skins/glitch.js: GLITCH. Signal (the picture breaks) and time (frames leak into each other).
// Each one renders an ordinary skin into a buffer, then damages it.
import K from '../kit.js';
import type { Ctx2D, FillKey, Part, Pt, Scene, Skin, View } from '../types.js';
import type { LineFn, ToonStyle } from '../kit.js';
type Pal = Partial<Record<FillKey, string | null>>;
void (0 as unknown as Pt | ToonStyle | LineFn);
import * as drawn from './drawn.js';
import * as print from './print.js';
import * as screens from './screens.js';
const Skins: Record<string, Skin> = {};
  var tv = K.tv;
  var BY_NAME = Object.assign({}, drawn, print, screens, Skins);   // glitch skins damage other skins, chosen by name

  function inner(S: Scene, view: View, name: string, tag: string, ground?: boolean) {
    var buf = K.buffer(tag + S.key, S.w, S.h), c = buf.ctx, sk = BY_NAME[name] || drawn.pencil;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
    c.clearRect(0, 0, S.w, S.h);
    if (ground !== false) { if (sk.ground && sk.ground.draw) sk.ground.draw(c, S.w, S.h, view.t, K, view); else { c.fillStyle = (sk.ground && sk.ground.css) || '#fff'; c.fillRect(0, 0, S.w, S.h); } }
    c.save(); sk.draw(S, c, view); c.restore();
    return buf;
  }
  function paper(ctx: Ctx2D, w: number, h: number) { K.paper(ctx, w, h, '#f2f1ea', 1); }

  // ── glitch: RGB split and torn scan slices ───────────────────────────────
  Skins.glitch = {
    name: 'glitch', label: 'Glitch', group: 'signal', about: 'A dropped signal: channels split, scan lines tear sideways.',
    fps: 12, hold: 'skin', ground: { css: '#f2f1ea', draw: paper }, params: [['glitch.amount', 'Damage', 0, 2, 1]],
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var src = inner(S, view, tv('glitch.base', 'sketch'), 'g0', true), rnd = K.rng(S.seed * 97 + 1), u = S.unit, amt = tv('glitch.amount', 1);
      var sh = u * 0.025 * amt * (0.4 + rnd());
      ctx.drawImage(src.canvas, 0, 0);
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.6;
      var tint = function (col: string, dx: number) { var b = K.buffer('gt' + col + S.key, S.w, S.h), c = b.ctx; c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, S.w, S.h); c.drawImage(src.canvas, 0, 0); c.globalCompositeOperation = 'screen'; c.fillStyle = col; c.fillRect(0, 0, S.w, S.h); ctx.drawImage(b.canvas, dx, 0); };
      tint('#00ffff', -sh); tint('#ff00ff', sh * 0.7);
      ctx.restore();
      var n = 3 + (rnd() * 6 | 0) * amt;
      for (var i = 0; i < n; i++) { var y = rnd() * S.h, hh = u * (0.01 + rnd() * 0.06), dx = (rnd() - 0.5) * u * 0.3 * amt; ctx.drawImage(src.canvas, 0, y, S.w, hh, dx, y, S.w, hh); }
      if (rnd() < 0.3) { ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, rnd() * S.h, S.w, 2); }
    }
  };

  // ── datamosh: no keyframes, blocks slide on stale motion vectors ─────────
  Skins.datamosh = {
    name: 'datamosh', label: 'Datamosh', group: 'signal', about: 'The keyframes went missing. Blocks keep sliding along old motion vectors.',
    fps: 15, hold: { redraw: true }, ground: { css: '#f2f1ea', draw: paper },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var fresh = inner(S, view, tv('datamosh.base', 'felttip'), 'dm0', true), prev = K.buffer('dm1' + S.key, S.w, S.h), out = K.buffer('dm2' + S.key, S.w, S.h);
      var rnd = K.rng(S.seed * 31 + 7), bs = Math.max(8, Math.round(S.unit * 0.05)), key = (Math.floor(view.t / 2.2) !== prev.kf);
      var c = out.ctx; c.globalCompositeOperation = 'source-over';
      if (key || !prev.used) { c.drawImage(fresh.canvas, 0, 0); prev.kf = Math.floor(view.t / 2.2); prev.used = true; }
      else {
        c.drawImage(prev.canvas, 0, 0);
        var mvx = Math.sin(view.t * 1.3) * bs * 0.6, mvy = Math.cos(view.t * 0.9) * bs * 0.4;
        for (var y = 0; y < S.h; y += bs) for (var x = 0; x < S.w; x += bs) {
          var r = rnd(); if (r < 0.55) c.drawImage(prev.canvas, x - mvx * (0.5 + rnd()), y - mvy * (0.5 + rnd()), bs, bs, x, y, bs, bs);
          else if (r < 0.62) c.drawImage(fresh.canvas, x, y, bs, bs, x, y, bs, bs);
        }
      }
      prev.ctx.globalCompositeOperation = 'source-over'; prev.ctx.drawImage(out.canvas, 0, 0);
      ctx.drawImage(out.canvas, 0, 0);
    }
  };

  // ── databend: the bytes edited as if they were sound ─────────────────────
  Skins.databend = {
    name: 'databend', label: 'Databend', group: 'signal', about: 'The image bytes run through an audio editor: echoes, swapped channels, bit rot.',
    fps: 8, hold: 'skin', ground: { css: '#f2f1ea', draw: paper },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var src = inner(S, view, tv('databend.base', 'gloss'), 'db0', true), c = src.ctx, img = c.getImageData(0, 0, S.w, S.h), d = img.data, rnd = K.rng(S.seed * 7 + 3);
      var row = S.w * 4, n = 4 + (rnd() * 5 | 0);
      for (var i = 0; i < n; i++) {
        var y0 = (rnd() * S.h | 0), len = (S.unit * (0.02 + rnd() * 0.12) | 0) * row, start = y0 * row, kind = rnd();
        if (start + len >= d.length) continue;
        if (kind < 0.35) d.copyWithin(start, start + ((rnd() * 40 | 0) * 4) + 4, start + len);            // echo / shift
        else if (kind < 0.65) for (var j = start; j < start + len; j += 4) { var t = d[j]; d[j] = d[j + 2]; d[j + 2] = d[j + 1]; d[j + 1] = t; } // channel swap
        else for (var k = start; k < start + len; k += 4) { d[k] = d[k] & 0xE0; d[k + 1] = d[k + 1] ^ 0x5a; d[k + 2] = d[k + 2] & 0xC0; } // bit rot
      }
      ctx.putImageData(img, 0, 0);
    }
  };

  // ── feedback: a camera pointed at its own monitor ────────────────────────
  Skins.feedback = {
    name: 'feedback', label: 'Video feedback', group: 'signal', about: 'A camera pointed at its own monitor: the frame falls forever into itself.',
    fps: 30, hold: { redraw: true }, ground: { css: '#06040c', draw: function (ctx: Ctx2D, w: number, h: number) { ctx.fillStyle = '#06040c'; ctx.fillRect(0, 0, w, h); } },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var fb = K.buffer('fb' + S.key, S.w, S.h), tmp = K.buffer('fbt' + S.key, S.w, S.h), c = tmp.ctx;
      c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.fillStyle = '#06040c'; c.fillRect(0, 0, S.w, S.h);
      c.save(); c.globalAlpha = 0.93; c.filter = 'hue-rotate(24deg) saturate(1.4)';
      c.translate(S.w / 2, S.h / 2); c.rotate(0.03 * Math.sin(view.t * 0.4)); c.scale(1.045, 1.045); c.translate(-S.w / 2, -S.h / 2); c.drawImage(fb.canvas, 0, 0); c.restore();
      var fresh = inner(S, view, tv('feedback.base', 'neon'), 'fb0', false);
      c.drawImage(fresh.canvas, 0, 0);
      fb.ctx.globalCompositeOperation = 'source-over'; fb.ctx.drawImage(tmp.canvas, 0, 0);
      ctx.drawImage(tmp.canvas, 0, 0);
    }
  };

  // ── trails: a frozen 2001 desktop ────────────────────────────────────────
  Skins.trails = {
    name: 'trails', label: 'Window trails', group: 'time', about: 'A frozen 2001 desktop: a clean background that never repaints, so every frame stays.',
    fps: 20, hold: { redraw: true },
    ground: { css: '#3a6ea5', draw: function (ctx: Ctx2D, w: number, h: number) { ctx.fillStyle = '#3a6ea5'; ctx.fillRect(0, 0, w, h); } },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var buf = K.buffer('tr' + S.key, S.w, S.h), c = buf.ctx, u = S.unit, epoch = Math.floor(view.t / 7);
      if (buf.epoch !== epoch) { c.fillStyle = '#3a6ea5'; c.fillRect(0, 0, S.w, S.h); buf.epoch = epoch; }
      var dx = Math.sin(view.t * 1.1) * S.w * 0.16, dy = Math.sin(view.t * 1.7) * S.h * 0.05, b = S.body;
      c.save(); c.translate(dx, dy);
      var wx = b.x - u * 0.55, wy = b.y - u * 0.45, ww = b.w + u * 1.1, wh = b.h + u * 1.0, bar = Math.max(10, u * 0.07);
      c.fillStyle = '#d4d0c8'; c.fillRect(wx, wy, ww, wh); c.strokeStyle = '#fff'; c.strokeRect(wx + 0.5, wy + 0.5, ww - 1, wh - 1);
      var g = c.createLinearGradient(wx, 0, wx + ww, 0); g.addColorStop(0, '#0a246a'); g.addColorStop(1, '#a6caf0'); c.fillStyle = g; c.fillRect(wx + 3, wy + 3, ww - 6, bar);
      c.fillStyle = '#fff'; c.font = 'bold ' + Math.floor(bar * 0.62) + 'px Tahoma, sans-serif'; c.textBaseline = 'middle'; c.fillText('max.exe', wx + 8, wy + 3 + bar / 2);
      c.fillStyle = '#fff'; c.fillRect(wx + 4, wy + bar + 6, ww - 8, wh - bar - 10);
      drawn.sketch.draw(S, c, view);
      c.restore();
      ctx.drawImage(buf.canvas, 0, 0);
    }
  };

  // ── pixel wind: the figure blows away a pixel at a time ──────────────────
  Skins.pixelwind = {
    name: 'pixelwind', label: 'Pixel wind', group: 'time', about: 'A wind that takes the figure apart, a block at a time, off to the right.',
    fps: 24, hold: { redraw: true }, ground: { css: '#f2f1ea', draw: paper },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var src = inner(S, view, tv('pixelwind.base', 'pencil'), 'pw0', false), u = S.unit, b = S.body, amt = K.clamp(tv('pixelwind.wind', 0.3), 0, 1);
      var rnd = K.rng(1234), bs = Math.max(3, Math.round(u * 0.018)), t = view.t, cut = b.x + b.w * (1.15 - amt * 1.3);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cut, S.h); ctx.clip(); ctx.drawImage(src.canvas, 0, 0); ctx.restore();
      var N = 260 + amt * 900;
      for (var i = 0; i < N; i++) {
        var sx = b.x - u * 0.35 + rnd() * (b.w + u * 0.7), sy = b.y - u * 0.2 + rnd() * (b.h + u * 0.4), sp = 0.4 + rnd();
        if (sx < cut - u * 0.15 * rnd()) continue;
        var life = ((t * 0.6 * sp + rnd()) % 1), dx = life * u * (1.2 + amt * 2), dy = -life * u * 0.25 * (rnd() - 0.3);
        ctx.globalAlpha = 1 - life; ctx.drawImage(src.canvas, sx, sy, bs, bs, sx + dx, sy + dy, bs, bs);
      }
      ctx.globalAlpha = 1;
    }
  };

  // ── stylemosh: every band a different skin, reshuffled on the beat ───────
  Skins.stylemosh = {
    name: 'stylemosh', label: 'Style mosh', group: 'time', about: 'Bands of the frame stuck in different skins, reshuffled twice a second.',
    fps: 8, hold: 'skin', ground: { css: '#f2f1ea', draw: paper },
    draw: function (S: Scene, ctx: Ctx2D, view: View) {
      var pool = ['pencil', 'felttip', 'riso', 'hologram', 'inkpunch', 'gloss', 'manga', 'sketch'], bands = 5, b = S.body, u = S.unit;
      var y0 = b.y - u * 0.5, h = b.h + u * 1.1, step = Math.floor(view.t * 2);
      for (var i = 0; i < bands; i++) {
        var name = pool[(K.strHash('m' + i + ':' + step) >>> 0) % pool.length];
        var src = inner(S, Object.assign({}, view, { palette: 'rose' }), name, 'sm' + i, true), ya = i === 0 ? 0 : y0 + h * i / bands, yb = i === bands - 1 ? S.h : y0 + h * (i + 1) / bands;
        var dx = (K.hash(i + step * 7) - 0.5) * u * 0.08;
        ctx.drawImage(src.canvas, 0, ya, S.w, yb - ya, dx, ya, S.w, yb - ya);
      }
    }
  };
export const glitch: Skin = Skins.glitch!;
export const datamosh: Skin = Skins.datamosh!;
export const databend: Skin = Skins.databend!;
export const feedback: Skin = Skins.feedback!;
export const trails: Skin = Skins.trails!;
export const pixelwind: Skin = Skins.pixelwind!;
export const stylemosh: Skin = Skins.stylemosh!;

