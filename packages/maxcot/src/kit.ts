// kit.ts: the shared toolkit. Maths, seeded noise, path helpers and the
// generic "toon" renderer that most skins build on. Pure code, no assets.
import type { Box, Buffer, CanvasLike, Ctx2D, FillKey, Part, Pt, Rnd, Scene } from './types.js';

export interface SketchOptions {
  rnd?: Rnd; passes?: number; step?: number; closed?: boolean; amp?: number; freq?: number;
  over?: number; color?: string; alpha?: number; width?: number;
}
export interface HatchOptions { angle?: number; gap?: number; rnd?: Rnd; color?: string; width?: number; alpha?: number }
export interface HalftoneOptions { cell?: number; angle?: number; color?: string; size?: number | ((x: number, y: number) => number) }
export type LineFn = (ctx: Ctx2D, pts: Pt[], closed: boolean, part: Part) => void;

/** How K.toon paints a Scene. Every hook is optional. */
export interface ToonStyle {
  /** Line weight as a share of the scene unit. */
  lw?: number;
  ink?: string;
  guideInk?: string;
  fill?(part: Part): string | null | undefined;
  line?: LineFn;
  texture?(ctx: Ctx2D, part: Part, S: Scene): void;
  pre?(ctx: Ctx2D, part: Part, S: Scene): void;
  skip?(part: Part): boolean;
  noLines?(part: Part): boolean;
  noUnion?: boolean;
  before?(ctx: Ctx2D, S: Scene): void;
  after?(ctx: Ctx2D, S: Scene): void;
}
export type Palette = Partial<Record<FillKey, string | null>>;

const TAU = Math.PI * 2;
const BUF: Record<string, Buffer> = {};
const grain: Record<string, CanvasLike> = {};

function mid(a: Pt, b: Pt): Pt { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }

export const K = {
  // ── maths ────────────────────────────────────────────────────────────────
  TAU,
  clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; },
  lerp(a: number, b: number, t: number): number { return a + (b - a) * t; },
  smooth(t: number): number { t = K.clamp(t, 0, 1); return t * t * (3 - 2 * t); },
  ease(t: number): number { t = K.clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },

  /** mulberry32: a tiny seeded PRNG so every "boil" of a line is repeatable. */
  rng(seed: number): Rnd {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  hash(n: number): number { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); },
  /** Smooth 1D value noise, -1..1. */
  noise(x: number, seed?: number): number {
    const i = Math.floor(x), f = x - i, s = (seed || 0) * 17.17;
    const a = K.hash(i + s), b = K.hash(i + 1 + s);
    return (K.lerp(a, b, K.smooth(f)) - 0.5) * 2;
  },
  strHash(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; },

  // ── colour ───────────────────────────────────────────────────────────────
  hex(h: string): [number, number, number] { h = h.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; },
  rgba(h: string, a?: number): string { const c = K.hex(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a == null ? 1 : a) + ')'; },
  mixHex(h1: string, h2: string, t: number): string {
    const a = K.hex(h1), b = K.hex(h2);
    return 'rgb(' + Math.round(K.lerp(a[0], b[0], t)) + ',' + Math.round(K.lerp(a[1], b[1], t)) + ',' + Math.round(K.lerp(a[2], b[2], t)) + ')';
  },
  shadeHex(h: string, s: number): string { return s < 0.5 ? K.mixHex('#000000', h, 0.35 + s * 1.3) : K.mixHex(h, '#ffffff', (s - 0.5) * 0.9); },

  // ── geometry ─────────────────────────────────────────────────────────────
  bbox(pts: Pt[]): Box {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  },
  area(pts: Pt[]): number { let a = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i]!, q = pts[(i + 1) % n]!; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; },
  /** Monotone chain convex hull. */
  hull(pts: Pt[]): Pt[] {
    const p: Pt[] = pts.map((q): Pt => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: Pt[] = [], up: Pt[] = [];
    for (let i = 0; i < p.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, p[i]!) <= 0) lo.pop(); lo.push(p[i]!); }
    for (let i = p.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, p[i]!) <= 0) up.pop(); up.push(p[i]!); }
    up.pop(); lo.pop(); return lo.concat(up);
  },
  resample(pts: Pt[], step: number, closed?: boolean): Pt[] {
    const out: Pt[] = [], n = pts.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i]!, b = pts[(i + 1) % n]!, dx = b[0] - a[0], dy = b[1] - a[1];
      const k = Math.max(1, Math.ceil(Math.hypot(dx, dy) / step));
      for (let j = 0; j < k; j++) out.push([a[0] + dx * j / k, a[1] + dy * j / k]);
    }
    if (!closed) { const last = pts[n - 1]!; out.push([last[0], last[1]]); }
    return out;
  },
  /** Low-frequency wobble along a line: a hand that isn't a ruler. */
  wobble(pts: Pt[], amp: number, rnd: Rnd, freq?: number): Pt[] {
    const ph = rnd() * 100, f = freq || 0.08, s = rnd() * 50;
    return pts.map((p, i): Pt => [p[0] + K.noise(i * f + ph, s) * amp, p[1] + K.noise(i * f + ph + 33, s) * amp]);
  },

  // ── paths ────────────────────────────────────────────────────────────────
  path(ctx: Ctx2D, pts: Pt[], closed?: boolean): void {
    ctx.beginPath(); if (!pts.length) return;
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    if (closed) ctx.closePath();
  },
  smoothPath(ctx: Ctx2D, pts: Pt[], closed?: boolean): void {
    ctx.beginPath(); const n = pts.length; if (n < 3) { K.path(ctx, pts, closed); return; }
    if (closed) {
      const m0 = mid(pts[n - 1]!, pts[0]!); ctx.moveTo(m0[0], m0[1]);
      for (let i = 0; i < n; i++) { const m = mid(pts[i]!, pts[(i + 1) % n]!); ctx.quadraticCurveTo(pts[i]![0], pts[i]![1], m[0], m[1]); }
      ctx.closePath();
    } else {
      ctx.moveTo(pts[0]![0], pts[0]![1]);
      for (let j = 1; j < n - 1; j++) { const mm = mid(pts[j]!, pts[j + 1]!); ctx.quadraticCurveTo(pts[j]![0], pts[j]![1], mm[0], mm[1]); }
      ctx.lineTo(pts[n - 1]![0], pts[n - 1]![1]);
    }
  },
  withClip(ctx: Ctx2D, pts: Pt[], fn: () => void): void { ctx.save(); K.path(ctx, pts, true); ctx.clip(); fn(); ctx.restore(); },

  /** A pressure-varying brush stroke, drawn as a filled ribbon. */
  brush(ctx: Ctx2D, pts: Pt[], w0: number, w1: number, color: string, closed?: boolean): void {
    if (pts.length < 2) return;
    const P = closed ? pts.concat([pts[0]!]) : pts, L: Pt[] = [], R: Pt[] = [], n = P.length;
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)]!, b = P[Math.min(n - 1, i + 1)]!, dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const t = i / (n - 1), w = K.lerp(w0, w1, Math.sin(t * Math.PI)) / 2, p = P[i]!;
      L.push([p[0] - dy / d * w, p[1] + dx / d * w]); R.push([p[0] + dy / d * w, p[1] - dx / d * w]);
    }
    ctx.fillStyle = color; K.smoothPath(ctx, L.concat(R.reverse()), true); ctx.fill();
  },

  /** Sketchy line: several light passes, each wobbled and a little over-shot. */
  sketch(ctx: Ctx2D, pts: Pt[], o: SketchOptions = {}): void {
    const rnd = o.rnd || Math.random, passes = o.passes || 2;
    const src = K.resample(pts, o.step || 6, !!o.closed);
    if (o.closed) src.push([src[0]![0], src[0]![1]]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let p = 0; p < passes; p++) {
      const q = K.wobble(src, o.amp == null ? 1.6 : o.amp, rnd, o.freq);
      if (o.over) {                        // overshoot both ends like a real stroke
        const a = q[0]!, b = q[1]!, y = q[q.length - 1]!, z = q[q.length - 2]!, ov = o.over * (0.5 + rnd());
        q.unshift([a[0] + (a[0] - b[0]) * ov, a[1] + (a[1] - b[1]) * ov]);
        q.push([y[0] + (y[0] - z[0]) * ov, y[1] + (y[1] - z[1]) * ov]);
      }
      ctx.strokeStyle = o.color || '#222'; ctx.globalAlpha = (o.alpha || 0.85) * (p ? 0.6 : 1);
      ctx.lineWidth = (o.width || 1.5) * (p ? 0.7 : 1);
      K.smoothPath(ctx, q, false); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  /** Parallel hatching clipped to a polygon. */
  hatch(ctx: Ctx2D, poly: Pt[], o: HatchOptions = {}): void {
    const bb = K.bbox(poly), ang = o.angle == null ? -0.8 : o.angle, gap = Math.max(1.5, o.gap || 5);
    const rnd = o.rnd || Math.random, r = Math.hypot(bb.w, bb.h) / 2 + 4;
    K.withClip(ctx, poly, function () {
      ctx.strokeStyle = o.color || '#333'; ctx.lineWidth = o.width || 1; ctx.globalAlpha = o.alpha || 0.7; ctx.lineCap = 'round';
      const c = Math.cos(ang), s = Math.sin(ang);
      for (let d = -r; d <= r; d += gap) {
        const j = (rnd() - 0.5) * gap * 0.5, x0 = bb.cx + (-r) * c - (d + j) * s, y0 = bb.cy + (-r) * s + (d + j) * c;
        const x1 = bb.cx + r * c - (d + j) * s, y1 = bb.cy + r * s + (d + j) * c;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 3, (y0 + y1) / 2 + (rnd() - 0.5) * 3, x1, y1); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    });
  },

  /** Halftone dots clipped to a polygon; size(x, y) returns 0..1 coverage. */
  halftone(ctx: Ctx2D, poly: Pt[], o: HalftoneOptions): void {
    const bb = K.bbox(poly), cell = Math.max(2, o.cell || 6), ang = o.angle || 0.26, c = Math.cos(ang), s = Math.sin(ang);
    const r = Math.hypot(bb.w, bb.h) / 2 + cell;
    K.withClip(ctx, poly, function () {
      ctx.fillStyle = o.color || '#000';
      for (let u = -r; u <= r; u += cell) for (let v = -r; v <= r; v += cell) {
        const x = bb.cx + u * c - v * s, y = bb.cy + u * s + v * c;
        const k = typeof o.size === 'function' ? o.size(x, y) : (o.size == null ? 0.5 : o.size);
        if (k <= 0.02) continue;
        ctx.beginPath(); ctx.arc(x, y, cell * 0.55 * Math.sqrt(k), 0, TAU); ctx.fill();
      }
    });
  },

  // ── canvases: injectable, so the renderer also runs in workers and Node ──
  createCanvas(w: number, h: number): CanvasLike {
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    throw new Error('maxcot: no canvas available. Call setCanvasFactory((w, h) => canvas) first.');
  },
  /** Supply canvases yourself: OffscreenCanvas in a worker, skia-canvas or @napi-rs/canvas in Node. */
  setCanvasFactory(fn: (w: number, h: number) => object): void { K.createCanvas = fn as (w: number, h: number) => CanvasLike; },

  // ── per-skin dials (the Tune panel); skins read them with K.tv(key, fallback) ──
  tune: {} as Record<string, number | string>,
  tv<T extends number | string>(k: string, d: T): T { return (k in K.tune ? K.tune[k] : d) as T; },

  // ── offscreen buffers (reused, keyed) ────────────────────────────────────
  buffer(key: string, w: number, h: number): Buffer {
    let b = BUF[key];
    if (!b) {
      // a wrapper, never properties on the canvas itself: some canvas implementations (Node) are sealed
      const c = K.createCanvas(w, h) as HTMLCanvasElement;
      b = BUF[key] = { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) as Ctx2D };
    }
    if (b.canvas.width !== w || b.canvas.height !== h) { b.canvas.width = w; b.canvas.height = h; }
    return b;
  },

  /** Paper grain, made once and tiled. */
  paper(ctx: Ctx2D, w: number, h: number, tint: string, amt?: number): void {
    const key = tint + (amt || 1);
    let g = grain[key];
    if (!g) {
      g = grain[key] = K.createCanvas(256, 256);
      const c = g.getContext('2d') as Ctx2D, rnd = K.rng(7); c.fillStyle = tint; c.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600 * (amt || 1); i++) {
        const a = rnd() * 0.05; c.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,255,255,' + a * 2 + ')';
        c.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
      }
    }
    ctx.save(); ctx.fillStyle = ctx.createPattern(g, 'repeat') as CanvasPattern; ctx.fillRect(0, 0, w, h); ctx.restore();
  },

  // ── the generic toon renderer ────────────────────────────────────────────
  /** Walks a Scene and lets a style decide colours, textures and lines. */
  toon(S: Scene, ctx: Ctx2D, st: ToonStyle): void {
    const parts = S.parts, lw = (st.lw || 0.012) * S.unit;
    const line: LineFn = st.line || function (c, pts, closed, part) {
      c.strokeStyle = part.ink || st.ink || '#111'; c.lineWidth = (part.lw || 1) * lw; c.lineJoin = 'round'; c.lineCap = 'round';
      K.path(c, pts, closed); c.stroke();
    };
    const fillOf = (part: Part) => (st.fill ? st.fill(part) : null);
    if (st.before) st.before(ctx, S);
    for (const p of parts) {
      if (p.role === 'guide' && !S.guides) continue;
      if (st.pre) st.pre(ctx, p, S);
      if (st.skip && st.skip(p)) continue;
      if (p.group && p.groupStart) { drawGroup(ctx, S, p.group, fillOf, line, st); continue; }
      if (p.group) continue;
      const f = fillOf(p);
      const draw = function () {
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
  },

  /** The scene of the actor a part belongs to (a merged scene keeps one per actor). */
  sceneOf(S: Scene, p: Part): Scene { return (S.actors && p.actor != null && S.actors[p.actor]) || S; },
  /** Every actor's own scene: just [S] for a single actor. */
  actorsOf(S: Scene): Scene[] { return S.actors || [S]; },

  /** Palette lookup most colour skins share: shaded fills for body, sides and hands. */
  paint(pal: Palette, part: Part): string | null {
    const c = part.fill ? pal[part.fill] : undefined; if (c == null) return null;
    if (part.shade != null && (part.fill === 'body' || part.fill === 'side' || part.fill === 'hand')) return K.shadeHex(c, part.shade);
    return c;
  }
};

function drawGroup(ctx: Ctx2D, S: Scene, g: string, fillOf: (p: Part) => string | null | undefined, line: LineFn, st: ToonStyle): void {
  const ps = S.parts.filter((q) => q.group === g);
  if (!st.noUnion) {                      // outline the union: fat stroke first, then fills on top
    ctx.save(); ctx.lineJoin = 'round';
    ps.forEach((q) => { if (!q.line) line(ctx, q.pts, true, Object.assign({}, q, { lw: (q.lw || 1) * 2, fat: true })); });
    ctx.restore();
  }
  ps.forEach((q) => {
    const f = fillOf(q);
    if (f && !q.line) { ctx.fillStyle = f; K.path(ctx, q.pts, true); ctx.fill(); }
    if (st.texture && !q.line) st.texture(ctx, q, S);
    if (st.noUnion && !q.line) line(ctx, q.pts, true, q);
  });
  ps.forEach((q) => { if (q.line) line(ctx, q.pts, false, q); });
}

export type Kit = typeof K;
export default K;
