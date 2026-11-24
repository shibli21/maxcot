// stage.ts: several actors on one canvas, one camera, one skin.
//
//   const stage = createStage(canvas, { skin: pencil, cast: [
//     { id: 'max' }, { id: 'kid', who: 'child' }
//   ] });
//   stage.look('kid', 'max');        // kid turns to Max
//   stage.pose('max', 'wave');
//   stage.shot('close', 'kid');      // the camera finds the kid
//
// Each actor has a place on a floor: x across (in body units, 0 in the middle)
// and z into the picture (0 at the front). Every actor's scene is merged into
// one, so a skin paints the whole cast in a single pass and whole-frame effects
// (glitch, feedback, trails...) treat it as one picture.
import K from './kit.js';
import { Actor } from './rig.js';
import { camera, mergeScenes, paint, scene } from './character.js';
import type { Camera, CanvasLike, Ctx2D, Frame, Framing, Scene, Skin } from './types.js';

export interface StageMember {
  id: string;
  actor: Actor;
  /** Across the floor, in body units (about one body width apart is touching). */
  x: number;
  /** Into the picture: 0 at the front, 1 is about one body depth further back. */
  z: number;
  /** Another member's id, 'us' (the camera), or null (the actor's own gaze). */
  lookAt: string | null;
}
export interface StageCastSpec { id: string; who?: string; actor?: Actor; x?: number; z?: number; pose?: string }
/** 'wide' frames everyone (or the `on` group); the others frame one actor like a Character's camera. */
export type StageFraming = 'wide' | Framing;
export interface StageShot { frame: StageFraming; on?: string | string[] }

export interface StageOptions {
  skin: Skin;
  cast?: StageCastSpec[];
  palette?: string;
  guides?: boolean;
  key?: string;
  /** Run a requestAnimationFrame loop. Default true in browsers; pass false and call step(dt). */
  autoplay?: boolean;
}

const SPACING = 1.9;

/** A cast of actors sharing one canvas, one camera and one skin. */
export class Stage {
  canvas: CanvasLike;
  ctx: Ctx2D;
  skin: Skin;
  palette?: string;
  guides: boolean;
  key: string;
  members: StageMember[] = [];
  /** What the camera is framing; it eases there unless you cut(). */
  shotSpec: StageShot = { frame: 'wide' };
  /** Force a redraw on the next draw(). */
  dirty = true;
  /** The last merged scene drawn. */
  S: Scene | null = null;
  time = 0;
  private snapCam = true;
  private cams = new Map<string, Camera>();
  /** Member ids in the order of the last merged scene (far to near). */
  private order: string[] = [];
  private last = -1;
  private raf = 0;
  private lastNow = 0;

  constructor(canvas: CanvasLike, o: StageOptions) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d') as Ctx2D;
    this.skin = o.skin; this.palette = o.palette; this.guides = !!o.guides;
    this.key = o.key || ('stage' + Math.random().toString(36).slice(2, 8));
    (o.cast || []).forEach((c) => this.add(c));
    const auto = o.autoplay == null ? typeof requestAnimationFrame === 'function' : o.autoplay;
    if (auto) this.start();
  }

  // ── the cast ───────────────────────────────────────────────────────────
  /** Add an actor. Without x it stands to the right of the others. */
  add(c: StageCastSpec): Actor {
    if (this.has(c.id)) throw new Error("maxcot stage: there is already an actor called '" + c.id + "'");
    const actor = c.actor || new Actor({ who: c.who || c.id, t: this.time });
    if (c.pose) actor.pose(c.pose).snap();
    const x = c.x != null ? c.x : this.members.length ? Math.max(...this.members.map((m) => m.x)) + SPACING : 0;
    this.members.push({ id: c.id, actor, x, z: c.z || 0, lookAt: null });
    this.dirty = true;
    return actor;
  }
  remove(id: string): void {
    this.members = this.members.filter((m) => m.id !== id);
    this.members.forEach((m) => { if (m.lookAt === id) m.lookAt = null; });
    this.dirty = true;
  }
  has(id: string): boolean { return this.members.some((m) => m.id === id); }
  member(id: string): StageMember {
    const m = this.members.find((x) => x.id === id);
    if (!m) throw new Error("maxcot stage: no actor called '" + id + "'");
    return m;
  }
  /** The Actor behind a cast member, for poses, recasting and dials. */
  get(id: string): Actor { return this.member(id).actor; }
  /** Space the cast evenly across the floor, centred. */
  spread(gap = SPACING): this { const n = this.members.length; this.members.forEach((m, i) => { m.x = (i - (n - 1) / 2) * gap; }); this.dirty = true; return this; }
  place(id: string, x: number, z?: number): this { const m = this.member(id); m.x = x; if (z != null) m.z = z; this.dirty = true; return this; }
  /** Turn an actor toward another one, toward the camera ('us'), or back to its own gaze (null). */
  look(id: string, target: string | null): this { this.member(id).lookAt = target; this.dirty = true; return this; }
  pose(id: string, name: string | string[]): this { this.get(id).pose(name); this.dirty = true; return this; }
  cast(id: string, who: string): this { this.get(id).cast(who); this.dirty = true; return this; }
  setSkin(skin: Skin, palette?: string): this { this.skin = skin; if (palette) this.palette = palette; this.dirty = true; return this; }

  // ── the camera ─────────────────────────────────────────────────────────
  /** Frame everyone ('wide'), a group, or one actor. The camera eases there; pass cut to jump. */
  shot(frame: StageFraming, on?: string | string[], cut = false): this {
    this.shotSpec = { frame, on }; if (cut) this.snapCam = true; this.dirty = true; return this;
  }
  cut(): this { this.snapCam = true; this.dirty = true; return this; }

  /** Where each actor sits on screen for the current shot: a camera per actor. */
  private target(w: number, h: number): Map<string, Camera> {
    const out = new Map<string, Camera>(), ms = this.members;
    if (!ms.length) return out;
    const scale = (m: StageMember) => 1 / (1 + m.z * 0.25);
    const spec = this.shotSpec, focus = typeof spec.on === 'string' ? ms.find((m) => m.id === spec.on) : undefined;
    let unit: number, cx: number, cy: number, x0: number;
    const wideOne = spec.frame === 'wide' && ms.length === 1 ? ms[0] : undefined;
    if (wideOne) {
      // a cast of one is framed exactly like a single Character
      const c = camera(wideOne.actor.design, w, h, 'full');
      unit = c.unit / scale(wideOne); cx = c.cx; cy = c.cy; x0 = wideOne.x;
    } else if (spec.frame !== 'wide' && focus) {
      const c = camera(focus.actor.design, w, h, spec.frame);
      unit = c.unit / scale(focus); cx = c.cx; cy = c.cy; x0 = focus.x;
    } else {
      const group = Array.isArray(spec.on) ? ms.filter((m) => (spec.on as string[]).includes(m.id)) : ms;
      const use = group.length ? group : ms;
      let lo = Infinity, hi = -Infinity, tall = 0;
      use.forEach((m) => {
        const P = m.actor.design, s = P['body.size'] || 1;
        const half = (0.9 * P['body.w']! * s + 2 * (0.2 + P['hands.spread']! * 0.45 + P['hands.size']! * s * 1.6) + 0.3) / 2 * scale(m);
        lo = Math.min(lo, m.x - half); hi = Math.max(hi, m.x + half); tall = Math.max(tall, P['body.h']! * s);
      });
      const span = Math.max(2.25, hi - lo);
      unit = Math.min(w / (span * 1.06), h / (0.85 + tall));
      cy = h * 0.5 - 0.06 * unit; x0 = (lo + hi) / 2; cx = w / 2;
    }
    ms.forEach((m) => {
      const s = scale(m);
      out.set(m.id, { cx: cx + (m.x - x0) * unit, cy: cy - m.z * unit * 0.12, unit: unit * s });
    });
    return out;
  }

  // ── time and drawing ───────────────────────────────────────────────────
  /** The frame an actor shows, with its gaze turned toward whoever it is looking at. */
  private frameOf(m: StageMember): Frame {
    const F = m.actor.frame();
    if (m.lookAt === 'us') { F.C['eyes.lookX'] = F.C['eyes.lookX']! * 0.2; F.C['eyes.lookY'] = F.C['eyes.lookY']! * 0.2; }
    else if (m.lookAt) {
      const other = this.members.find((o) => o.id === m.lookAt);
      if (other && other !== m) {
        const dir = Math.sign(other.x - m.x) || 1;
        F.C['eyes.lookX'] = K.clamp(dir * 0.85, -1, 1);
        F.C['eyes.lookY'] = K.clamp((other.actor.design['body.h']! - m.actor.design['body.h']!) * 0.6, -0.6, 0.6);
        F.C.twist = F.C.twist! - dir * 0.22;
      }
    }
    return F;
  }
  /** Advance every actor and the camera by dt seconds, then draw. */
  step(dt: number): this {
    this.time += dt;
    this.members.forEach((m) => m.actor.update(dt));
    this.updateCamera(dt);
    this.draw(this.time);
    return this;
  }
  /** Ease each actor's camera toward the current shot (or jump, after cut()). Call every frame if you drive draw() yourself. */
  updateCamera(dt: number): void {
    const goal = this.target(this.canvas.width, this.canvas.height);
    const a = this.snapCam ? 1 : 1 - Math.exp(-dt * 5);
    let moved = 0;
    goal.forEach((g, id) => {
      const c = this.cams.get(id);
      const n = c && a < 1 ? { cx: K.lerp(c.cx, g.cx, a), cy: K.lerp(c.cy, g.cy, a), unit: K.lerp(c.unit, g.unit, a) } : g;
      if (c) moved = Math.max(moved, Math.abs(n.cx - c.cx), Math.abs(n.cy - c.cy), Math.abs(n.unit - c.unit));
      else moved = Infinity;
      this.cams.set(id, n);
    });
    this.snapCam = false;
    if (moved > 0.5) this.dirty = true;
  }
  /** Draw at time t if the skin's frame has moved on (or force). */
  draw(t: number, force?: boolean): boolean {
    const step = Math.floor(t * (this.skin.fps || 12));
    if (!force && step === this.last && !this.dirty) return false;
    if (this.members.some((m) => !this.cams.has(m.id))) { this.snapCam = true; this.updateCamera(0); }
    this.last = step; this.dirty = false;
    const w = this.canvas.width, h = this.canvas.height, seed = step;
    if (!this.members.length) {
      const g = this.skin.ground, view = { w, h, t, palette: this.palette, seed, key: this.key };
      this.ctx.save();
      if (g && g.draw) g.draw(this.ctx, w, h, t, K, view); else { this.ctx.fillStyle = (g && g.css) || '#f3f2ec'; this.ctx.fillRect(0, 0, w, h); }
      this.ctx.restore(); this.S = null; return true;
    }
    const ordered = this.members.slice().sort((p, q) => q.z - p.z);
    this.order = ordered.map((m) => m.id);
    const scenes = ordered.map((m) => scene(this.frameOf(m), { w, h, cam: this.cams.get(m.id)!, guides: this.guides, seed }));
    this.S = paint(this.ctx, mergeScenes(scenes), this.skin, { t, palette: this.palette, key: this.key });
    return true;
  }
  /** Which actor is at canvas pixel (x, y) in the last drawing, nearest first; null if none. */
  pick(x: number, y: number): string | null {
    const acts = this.S && this.S.actors ? this.S.actors : this.S ? [this.S] : [];
    for (let i = acts.length - 1; i >= 0; i--) {
      const b = acts[i]!.body, pad = acts[i]!.unit * 0.3;
      if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return this.order[i] ?? null;
    }
    return null;
  }
  start(): this {
    if (this.raf) return this;
    this.lastNow = performance.now();
    const tick = (now: number) => { this.step(Math.min(0.1, (now - this.lastNow) / 1000)); this.lastNow = now; this.raf = requestAnimationFrame(tick); };
    this.raf = requestAnimationFrame(tick);
    return this;
  }
  stop(): this { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; return this; }
}

/** Put a cast of actors on a canvas. */
export function createStage(canvas: CanvasLike, o: StageOptions): Stage { return new Stage(canvas, o); }
