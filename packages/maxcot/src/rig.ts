// rig.ts: how the character MOVES.
// A pose is a set of channel targets on one layer ('all', 'face', 'eyes',
// 'mouth', 'hands', 'body'). Poses are composed with mix: [...] from four small
// libraries: body moves (B), expressions (E), mouths (M) and hand shapes (H).
// The Actor springs every channel toward its target, so any pose can follow
// any other with no in-betweens authored by hand.
import K from './kit.js';
import * as Design from './design.js';
import type { Channels, DesignValues, Discrete, Frame } from './types.js';
import type { Manner } from './design.js';

/** Channel targets and discrete switches (hand shapes, eye mode, prop) by key. */
export type PoseValues = Record<string, number | string>;
/** A named pose: a layer, the library entries it mixes, and its own overrides. */
export type PoseDef = { layer: string; mix?: string[]; [k: string]: number | string | string[] | undefined };
export interface ResolvedPose { layer: string; values: PoseValues }
export type PoseSection = 'attitudes' | 'feelings' | 'eyes' | 'mouth' | 'hands' | 'body';

  // ── channels ─────────────────────────────────────────────────────────────
  var CH: Channels = {
    lean: 0, twist: 0, nod: 0, squash: 0, bend: 0, x: 0, y: 0, hop: 0, shake: 0,
    'eyes.open.L': 1, 'eyes.open.R': 1, 'eyes.squint.L': 0, 'eyes.squint.R': 0,
    'eyes.tilt.L': 0, 'eyes.tilt.R': 0, 'eyes.lookX': 0, 'eyes.lookY': 0, 'eyes.scale': 1,
    'brows.raise.L': 0, 'brows.raise.R': 0, 'brows.angle.L': 0, 'brows.angle.R': 0,
    'mouth.open': 0, 'mouth.smile': 0, 'mouth.round': 0, 'mouth.skew': 0, 'mouth.wide': 1, 'mouth.teeth': 0, 'mouth.tongue': 0,
    'handL.x': 0, 'handL.y': 0, 'handL.z': 0, 'handL.rot': 0, 'handL.wave': 0,
    'handR.x': 0, 'handR.y': 0, 'handR.z': 0, 'handR.rot': 0, 'handR.wave': 0,
    'fx.tears': 0, 'fx.blush': 0, 'fx.sweat': 0, 'fx.hearts': 0, 'fx.burst': 0, 'fx.zzz': 0
  };
  var DISC: Discrete = { handL: 'rest', handR: 'rest', eyeMode: 'open', prop: 'none' };

  function layerOf(k: string): string {
    if (k.indexOf('hand') === 0) return 'hands';
    if (k.indexOf('eyes') === 0 || k.indexOf('brows') === 0 || k === 'eyeMode') return 'eyes';
    if (k.indexOf('mouth') === 0) return 'mouth';
    if (k.indexOf('fx') === 0) return 'fx';
    if (k === 'prop') return 'hands';
    return 'body';
  }
  var DOMAIN: Record<string, Record<string, number>> = {
    all: { body: 1, eyes: 1, mouth: 1, hands: 1, fx: 1 },
    face: { eyes: 1, mouth: 1, fx: 1 },
    eyes: { eyes: 1 }, mouth: { mouth: 1 }, hands: { hands: 1 }, body: { body: 1 }
  };

  var both = function (k: string, v: number, v2?: number): PoseValues { var o: PoseValues = {}; o[k + '.L'] = v; o[k + '.R'] = v2 == null ? v : v2; return o; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var join = function (...objs: Array<Record<string, unknown>>): any { var o: Record<string, unknown> = {}; for (var i = 0; i < objs.length; i++) for (var k in objs[i]) o[k] = objs[i]![k]; return o; };

  // ── B: body moves ────────────────────────────────────────────────────────
  var B: Record<string, PoseValues> = {
    rest: {},
    sway: { lean: -0.12, twist: 0.12, 'handL.y': -0.06, 'handR.y': -0.1 },
    recoil: { lean: -0.24, nod: 0.14, squash: -0.08, x: -0.05, 'handL.x': -0.08, 'handR.x': 0.16, 'handL.y': 0.32, 'handR.y': 0.38, handL: 'open', handR: 'open' },
    proud: { nod: 0.1, squash: -0.06, y: 0.05, 'handL.x': 0.14, 'handR.x': -0.14, 'handL.y': 0.02, 'handR.y': 0.02, handL: 'fist', handR: 'fist' },
    cower: { squash: 0.13, nod: -0.13, lean: 0.08, y: -0.04, 'handL.x': 0.26, 'handR.x': -0.26, 'handL.y': 0.36, 'handR.y': 0.36, 'handL.z': 0.4, 'handR.z': 0.4, handL: 'open', handR: 'open', shake: 0.35 },
    'lean-in': { nod: -0.13, y: -0.03, bend: 0.16, twist: -0.12 },
    'lean-back': { nod: 0.15, bend: -0.13, lean: 0.06 },
    bow: { nod: -0.3, squash: 0.08, y: -0.06, bend: 0.1 },
    tilt: { lean: 0.22 },
    squash: { squash: 0.18 },
    'turn-to': { twist: -0.36 },
    bounce: { hop: 0.6 },
    slump: { squash: 0.12, bend: -0.1, y: -0.08, 'handL.y': -0.22, 'handR.y': -0.22 }
  };

  // ── E: expressions (eyes + brows) ────────────────────────────────────────
  var E: Record<string, PoseValues> = {};
  var ex = function (name: string, ...parts: PoseValues[]) { var o: PoseValues = {}; for (var i = 0; i < parts.length; i++) for (var k in parts[i]) o[k] = parts[i]![k]!; E[name] = o; };
  ex('neutral');
  ex('angry', both('eyes.open', 0.78), both('eyes.tilt', 0.5), both('brows.angle', -0.6), both('brows.raise', -0.2));
  ex('furious', both('eyes.open', 0.95, 1.0), both('eyes.tilt', 0.75), both('eyes.squint', 0.15), both('brows.angle', -1), both('brows.raise', -0.35), { 'eyes.scale': 0.9 });
  ex('happy', both('eyes.open', 0.78), both('eyes.squint', 0.45), both('brows.raise', 0.2), both('brows.angle', 0.1));
  ex('excited', both('eyes.open', 1.25), both('brows.raise', 0.5), { 'eyes.scale': 1.08 });
  ex('suspicious', both('eyes.open', 0.42, 0.72), both('brows.angle', -0.5, 0.2), both('brows.raise', -0.15, 0.4), { 'eyes.lookX': 0.6 });
  ex('sad', both('eyes.open', 0.85), both('eyes.tilt', -0.55), both('brows.angle', 0.85), both('brows.raise', 0.1), { 'eyes.lookY': -0.45 });
  ex('surprised', both('eyes.open', 1.38), both('brows.raise', 0.85), { 'eyes.scale': 1.12 });
  ex('sleepy', both('eyes.open', 0.3, 0.26), both('brows.raise', -0.1), { 'eyes.lookY': -0.3 });
  ex('smug', both('eyes.open', 0.46, 0.5), both('eyes.squint', 0.3), both('brows.raise', 0.3, 0), both('brows.angle', -0.2, 0), { 'eyes.lookX': -0.4 });
  ex('terrified', both('eyes.open', 1.4), both('brows.angle', 0.9), both('brows.raise', 0.6), { 'eyes.scale': 1.15, 'fx.sweat': 1 });
  ex('bored', both('eyes.open', 0.45), both('brows.raise', -0.1), { 'eyes.lookX': 0.5, 'eyes.lookY': 0.35 });
  ex('tender', both('eyes.open', 0.6), both('eyes.squint', 0.35), both('brows.raise', 0.3), both('brows.angle', 0.3), { 'eyes.lookX': 0.3, 'fx.blush': 1 });
  ex('embarrassed', both('eyes.open', 0.7), both('brows.angle', 0.6), { 'eyes.lookX': -0.7, 'eyes.lookY': -0.4, 'fx.blush': 1, 'fx.sweat': 0.6 });
  ex('plotting', both('eyes.open', 0.4), both('eyes.tilt', 0.4), both('brows.angle', -0.7), { 'eyes.lookX': -0.5 });

  // ── EY: eye-layer poses (what the Poses panel lists under EYES) ─────────
  var EY: Record<string, PoseValues> = {
    'eyes-neutral': E.neutral, 'eyes-suspicious': E.suspicious, 'eyes-sad': E.sad, 'eyes-sleepy': E.sleepy,
    'eyes-furious': E.furious, 'eyes-smug': E.smug, 'eyes-terrified': E.terrified, 'eyes-wide': E.surprised,
    'eyes-happy': join(E.happy, { eyeMode: 'happy' }), 'eyes-shut-tight': join(both('brows.angle', 0.6), both('brows.raise', -0.2), { eyeMode: 'shut' }),
    'eyes-x': { eyeMode: 'x' }, 'eyes-heart': { eyeMode: 'heart', 'fx.hearts': 0.6 },
    'eyes-left': { 'eyes.lookX': -1 }, 'eyes-right': { 'eyes.lookX': 1 }, 'eyes-up': join({ 'eyes.lookY': 1 }, both('brows.raise', 0.3)), 'eyes-down': { 'eyes.lookY': -1 }
  };

  // ── M: mouths ────────────────────────────────────────────────────────────
  var M: Record<string, PoseValues> = {};
  var mo = function (name: string, v: PoseValues) { M[name] = v; };
  mo('mouth-shut', {});
  mo('mouth-angry', { 'mouth.open': 0.46, 'mouth.smile': -0.7, 'mouth.teeth': 1, 'mouth.wide': 0.8 });
  mo('mouth-rage', { 'mouth.open': 1.05, 'mouth.smile': -0.8, 'mouth.teeth': 1, 'mouth.wide': 1.15 });
  mo('mouth-happy', { 'mouth.open': 0.5, 'mouth.smile': 0.9, 'mouth.teeth': 1 });
  mo('mouth-excited', { 'mouth.open': 1.0, 'mouth.smile': 1, 'mouth.tongue': 0.6 });
  mo('mouth-smile', { 'mouth.smile': 1 });
  mo('mouth-smirk', { 'mouth.skew': 1, 'mouth.smile': 0.45, 'mouth.wide': 0.8 });
  mo('mouth-pout', { 'mouth.smile': -1, 'mouth.round': 0.5, 'mouth.wide': 0.55 });
  mo('mouth-gasp', { 'mouth.round': 1, 'mouth.open': 0.9, 'mouth.wide': 0.55 });
  mo('mouth-oo', { 'mouth.round': 1, 'mouth.open': 0.42, 'mouth.wide': 0.36 });
  mo('mouth-yawn', { 'mouth.open': 1.25, 'mouth.round': 0.5, 'mouth.tongue': 0.5 });
  mo('tongue-out', { 'mouth.open': 0.3, 'mouth.tongue': 1, 'mouth.smile': 0.4 });
  mo('mouth-frown', { 'mouth.smile': -0.8 });
  mo('mouth-grit', { 'mouth.open': 0.28, 'mouth.teeth': 1, 'mouth.smile': -0.2, 'mouth.wide': 1.05 });
  mo('mouth-laugh', { 'mouth.open': 1.1, 'mouth.smile': 1, 'mouth.teeth': 1, 'mouth.tongue': 0.5 });
  mo('mouth-wobble', { 'mouth.open': 0.35, 'mouth.smile': -0.9, 'mouth.wide': 0.8 });

  // ── H: hand poses ────────────────────────────────────────────────────────
  var H: Record<string, PoseValues> = {
    rest: { handL: 'rest', handR: 'rest' },
    point: { handR: 'point', 'handR.x': 0.1, 'handR.y': 0.22, 'handR.rot': -0.15 },
    'point-you': { handR: 'point', 'handR.x': -0.25, 'handR.y': 0.08, 'handR.z': 0.7, 'handR.rot': 0.25 },
    'point-up': { handR: 'point', 'handR.y': 0.55, 'handR.rot': -1.35 },
    'point-down': { handR: 'point', 'handR.y': -0.18, 'handR.rot': 1.35 },
    shrug: { handL: 'open', handR: 'open', 'handL.y': 0.26, 'handR.y': 0.26, 'handL.x': -0.12, 'handR.x': 0.12, 'handL.rot': 0.55, 'handR.rot': -0.55 },
    facepalm: { handR: 'open', 'handR.x': -0.62, 'handR.y': 0.5, 'handR.z': 0.7, 'handR.rot': 0.35 },
    thumbsup: { handR: 'thumbsup', 'handR.y': 0.26 },
    count1: { handR: 'one', 'handR.y': 0.42 }, count2: { handR: 'two', 'handR.y': 0.42 },
    count3: { handR: 'three', 'handR.y': 0.42 }, count4: { handR: 'four', 'handR.y': 0.42 },
    wave: { handR: 'open', 'handR.y': 0.58, 'handR.wave': 1 },
    stop: { handR: 'open', 'handR.x': 0.06, 'handR.y': 0.3, 'handR.z': 0.6 },
    present: { handR: 'open', 'handR.x': 0.26, 'handR.y': 0.08, 'handR.rot': -1.25 },
    'hold-letter': { handR: 'fist', 'handR.x': -0.1, 'handR.y': 0.34, 'handR.z': 0.5, prop: 'letter' },
    hips: { handL: 'fist', handR: 'fist', 'handL.x': 0.2, 'handR.x': -0.2, 'handL.y': -0.04, 'handR.y': -0.04 },
    cheer: { handL: 'fist', handR: 'fist', 'handL.y': 0.78, 'handR.y': 0.78, 'handL.x': 0.12, 'handR.x': -0.12, 'handL.wave': 0.3, 'handR.wave': 0.3 },
    rub: { handL: 'open', handR: 'open', 'handL.x': 0.34, 'handR.x': -0.34, 'handL.z': 0.6, 'handR.z': 0.6, 'handL.wave': 0.35, 'handR.wave': 0.35 },
    peace: { handR: 'two', 'handR.y': 0.46 },
    'arms-up': { handL: 'open', handR: 'open', 'handL.y': 0.8, 'handR.y': 0.8, 'handL.x': -0.08, 'handR.x': 0.08 },
    fists: { handL: 'fist', handR: 'fist', 'handL.y': 0.15, 'handR.y': 0.15, 'handL.z': 0.4, 'handR.z': 0.4 }
  };

  // ── P: named poses ───────────────────────────────────────────────────────
  var P: Record<string, PoseDef> = {}, SECTIONS: Record<PoseSection, string[]> = { attitudes: [], feelings: [], eyes: [], mouth: [], hands: [], body: [] };
  function add(section: PoseSection, name: string, def: PoseDef) { P[name] = def; SECTIONS[section].push(name); }

  add('attitudes', 'rest', { layer: 'all', mix: ['rest', 'neutral', 'mouth-shut', 'h:rest'] });
  add('attitudes', 'thinking', { layer: 'all', mix: ['tilt', 'neutral', 'eyes-up'], handR: 'fist', 'handR.x': -0.42, 'handR.y': -0.02, 'handR.z': 0.6, 'mouth.skew': 0.5, 'brows.raise.L': 0.35 });
  add('attitudes', 'selling', { layer: 'all', mix: ['lean-in', 'happy', 'mouth-happy', 'h:present'], handL: 'open', 'handL.y': 0.14, 'handL.rot': 1.1, 'handL.x': -0.18 });
  add('attitudes', 'laughing', { layer: 'all', mix: ['lean-back', 'bounce', 'mouth-laugh', 'eyes-happy'], handL: 'open', handR: 'open', 'handL.x': 0.24, 'handR.x': -0.2, 'handL.y': -0.1, 'handR.y': -0.14, 'handL.z': 0.5, 'handR.z': 0.5 });
  add('attitudes', 'dunno', { layer: 'all', mix: ['squash', 'h:shrug'], 'mouth.smile': -0.4, 'mouth.skew': 0.6, 'brows.raise.L': 0.5, 'brows.raise.R': 0.3, 'eyes.lookX': 0.3 });
  add('attitudes', 'fedup', { layer: 'all', mix: ['sway', 'bored', 'mouth-frown', 'h:hips'] });
  add('attitudes', 'deal', { layer: 'all', mix: ['proud', 'smug', 'mouth-smirk'], handR: 'open', 'handR.x': -0.18, 'handR.y': 0.06, 'handR.z': 0.7, 'handR.rot': -0.6 });
  add('attitudes', 'secret', { layer: 'all', mix: ['turn-to', 'suspicious'], handR: 'open', 'handR.x': -0.52, 'handR.y': 0.0, 'handR.z': 0.6, 'handR.rot': 0.9, 'mouth.round': 0.4, 'mouth.open': 0.2, 'eyes.lookX': -0.7 });
  add('attitudes', 'at-ease', { layer: 'all', mix: ['rest', 'neutral', 'mouth-smile', 'h:rest'], 'handL.y': -0.08, 'handR.y': -0.08 });
  add('attitudes', 'pleased', { layer: 'all', mix: ['proud', 'happy', 'mouth-smile'] });
  add('attitudes', 'you', { layer: 'all', mix: ['lean-in', 'neutral', 'mouth-smile', 'h:point-you'] });
  add('attitudes', 'counting', { layer: 'all', mix: ['tilt', 'neutral', 'h:count3'], 'eyes.lookY': 0.5, 'eyes.lookX': 0.5 });
  add('attitudes', 'despair', { layer: 'all', mix: ['bow', 'sad', 'mouth-wobble', 'h:facepalm'] });
  add('attitudes', 'letter', { layer: 'all', mix: ['tilt', 'neutral', 'mouth-oo', 'h:hold-letter'], 'eyes.lookX': -0.5, 'eyes.lookY': 0.3 });

  function feel(name: string, mix: string[], extra?: PoseValues) { add('feelings', 'feel-' + name, join({ layer: 'all', mix: mix }, extra || {})); }
  feel('happy', ['proud', 'happy', 'mouth-happy']);
  feel('excited', ['bounce', 'excited', 'mouth-excited', 'h:arms-up'], { 'fx.burst': 1 });
  feel('furious', ['squash', 'furious', 'mouth-rage', 'h:fists'], { shake: 0.5 });
  feel('angry', ['lean-in', 'angry', 'mouth-angry', 'h:fists']);
  feel('sulking', ['slump', 'sad', 'mouth-pout'], { twist: 0.3, 'eyes.lookX': 0.8 });
  feel('bored', ['sway', 'sleepy', 'mouth-frown', 'h:hips'], { 'fx.zzz': 1 });
  feel('terrified', ['recoil', 'terrified', 'mouth-gasp']);
  feel('proud', ['proud', 'smug', 'mouth-smile', 'h:hips']);
  feel('embarrassed', ['cower', 'embarrassed', 'mouth-wobble'], { shake: 0 });
  feel('laughing', ['lean-back', 'bounce', 'eyes-happy', 'mouth-laugh']);
  feel('crying', ['bow', 'eyes-shut-tight', 'mouth-wobble'], { 'fx.tears': 1, shake: 0.2, handL: 'fist', handR: 'fist', 'handL.x': 0.42, 'handR.x': -0.42, 'handL.y': 0.45, 'handR.y': 0.45, 'handL.z': 0.6, 'handR.z': 0.6 });
  feel('flirting', ['tilt', 'tender', 'mouth-smirk'], { 'fx.hearts': 1, handR: 'open', 'handR.wave': 0.4, 'handR.y': 0.3 });
  feel('plotting', ['lean-in', 'plotting', 'mouth-smirk', 'h:rub']);
  feel('sad', ['slump', 'sad', 'mouth-frown']);
  feel('surprised', ['recoil', 'surprised', 'mouth-oo']);

  Object.keys(EY).forEach(function (k) { add('eyes', k, join({ layer: 'eyes' }, EY[k])); });
  Object.keys(M).forEach(function (k) { add('mouth', k, join({ layer: 'mouth' }, M[k])); });
  Object.keys(H).forEach(function (k) { add('hands', k === 'rest' ? 'hands-rest' : k, join({ layer: 'hands' }, H[k])); });
  ['lean-in', 'lean-back', 'tilt', 'bow', 'squash', 'sway', 'turn-to', 'bounce', 'slump', 'recoil', 'cower', 'proud']
    .forEach(function (k) { add('body', k, join({ layer: 'body' }, B[k])); });

  // Resolve a pose (or a list of them) to { layer, values }
  function lookup(n: string): PoseValues | undefined {
    if (n.indexOf('h:') === 0) return H[n.slice(2)];
    return B[n] || E[n] || M[n] || EY[n] || H[n] || (P[n] && flatten(P[n]!));
  }
  function flatten(def: PoseDef): PoseValues {
    var out: PoseValues = {};
    (def.mix || []).forEach(function (n) { var v = lookup(n); if (v) for (var k in v) out[k] = v[k]!; });
    for (var k in def) if (k !== 'layer' && k !== 'mix') out[k] = def[k] as number | string;
    return out;
  }
  /** Flatten a pose name (or several, layered in order) into channel targets. */
  function resolve(name: string | string[]): ResolvedPose {
    var names = Array.isArray(name) ? name : [name], layer: string | null = null, values: PoseValues = {};
    names.forEach(function (n) {
      var def = P[n]; if (!def) return;
      layer = layer ? 'all' : def.layer; var v = flatten(def); for (var k in v) values[k] = v[k]!;
    });
    return { layer: layer || 'all', values: values };
  }

// ── Actor: springs + idle life ───────────────────────────────────────────
export interface ActorOptions { who?: string; t?: number }

/** One character's state: its design, every animation channel, and the springs between poses. */
export class Actor {
  who: string;
  design: DesignValues;
  designTo: DesignValues;
  ch: Channels;
  to: Channels;
  vel: Channels = {};
  disc: Discrete;
  discTo: Discrete;
  poseName = 'rest';
  t: number;
  blink: number;
  switchAt = 0;
  /** Spring stiffness (higher is snappier) and damping (below 1 overshoots). */
  stiff = 15;
  damp = 0.68;
  /** Idle breathing and floating, 0..2. */
  idle = 1;
  /** 'us' keeps the eyes on the camera. */
  gaze: string | null = null;
  /** How fast a recast morphs the design. */
  morph = 7;
  /** How this actor moves on its own: weight, idle habit, gaze habit, rest pose. */
  manner!: Manner;

  constructor(o: ActorOptions = {}) {
    this.who = o.who || 'max';
    this.design = Design.resolve(this.who); this.designTo = Object.assign({}, this.design);
    this.ch = Object.assign({}, CH); this.to = Object.assign({}, CH);
    this.disc = Object.assign({}, DISC); this.discTo = Object.assign({}, DISC);
    this.t = o.t || 0; this.blink = 2 + Math.random() * 2;
    this.setManner(Design.mannerOf(this.who));
    if (this.manner.rest !== 'rest') this.pose(this.manner.rest).snap();
  }
  /** Change how the actor moves. Weight sets the springs: heavy is slow and settles, light snaps and overshoots. */
  setManner(m: Partial<Manner>): this {
    this.manner = Object.assign({}, this.manner || Design.mannerOf('max'), m);
    const w = K.clamp(this.manner.weight, 0, 1);
    this.stiff = 15 + (0.5 - w) * 16; this.damp = 0.68 + (w - 0.5) * 0.4;
    return this;
  }
  /** Spring toward a pose (or a list of poses). Only its layer's channels change. */
  pose(name: string | string[]): this {
    var r = resolve(name), dom = DOMAIN[r.layer] || DOMAIN.all!, k: string;
    for (k in CH) if (dom[layerOf(k)]) this.to[k] = k in r.values ? (r.values[k] as number) : CH[k]!;
    for (k in DISC) if (dom[layerOf(k)]) this.discTo[k] = k in r.values ? String(r.values[k]) : DISC[k]!;
    this.switchAt = this.t + 0.06; this.poseName = Array.isArray(name) ? name.join('+') : name;
    return this;
  }
  /** Recast: morph the design toward another actor. */
  cast(who: string): this {
    const wasResting = this.poseName === this.manner.rest;
    this.who = who; this.designTo = Design.resolve(who); this.setManner(Design.mannerOf(who));
    if (wasResting && this.manner.rest !== this.poseName) this.pose(this.manner.rest);
    return this;
  }
  /** Morph one design dial. */
  set(k: string, v: number): this { this.designTo[k] = v; return this; }
  /** Jump straight to every target. */
  snap(): this {
    Object.assign(this.ch, this.to); Object.assign(this.disc, this.discTo); Object.assign(this.design, this.designTo); this.vel = {}; return this;
  }
  update(dt: number): void {
    dt = Math.min(dt, 0.05); this.t += dt;
    var w = this.stiff, z = this.damp, k: string, x: number, v: number;
    for (k in this.to) {
      x = this.ch[k]!; v = this.vel[k] || 0;
      v += (w * w * (this.to[k]! - x) - 2 * z * w * v) * dt; x += v * dt;
      this.ch[k] = x; this.vel[k] = v;
    }
    if (this.t >= (this.switchAt || 0)) Object.assign(this.disc, this.discTo);
    var a = 1 - Math.exp(-this.morph * dt);
    for (k in this.designTo) if (typeof this.designTo[k] === 'number') this.design[k] = this.design[k]! + (this.designTo[k]! - this.design[k]!) * a;
    if (this.t > this.blink + 0.16) this.blink = this.t + 1.8 + Math.random() * 3.2;
  }
  /** The frame the renderer sees: channels plus idle breathing, blinks, waves and hops. */
  frame(tOverride?: number | null): Frame {
    var t = tOverride == null ? this.t : tOverride, C: Channels = Object.assign({}, this.ch), P = this.design, idle = this.idle;
    var c = function (k: string): number { return C[k]!; };
    var habit = this.manner ? this.manner.idle : 'none', gazeHabit = this.manner ? this.manner.gaze : 'steady';
    var fl = (P['rest.float'] == null ? 0.5 : P['rest.float']) * idle * (habit === 'still' ? 0.35 : 1);
    C.y = c('y') + fl * 0.045 * Math.sin(t * 1.7);
    C.squash = c('squash') + idle * 0.014 * Math.sin(t * 3.4);
    C['handL.y'] = c('handL.y') + fl * 0.04 * Math.sin(t * 1.7 + 0.9); C['handR.y'] = c('handR.y') + fl * 0.04 * Math.sin(t * 1.7 + 1.4);
    C['handL.rot'] = c('handL.rot') + c('handL.wave') * 0.45 * Math.sin(t * 10); C['handR.rot'] = c('handR.rot') + c('handR.wave') * 0.45 * Math.sin(t * 10 + 1);
    C.y = c('y') + c('hop') * 0.1 * Math.abs(Math.sin(t * 8)); C.squash = c('squash') - c('hop') * 0.05 * Math.cos(t * 16);
    C.x = c('x') + c('shake') * 0.014 * Math.sin(t * 53); C.lean = c('lean') + c('shake') * 0.02 * Math.sin(t * 41);
    C.lean = c('lean') + (P['rest.lean'] || 0); C.twist = c('twist') + (P['rest.twist'] || 0);
    // idle habits
    if (habit === 'fidget') {
      C['handR.rot'] = c('handR.rot') + K.noise(t * 0.9, 3) * 0.2 * idle; C['handL.rot'] = c('handL.rot') + K.noise(t * 0.8, 7) * 0.16 * idle;
      C['handR.y'] = c('handR.y') + K.noise(t * 1.3, 4) * 0.03 * idle; C.twist = c('twist') + K.noise(t * 0.6, 5) * 0.06 * idle;
    } else if (habit === 'bouncy') {
      C.y = c('y') + 0.035 * idle * Math.abs(Math.sin(t * 3.2)); C.squash = c('squash') + 0.02 * idle * Math.sin(t * 6.4);
    } else if (habit === 'sway') {
      C.lean = c('lean') + 0.06 * idle * Math.sin(t * 1.1); C.twist = c('twist') + 0.04 * idle * Math.sin(t * 0.7);
    }
    // gaze habits (an explicit gaze or a stage look still wins)
    if (this.gaze == null) {
      if (gazeHabit === 'away') C['eyes.lookX'] = K.clamp(c('eyes.lookX') + K.noise(t * 0.2, 11) * 0.9, -1, 1);
      else if (gazeHabit === 'darting') { var k = Math.floor(t / 0.9); C['eyes.lookX'] = K.clamp(c('eyes.lookX') + (K.hash(k * 7.13) - 0.5) * 1.3, -1, 1); C['eyes.lookY'] = K.clamp(c('eyes.lookY') + (K.hash(k * 3.31) - 0.5) * 0.6, -1, 1); }
      else if (gazeHabit === 'us') { C['eyes.lookX'] = c('eyes.lookX') * 0.2; C['eyes.lookY'] = c('eyes.lookY') * 0.2; }
    }
    if (tOverride == null && this.t > this.blink && this.disc.eyeMode === 'open') {
      var b = 1 - Math.sin(K.clamp((this.t - this.blink) / 0.16, 0, 1) * Math.PI);
      C['eyes.open.L'] = c('eyes.open.L') * b; C['eyes.open.R'] = c('eyes.open.R') * b;
    }
    if (this.gaze === 'us') { C['eyes.lookX'] = c('eyes.lookX') * 0.2; C['eyes.lookY'] = c('eyes.lookY') * 0.2; }
    return { P: P, C: C, D: this.disc, t: t, who: this.who };
  }
}

export const Rig = { CH, DISC, B, E, M, H, P, EY, SECTIONS, resolve, layerOf, Actor, both };
export { CH, DISC, B, E, M, H, P, EY, SECTIONS, resolve, layerOf, both };
export default Rig;
