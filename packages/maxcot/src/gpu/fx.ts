// fx.ts: the effects layer. A skin opts in with `gpu: [passes]`; after it has
// drawn, the frame goes through those passes on the GPU (WebGL) and comes back
// onto the canvas. Where WebGL is missing (Node, a worker without it, a lost
// context) the same passes run as a cheaper Canvas 2D version, so a skin looks
// close to right everywhere and never fails to draw.
import K from '../kit.js';
import type { CanvasLike, Ctx2D, FxPass } from '../types.js';

export type { FxPass };

export interface FxOptions { t: number; key: string; seed: number }
export type FxMode = 'gpu' | '2d' | 'off';

/** Global switch, and what the last frame actually used. */
export const Fx = {
  /** Turn the effects layer off everywhere (skins then draw as they would without it). */
  enabled: true,
  /** Force the Canvas 2D version even where WebGL works. */
  forceFallback: false,
  /** 'gpu', '2d' or 'off': how the last frame was processed. */
  last: 'off' as FxMode
};

// ── WebGL ────────────────────────────────────────────────────────────────
const VERT = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const HEAD = 'precision mediump float; varying vec2 uv; uniform sampler2D tex; uniform sampler2D tex2; uniform vec2 px; uniform float a; uniform float b; uniform float c; uniform float t; uniform float seed;\n'
  + 'float hash(float n){ return fract(sin(n * 127.1 + seed * 31.7) * 43758.5453); }\n';
const FRAG: Record<string, string> = {
  copy: 'void main(){ gl_FragColor = texture2D(tex, uv); }',
  bright: 'void main(){ vec4 s = texture2D(tex, uv); float l = dot(s.rgb, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(s.rgb * smoothstep(a, a + 0.2, l), 1.0); }',
  // 9 taps along px * a (the direction and spread)
  blur: 'void main(){ vec2 d = px * a; vec4 s = texture2D(tex, uv) * 0.2270270270;'
    + ' s += (texture2D(tex, uv + d * 1.3846153846) + texture2D(tex, uv - d * 1.3846153846)) * 0.3162162162;'
    + ' s += (texture2D(tex, uv + d * 3.2307692308) + texture2D(tex, uv - d * 3.2307692308)) * 0.0702702703; gl_FragColor = s; }',
  add: 'void main(){ vec4 s = texture2D(tex, uv); gl_FragColor = vec4(s.rgb + texture2D(tex2, uv).rgb * a, s.a); }',
  feedback: 'void main(){ vec2 q = uv - 0.5; float cs = cos(c), sn = sin(c); q = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs) / b + 0.5;'
    + ' vec4 s = texture2D(tex, uv), h = texture2D(tex2, q) * a; gl_FragColor = vec4(max(s.rgb, h.rgb), 1.0); }',
  glitch: 'void main(){ float band = floor(uv.y * 24.0); float r = hash(band + floor(t * 12.0) * 7.0); vec2 q = uv;'
    + ' if (r < a * 0.5) q.x += (hash(band * 3.0 + t) - 0.5) * 0.12 * a;'
    + ' float off = px.x * 6.0 * a * (r < a ? 1.0 : 0.2);'
    + ' vec4 s = texture2D(tex, q); s.r = texture2D(tex, q + vec2(off, 0.0)).r; s.b = texture2D(tex, q - vec2(off, 0.0)).b;'
    + ' s.rgb *= 0.94 + 0.06 * sin(uv.y / px.y * 3.14159); gl_FragColor = s; }',
  chroma: 'void main(){ vec2 o = px * a; vec4 s = texture2D(tex, uv); s.r = texture2D(tex, uv + o).r; s.b = texture2D(tex, uv - o).b; gl_FragColor = s; }'
};

interface Target { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number }
interface GL {
  gl: WebGLRenderingContext; canvas: CanvasLike; progs: Record<string, WebGLProgram>; src: WebGLTexture;
  pool: Target[]; history: Map<string, Target>; buf: WebGLBuffer;
}
let G: GL | null | undefined;           // undefined: not tried yet; null: no WebGL here

function makeGL(): GL | null {
  try {
    const canvas = K.createCanvas(4, 4) as HTMLCanvasElement;
    const gl = canvas.getContext && (canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) as WebGLRenderingContext | null);
    if (!gl) return null;
    const compile = (type: number, srcText: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, srcText); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
    const vs = compile(gl.VERTEX_SHADER, VERT), progs: Record<string, WebGLProgram> = {};
    for (const k in FRAG) {
      const p = gl.createProgram()!; gl.attachShader(p, vs); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + FRAG[k]));
      gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
      progs[k] = p;
    }
    const buf = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const src = texture(gl, 4, 4);
    if (canvas.addEventListener) canvas.addEventListener('webglcontextlost', () => { G = null; });
    return { gl, canvas, progs, src, pool: [], history: new Map(), buf };
  } catch {
    return null;
  }
}
function texture(gl: WebGLRenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  return t;
}
function target(g: GL, w: number, h: number): Target {
  const gl = g.gl, tex = texture(gl, w, h), fb = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}
/** Run one shader from `a` (and `b` as tex2) into `out` (null: the canvas). */
function pass(g: GL, name: string, a: WebGLTexture, out: Target | null, w: number, h: number, u: { a?: number; b?: number; c?: number; px?: [number, number]; tex2?: WebGLTexture; t?: number; seed?: number }): void {
  const gl = g.gl, p = g.progs[name]!; gl.useProgram(p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null); gl.viewport(0, 0, w, h);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, a); gl.uniform1i(gl.getUniformLocation(p, 'tex'), 0);
  if (u.tex2) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, u.tex2); gl.uniform1i(gl.getUniformLocation(p, 'tex2'), 1); }
  const px = u.px || [1 / w, 1 / h];
  gl.uniform2f(gl.getUniformLocation(p, 'px'), px[0], px[1]);
  gl.uniform1f(gl.getUniformLocation(p, 'a'), u.a ?? 0); gl.uniform1f(gl.getUniformLocation(p, 'b'), u.b ?? 1); gl.uniform1f(gl.getUniformLocation(p, 'c'), u.c ?? 0);
  gl.uniform1f(gl.getUniformLocation(p, 't'), u.t ?? 0); gl.uniform1f(gl.getUniformLocation(p, 'seed'), u.seed ?? 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function runGL(g: GL, ctx: Ctx2D, passes: FxPass[], o: FxOptions): boolean {
  const gl = g.gl, cv = ctx.canvas as CanvasLike, w = cv.width, h = cv.height;
  if (g.canvas.width !== w || g.canvas.height !== h) { g.canvas.width = w; g.canvas.height = h; }
  // targets: two to ping-pong, two for blur, sized to this canvas
  g.pool = g.pool.filter((p) => p.w === w && p.h === h);
  while (g.pool.length < 4) g.pool.push(target(g, w, h));
  const [A, B, C, D] = g.pool as [Target, Target, Target, Target];
  gl.bindTexture(gl.TEXTURE_2D, g.src); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv as unknown as TexImageSource);
  let cur = g.src, dst = A, spare = B;
  const scale = h / 1080;                      // effect sizes are given for 1080p
  const next = () => { const t = dst; dst = spare; spare = t; cur = t.tex; };
  for (const p of passes) {
    if (p.type === 'blur') {
      const r = (p.radius ?? 1) * 3 * Math.max(0.5, scale);
      pass(g, 'blur', cur, C, w, h, { a: r, px: [1 / w, 0] }); pass(g, 'blur', C.tex, dst, w, h, { a: r, px: [0, 1 / h] }); next();
    } else if (p.type === 'bloom') {
      const r = (p.radius ?? 1) * 4 * Math.max(0.5, scale);
      pass(g, 'bright', cur, C, w, h, { a: p.threshold ?? 0.6 });
      for (let i = 0; i < 2; i++) { pass(g, 'blur', C.tex, D, w, h, { a: r * (i + 1), px: [1 / w, 0] }); pass(g, 'blur', D.tex, C, w, h, { a: r * (i + 1), px: [0, 1 / h] }); }
      pass(g, 'add', cur, dst, w, h, { a: p.strength ?? 1, tex2: C.tex }); next();
    } else if (p.type === 'feedback') {
      let hist = g.history.get(o.key);
      if (!hist || hist.w !== w || hist.h !== h) { hist = target(g, w, h); g.history.set(o.key, hist); pass(g, 'copy', cur, hist, w, h, {}); }
      pass(g, 'feedback', cur, dst, w, h, { a: p.amount ?? 0.85, b: p.zoom ?? 1.02, c: p.rotate ?? 0.01, tex2: hist.tex });
      pass(g, 'copy', dst.tex, hist, w, h, {}); next();
    } else if (p.type === 'glitch') {
      pass(g, 'glitch', cur, dst, w, h, { a: p.amount ?? 0.5, t: o.t, seed: o.seed % 97 }); next();
    } else if (p.type === 'chroma') {
      const off = (p.amount ?? 3) * Math.max(0.5, scale);
      pass(g, 'chroma', cur, dst, w, h, { a: off }); next();
    }
  }
  pass(g, 'copy', cur, null, w, h, {});
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(g.canvas as CanvasImageSource, 0, 0); ctx.restore();
  return !gl.isContextLost();
}

// ── Canvas 2D version: close enough, and it always works ─────────────────
const prev = new Map<string, { canvas: CanvasLike; ctx: Ctx2D }>();
function copyOf(ctx: Ctx2D, key: string): { canvas: CanvasLike; ctx: Ctx2D } {
  const cv = ctx.canvas as CanvasLike, b = K.buffer('fx2d-' + key, cv.width, cv.height);
  b.ctx.setTransform(1, 0, 0, 1, 0, 0); b.ctx.globalCompositeOperation = 'copy'; b.ctx.drawImage(cv as CanvasImageSource, 0, 0); b.ctx.globalCompositeOperation = 'source-over';
  return b;
}
function run2D(ctx: Ctx2D, passes: FxPass[], o: FxOptions): void {
  const cv = ctx.canvas as CanvasLike, w = cv.width, h = cv.height, scale = h / 1080;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const p of passes) {
    if (p.type === 'blur' || p.type === 'bloom') {
      const src = copyOf(ctx, o.key), r = (p.radius ?? 1) * (p.type === 'bloom' ? 10 : 3) * Math.max(0.5, scale);
      try { ctx.filter = 'blur(' + r.toFixed(1) + 'px)' + (p.type === 'bloom' ? ' brightness(' + (1 + (1 - (p.threshold ?? 0.6))).toFixed(2) + ')' : ''); } catch { /* no filters here */ }
      ctx.globalCompositeOperation = p.type === 'bloom' ? 'lighter' : 'copy'; ctx.globalAlpha = p.type === 'bloom' ? Math.min(1, (p.strength ?? 1) * 0.45) : 1;
      ctx.drawImage(src.canvas as CanvasImageSource, 0, 0);
      ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    } else if (p.type === 'feedback') {
      let hist = prev.get(o.key);
      if (hist && (hist.canvas.width !== w || hist.canvas.height !== h)) hist = undefined;
      if (hist) {
        const z = p.zoom ?? 1.02, rot = p.rotate ?? 0.01;
        ctx.globalCompositeOperation = 'lighten'; ctx.globalAlpha = p.amount ?? 0.85;
        ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.scale(z, z); ctx.translate(-w / 2, -h / 2);
        ctx.drawImage(hist.canvas as CanvasImageSource, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      const keep = K.buffer('fxhist-' + o.key, w, h);
      keep.ctx.setTransform(1, 0, 0, 1, 0, 0); keep.ctx.globalCompositeOperation = 'copy'; keep.ctx.drawImage(cv as CanvasImageSource, 0, 0); keep.ctx.globalCompositeOperation = 'source-over';
      prev.set(o.key, keep);
    } else if (p.type === 'glitch') {
      const src = copyOf(ctx, o.key), rnd = K.rng(o.seed * 13 + 5), a = p.amount ?? 0.5, bands = 24, bh = h / bands;
      for (let i = 0; i < bands; i++) if (rnd() < a * 0.5) { const dx = (rnd() - 0.5) * w * 0.12 * a; ctx.drawImage(src.canvas as CanvasImageSource, 0, i * bh, w, bh, dx, i * bh, w, bh); }
    }
    // chroma has no cheap 2D version: left out
  }
  ctx.restore();
}

/** Run a skin's passes over what is on the canvas now. Returns how it was done. */
export function applyFx(ctx: Ctx2D, passes: FxPass[] | undefined, o: FxOptions): FxMode {
  if (!passes || !passes.length || !Fx.enabled) return (Fx.last = 'off');
  if (!Fx.forceFallback) {
    if (G === undefined) G = makeGL();
    if (G) {
      try { if (runGL(G, ctx, passes, o)) return (Fx.last = 'gpu'); } catch { G = null; }
    }
  }
  run2D(ctx, passes, o);
  return (Fx.last = '2d');
}
/** Is WebGL available for the effects layer here? */
export function gpuAvailable(): boolean { if (G === undefined) G = makeGL(); return !!G; }
