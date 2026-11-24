// engine/kit.js: the shared toolkit. Maths, seeded noise, path helpers and
// the generic "toon" renderer that most skins build on. Pure code, no assets.
const K = {};

  // ── maths ────────────────────────────────────────────────────────────────
  K.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  K.lerp = function (a, b, t) { return a + (b - a) * t; };
  K.smooth = function (t) { t = K.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  K.ease = function (t) { t = K.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  K.TAU = Math.PI * 2;

  // mulberry32: a tiny seeded PRNG so every "boil" of a line is repeatable
  K.rng = function (seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  K.hash = function (n) { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  K.noise = function (x, seed) {           // smooth 1D value noise, -1..1
    var i = Math.floor(x), f = x - i, s = (seed || 0) * 17.17;
    var a = K.hash(i + s), b = K.hash(i + 1 + s);
    return (K.lerp(a, b, K.smooth(f)) - 0.5) * 2;
  };
  K.strHash = function (s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // ── colour ───────────────────────────────────────────────────────────────
  K.hex = function (h) { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  K.rgba = function (h, a) { var c = K.hex(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; };
  K.mixHex = function (h1, h2, t) {
    var a = K.hex(h1), b = K.hex(h2);
    return 'rgb(' + Math.round(K.lerp(a[0], b[0], t)) + ',' + Math.round(K.lerp(a[1], b[1], t)) + ',' + Math.round(K.lerp(a[2], b[2], t)) + ')';
  };
  K.shadeHex = function (h, s) { return s < 0.5 ? K.mixHex('#000000', h, 0.35 + s * 1.3) : K.mixHex(h, '#ffffff', (s - 0.5) * 0.9); };

  // ── geometry ─────────────────────────────────────────────────────────────
  K.bbox = function (pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < pts.length; i++) { var p = pts[i]; if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  K.area = function (pts) { var a = 0; for (var i = 0, n = pts.length; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  K.hull = function (pts) {               // monotone chain convex hull
    var p = pts.map(function (q) { return [q[0], q[1]]; }).sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (p.length < 3) return p;
    var cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lo = [], up = [], i;
    for (i = 0; i < p.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 0) lo.pop(); lo.push(p[i]); }
    for (i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 0) up.pop(); up.push(p[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  };
  K.resample = function (pts, step, closed) {
    var out = [], n = pts.length, segs = closed ? n : n - 1;
    for (var i = 0; i < segs; i++) {
      var a = pts[i], b = pts[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1];
      var k = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
      for (var j = 0; j < k; j++) out.push([a[0] + dx * j / k, a[1] + dy * j / k]);
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  };
  // low-frequency wobble along a line: a hand that isn't a ruler
  K.wobble = function (pts, amp, rnd, freq) {
    var ph = rnd() * 100, f = freq || 0.08, s = rnd() * 50;
    return pts.map(function (p, i) {
      return [p[0] + K.noise(i * f + ph, s) * amp, p[1] + K.noise(i * f + ph + 33, s) * amp];
    });
  };

  // ── paths ────────────────────────────────────────────────────────────────
  K.path = function (ctx, pts, closed) {
    ctx.beginPath(); if (!pts.length) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (closed) ctx.closePath();
  };
  K.smoothPath = function (ctx, pts, closed) {
    ctx.beginPath(); var n = pts.length; if (n < 3) { K.path(ctx, pts, closed); return; }
    if (closed) {
      var m0 = mid(pts[n - 1], pts[0]); ctx.moveTo(m0[0], m0[1]);
      for (var i = 0; i < n; i++) { var m = mid(pts[i], pts[(i + 1) % n]); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
      ctx.closePath();
    } else {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var j = 1; j < n - 1; j++) { var mm = mid(pts[j], pts[j + 1]); ctx.quadraticCurveTo(pts[j][0], pts[j][1], mm[0], mm[1]); }
      ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  };
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  K.withClip = function (ctx, pts, fn) { ctx.save(); K.path(ctx, pts, true); ctx.clip(); fn(); ctx.restore(); };

  // A pressure-varying brush stroke: drawn as a filled ribbon
  K.brush = function (ctx, pts, w0, w1, color, closed) {
    if (pts.length < 2) return;
    var P = closed ? pts.concat([pts[0]]) : pts, L = [], R = [], n = P.length;
    for (var i = 0; i < n; i++) {
      var a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      var t = i / (n - 1), w = K.lerp(w0, w1, Math.sin(t * Math.PI)) / 2;
      L.push([P[i][0] - dy / d * w, P[i][1] + dx / d * w]); R.push([P[i][0] + dy / d * w, P[i][1] - dx / d * w]);
    }
    ctx.fillStyle = color; K.smoothPath(ctx, L.concat(R.reverse()), true); ctx.fill();
  };

  // Sketchy line: several light passes, each wobbled and a little over-shot
  K.sketch = function (ctx, pts, o) {
    o = o || {}; var rnd = o.rnd || Math.random, passes = o.passes || 2;
    var src = K.resample(pts, o.step || 6, !!o.closed);
    if (o.closed) src.push(src[0].slice());
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var p = 0; p < passes; p++) {
      var q = K.wobble(src, o.amp == null ? 1.6 : o.amp, rnd, o.freq);
      if (o.over) {                        // overshoot both ends like a real stroke
        var a = q[0], b = q[1], y = q[q.length - 1], z = q[q.length - 2], ov = o.over * (0.5 + rnd());
        q.unshift([a[0] + (a[0] - b[0]) * ov, a[1] + (a[1] - b[1]) * ov]);
        q.push([y[0] + (y[0] - z[0]) * ov, y[1] + (y[1] - z[1]) * ov]);
      }
      ctx.strokeStyle = o.color || '#222'; ctx.globalAlpha = (o.alpha || 0.85) * (p ? 0.6 : 1);
      ctx.lineWidth = (o.width || 1.5) * (p ? 0.7 : 1);
      K.smoothPath(ctx, q, false); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  // Parallel hatching clipped to a polygon
  K.hatch = function (ctx, poly, o) {
    o = o || {}; var bb = K.bbox(poly), ang = o.angle == null ? -0.8 : o.angle, gap = Math.max(1.5, o.gap || 5);
    var rnd = o.rnd || Math.random, r = Math.hypot(bb.w, bb.h) / 2 + 4;
    K.withClip(ctx, poly, function () {
      ctx.strokeStyle = o.color || '#333'; ctx.lineWidth = o.width || 1; ctx.globalAlpha = o.alpha || 0.7; ctx.lineCap = 'round';
      var c = Math.cos(ang), s = Math.sin(ang);
      for (var d = -r; d <= r; d += gap) {
        var j = (rnd() - 0.5) * gap * 0.5, x0 = bb.cx + (-r) * c - (d + j) * s, y0 = bb.cy + (-r) * s + (d + j) * c;
        var x1 = bb.cx + r * c - (d + j) * s, y1 = bb.cy + r * s + (d + j) * c;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 3, (y0 + y1) / 2 + (rnd() - 0.5) * 3, x1, y1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  };

  // Halftone dots clipped to a polygon; size(x, y) returns 0..1 coverage
  K.halftone = function (ctx, poly, o) {
    var bb = K.bbox(poly), cell = Math.max(2, o.cell || 6), ang = o.angle || 0.26, c = Math.cos(ang), s = Math.sin(ang);
    var r = Math.hypot(bb.w, bb.h) / 2 + cell;
    K.withClip(ctx, poly, function () {
      ctx.fillStyle = o.color || '#000';
      for (var u = -r; u <= r; u += cell) for (var v = -r; v <= r; v += cell) {
        var x = bb.cx + u * c - v * s, y = bb.cy + u * s + v * c;
        var k = typeof o.size === 'function' ? o.size(x, y) : (o.size == null ? 0.5 : o.size);
        if (k <= 0.02) continue;
        ctx.beginPath(); ctx.arc(x, y, cell * 0.55 * Math.sqrt(k), 0, K.TAU); ctx.fill();
      }
    });
  };

  // ── canvases: injectable, so the renderer also runs in workers and Node ──
  K.createCanvas = function (w, h) {
    if (typeof document !== 'undefined') { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    throw new Error('maxcot: no canvas available. Call setCanvasFactory((w, h) => canvas) first.');
  };
  K.setCanvasFactory = function (fn) { K.createCanvas = fn; };

  // ── per-skin dials (Tune panel); skins read them with K.tv(key, fallback) ──
  K.tune = {};
  K.tv = function (k, d) { return k in K.tune ? K.tune[k] : d; };

  // ── offscreen buffers (reused, keyed) ────────────────────────────────────
  var BUF = {};
  K.buffer = function (key, w, h) {
    var b = BUF[key];
    if (!b) { b = BUF[key] = K.createCanvas(w, h); b.ctx = b.getContext('2d', { willReadFrequently: true }); }
    if (b.width !== w || b.height !== h) { b.width = w; b.height = h; }
    return b;
  };

  // paper grain, made once and tiled
  var grain = {};
  K.paper = function (ctx, w, h, tint, amt) {
    var key = tint + (amt || 1), g = grain[key];
    if (!g) {
      g = grain[key] = K.createCanvas(256, 256);
      var c = g.getContext('2d'), rnd = K.rng(7); c.fillStyle = tint; c.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 2600 * (amt || 1); i++) {
        var a = rnd() * 0.05; c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a * 2 + ')';
        c.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
      }
    }
    ctx.save(); ctx.fillStyle = ctx.createPattern(g, 'repeat'); ctx.fillRect(0, 0, w, h); ctx.restore();
  };

  // ── the generic toon renderer ────────────────────────────────────────────
  // Walks a Scene (see character.js) and lets a style decide colours and lines.
  // style: { fill(part) -> css|null, line(ctx, pts, closed, part), lw, ink, faceInk,
  //          noSil, noFacetFill, before(ctx,S), after(ctx,S) }
  K.toon = function (S, ctx, st) {
    var parts = S.parts, i, p, lw = (st.lw || 0.012) * S.unit;
    var line = st.line || function (c, pts, closed, part) {
      c.strokeStyle = part.ink || st.ink || '#111'; c.lineWidth = (part.lw || 1) * lw; c.lineJoin = 'round'; c.lineCap = 'round';
      K.path(c, pts, closed); c.stroke();
    };
    var fillOf = function (part) { return st.fill ? st.fill(part) : null; };
    if (st.before) st.before(ctx, S);
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p.role === 'guide' && !S.guides) continue;
      if (st.pre) st.pre(ctx, p, S);
      if (st.skip && st.skip(p)) continue;
      if (p.group && p.groupStart) { drawGroup(ctx, S, p.group, fillOf, line, st, lw); continue; }
      if (p.group) continue;
      var f = fillOf(p);
      var draw = function () {
        ctx.globalAlpha = p.alpha == null ? 1 : p.alpha;
        if (f && !p.line) {
          ctx.fillStyle = f; K.path(ctx, p.pts, true); ctx.fill();
          if (p.seam) { ctx.strokeStyle = f; ctx.lineWidth = 1; ctx.stroke(); }
        }
        if (st.texture && !p.line) st.texture(ctx, p, S);
        if (p.guide) {
          ctx.strokeStyle = st.guideInk || 'rgba(70,130,220,0.55)'; ctx.lineWidth = 1;
          K.path(ctx, p.pts, !!p.closed); ctx.stroke();
        } else if (p.stroke !== false && (p.line || p.edge) && !(st.noLines && st.noLines(p))) line(ctx, p.pts, p.line ? !!p.closed : true, p);
        ctx.globalAlpha = 1;
      };
      if (p.clip) K.withClip(ctx, p.clip, draw); else draw();
    }
    if (st.after) st.after(ctx, S);
  };
  function drawGroup(ctx, S, g, fillOf, line, st, lw) {
    var ps = S.parts.filter(function (q) { return q.group === g; });
    if (!st.noUnion) {                      // outline the union: fat stroke first, then fills on top
      ctx.save(); ctx.lineJoin = 'round';
      ps.forEach(function (q) {
        if (q.line) return;
        line(ctx, q.pts, true, Object.assign({}, q, { lw: (q.lw || 1) * 2, fat: true }));
      });
      ctx.restore();
    }
    ps.forEach(function (q) {
      var f = fillOf(q);
      if (f && !q.line) { ctx.fillStyle = f; K.path(ctx, q.pts, true); ctx.fill(); }
      if (st.texture && !q.line) st.texture(ctx, q, S);
      if (st.noUnion && !q.line) line(ctx, q.pts, true, q);
    });
    ps.forEach(function (q) { if (q.line) line(ctx, q.pts, false, q); });
  }

  // Default palette lookup most colour skins share
  K.paint = function (pal, part) {
    var c = pal[part.fill]; if (c == null) return null;
    if (part.shade != null && (part.fill === 'body' || part.fill === 'side' || part.fill === 'hand')) return K.shadeHex(c, part.shade);
    return c;
  };
export default K;
export { K };
