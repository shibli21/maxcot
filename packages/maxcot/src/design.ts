// design.ts
import type { DesignValues } from './types.js';

/** [key, group, label, help, min, max, default] */
export type DesignRow = [string, string, string, string, number, number, number];
/** How an actor moves when nobody is telling it what to do. */
export type IdleHabit = 'none' | 'still' | 'fidget' | 'bouncy' | 'sway';
export type GazeHabit = 'steady' | 'away' | 'darting' | 'us';
export interface Manner {
  /** 0 light and springy, 1 heavy and slow. 0.5 is neutral. */
  weight: number;
  idle: IdleHabit;
  gaze: GazeHabit;
  /** The pose it falls back to. */
  rest: string;
}
export const DEFAULT_MANNER: Manner = { weight: 0.5, idle: 'none', gaze: 'steady', rest: 'rest' };
export interface CastMember { key: string; label: string; about: string; values: DesignValues; manner: Manner }
// DESIGN: what the character IS. One row per dial:
//   [key, group, label, help, min, max, default]
// The studio builds its Design panel from this table, and every cast member is
// just a set of overrides on top of it. Same rig, new coat.

  var DESIGN: DesignRow[] = [
    ['body.w', 'body', 'Width', 'Half the width of the block, in body units.', 0.45, 1.7, 1.0],
    ['body.h', 'body', 'Height', 'Half the height of the block.', 0.5, 1.7, 1.0],
    ['body.d', 'body', 'Thickness', 'Depth front to back.', 0.15, 1.2, 0.62],
    ['body.rt', 'body', 'Top corners', 'Radius of the two top corners.', 0, 0.5, 0.1],
    ['body.rb', 'body', 'Foot corners', 'Radius of the two bottom corners.', 0, 0.5, 0.06],
    ['body.bevel', 'body', 'Edge', 'How round the front edge is.', 0, 0.12, 0.035],
    ['body.taper', 'body', 'Taper', 'A trapezoid: positive narrows the foot.', -0.35, 0.35, 0.04],
    ['body.split', 'body', 'Door line', 'Height of the door split (it is also the mouth line). 0 = none.', 0, 0.8, 0.43],
    ['body.slant', 'body', 'Slant', 'Leans the top over the foot.', -0.3, 0.3, 0.0],
    ['body.size', 'body', 'Size', 'The whole figure.', 0.5, 1.4, 1.0],

    ['eyes.size', 'eyes', 'Size', 'Half the width of one eye.', 0.05, 0.3, 0.15],
    ['eyes.aspect', 'eyes', 'Tall', 'Height over width.', 0.5, 2.0, 1.15],
    ['eyes.spacing', 'eyes', 'Apart', 'How far apart, as a share of the width.', 0.15, 0.85, 0.42],
    ['eyes.height', 'eyes', 'Height', 'How high on the face (0 = top).', 0.15, 0.7, 0.4],
    ['eyes.shape', 'eyes', 'Shape', '0 round, 1 square.', 0, 1, 0.55],
    ['eyes.pupil', 'eyes', 'Pupil', 'Pupil size.', 0.2, 0.95, 0.53],
    ['eyes.upper', 'eyes', 'Lid', 'How low the upper lid rests.', 0, 0.8, 0.3],
    ['eyes.lash', 'eyes', 'Lashes', 'Lash length.', 0, 1, 0],
    ['eyes.bag', 'eyes', 'Lower lid line', 'A line under each eye.', 0, 1, 0],
    ['eyes.cheat', 'eyes', 'Toward the camera', 'Turns the face toward us whatever the body does.', 0, 1, 0.35],

    ['brows.len', 'brows', 'Length', 'Half the length of a brow.', 0, 0.5, 0.26],
    ['brows.thick', 'brows', 'Weight', 'Half the thickness.', 0.01, 0.15, 0.05],
    ['brows.gap', 'brows', 'Gap', 'Space between brow and eye.', 0, 0.3, 0.08],
    ['brows.arch', 'brows', 'Arch', 'Arched or flat.', -1, 1, 0.25],
    ['brows.taper', 'brows', 'Taper', 'Heavier at the inner end.', 0, 1, 0.3],

    ['mouth.width', 'mouth', 'Width', 'Mouth width, as a share of the face.', 0.1, 0.8, 0.42],
    ['mouth.y', 'mouth', 'Height', 'Offset from the door line.', -0.3, 0.3, 0.0],
    ['mouth.teeth', 'mouth', 'Teeth', 'Show the teeth when open.', 0, 1, 1],

    ['hands.size', 'hands', 'Size', 'Mitt size.', 0.1, 0.36, 0.2],
    ['hands.spread', 'hands', 'Spread', 'How far from the body they float.', 0.0, 0.8, 0.3],
    ['hands.y', 'hands', 'Height', 'Where they rest.', -0.6, 0.4, -0.2],

    ['view.yaw', 'view', 'Turn', 'Three-quarter turn.', -0.9, 0.9, 0.38],
    ['view.pitch', 'view', 'Tilt', 'Looking down on the top.', -0.3, 0.6, 0.16],
    ['view.persp', 'view', 'Perspective', 'Lens: 0 flat, 1 wide.', 0, 1, 0.35],

    ['rest.lean', 'rest', 'Lean', 'Resting lean.', -0.3, 0.3, 0.0],
    ['rest.twist', 'rest', 'Twist', 'Resting twist.', -0.4, 0.4, 0.0],
    ['rest.float', 'rest', 'Float', 'Idle bob.', 0, 1, 0.5]
  ];

  var DEFAULTS: DesignValues = {};
  DESIGN.forEach(function (r) { DEFAULTS[r[0]] = r[6]; });

  // CAST: same rig, different actor. cast(key, label, about, values)
  var CAST: Record<string, CastMember> = {};
  /** Add an actor: a label, a one-line description and the dials it overrides. */
  function cast(key: string, label: string, about: string, v: DesignValues, manner: Partial<Manner> = {}): void {
    CAST[key] = { key: key, label: label, about: about, values: v, manner: Object.assign({}, DEFAULT_MANNER, manner) };
  }

  cast('max', 'Max', 'The fridge. The original.', {});
  cast('child', 'Child', 'Short and round, eyes too big for the face.', {
    'body.w': 0.86, 'body.h': 0.74, 'body.d': 0.5, 'body.rt': 0.32, 'body.rb': 0.22, 'body.taper': -0.04, 'body.split': 0.4,
    'eyes.size': 0.2, 'eyes.aspect': 1.3, 'eyes.spacing': 0.46, 'eyes.height': 0.44, 'eyes.shape': 0.15, 'eyes.pupil': 0.68, 'eyes.upper': 0.05,
    'brows.len': 0.16, 'brows.thick': 0.03, 'brows.arch': 0.6, 'hands.size': 0.17, 'mouth.width': 0.3, 'view.pitch': 0.22
  });
  cast('boss', 'Boss', 'Width and depth; the heaviest brows, a low lid.', {
    'body.w': 1.34, 'body.h': 0.9, 'body.d': 0.86, 'body.rt': 0.05, 'body.rb': 0.04, 'body.taper': -0.06, 'body.split': 0.5,
    'eyes.size': 0.12, 'eyes.aspect': 0.9, 'eyes.spacing': 0.36, 'eyes.shape': 0.85, 'eyes.upper': 0.48, 'eyes.pupil': 0.6,
    'brows.len': 0.32, 'brows.thick': 0.1, 'brows.arch': -0.2, 'brows.taper': 0.7, 'brows.gap': 0.03,
    'hands.size': 0.24, 'view.yaw': 0.53, 'view.pitch': 0.24, 'mouth.width': 0.5
  });
  cast('oldman', 'Old man', 'Long, narrow and tapered; heavy lids, wiry brows.', {
    'body.w': 0.58, 'body.h': 1.38, 'body.d': 0.44, 'body.rt': 0.14, 'body.taper': 0.14, 'body.slant': 0.08, 'body.split': 0.5,
    'eyes.size': 0.15, 'eyes.aspect': 1.0, 'eyes.spacing': 0.62, 'eyes.height': 0.3, 'eyes.upper': 0.55, 'eyes.bag': 1, 'eyes.shape': 0.3,
    'brows.len': 0.3, 'brows.thick': 0.05, 'brows.arch': 0.7, 'brows.taper': 0.0, 'hands.size': 0.18, 'hands.y': -0.05, 'rest.lean': 0.06
  });
  cast('girl', 'Little girl', 'Rounded, bright, long lashes.', {
    'body.w': 0.82, 'body.h': 0.95, 'body.d': 0.5, 'body.rt': 0.36, 'body.rb': 0.18, 'body.taper': -0.1,
    'eyes.size': 0.18, 'eyes.aspect': 1.4, 'eyes.shape': 0.05, 'eyes.pupil': 0.7, 'eyes.lash': 1, 'eyes.upper': 0.08,
    'brows.len': 0.14, 'brows.thick': 0.025, 'brows.arch': 0.5, 'hands.size': 0.16, 'mouth.width': 0.28
  });
  cast('clerk', 'Nervous clerk', 'Narrow, worried, small eyes set close.', {
    'body.w': 0.7, 'body.h': 1.12, 'body.d': 0.34, 'body.rt': 0.04, 'body.rb': 0.04,
    'eyes.size': 0.11, 'eyes.aspect': 1.3, 'eyes.spacing': 0.3, 'eyes.pupil': 0.38, 'eyes.upper': 0.1,
    'brows.len': 0.2, 'brows.thick': 0.03, 'brows.arch': 0.9, 'hands.size': 0.17, 'view.yaw': 0.2
  });
  cast('teen', 'Teenager', 'Slouched, sleepy lids, too cool.', {
    'body.w': 0.9, 'body.h': 1.1, 'body.d': 0.5, 'body.rt': 0.2, 'body.slant': -0.12,
    'eyes.size': 0.15, 'eyes.upper': 0.62, 'eyes.shape': 0.4, 'brows.arch': -0.4, 'brows.len': 0.22, 'rest.lean': -0.08, 'rest.float': 0.2
  });
  cast('professor', 'Professor', 'Square, deep, a bag under every eye.', {
    'body.w': 1.02, 'body.h': 1.18, 'body.d': 0.72, 'body.rt': 0.02, 'body.rb': 0.12, 'body.bevel': 0.07,
    'eyes.size': 0.14, 'eyes.aspect': 0.85, 'eyes.shape': 1, 'eyes.bag': 1, 'eyes.upper': 0.35,
    'brows.len': 0.34, 'brows.thick': 0.07, 'brows.arch': 0.1, 'brows.gap': 0.12
  });
  // manners: the same rig, moving like different people
  const MANNERS: Record<string, Partial<Manner>> = {
    child: { weight: 0.15, idle: 'bouncy', gaze: 'darting', rest: 'at-ease' },
    girl: { weight: 0.2, idle: 'bouncy', gaze: 'us', rest: 'pleased' },
    boss: { weight: 0.9, idle: 'still', gaze: 'steady', rest: 'hips' },
    oldman: { weight: 0.75, idle: 'sway', gaze: 'steady', rest: 'at-ease' },
    clerk: { weight: 0.3, idle: 'fidget', gaze: 'away', rest: 'rub' },
    teen: { weight: 0.55, idle: 'sway', gaze: 'away', rest: 'slump' },
    professor: { weight: 0.7, idle: 'still', gaze: 'steady', rest: 'counting' }
  };
  for (const k in MANNERS) Object.assign(CAST[k]!.manner, MANNERS[k]);
  CAST.kid = CAST.child!;
  /** An actor's manner (a copy you can change). */
  function mannerOf(who?: string): Manner { return Object.assign({}, ((who && CAST[who]) || CAST.max!).manner); }

  /** The full design for an actor: DESIGN defaults with its overrides on top. */
  function resolve(who?: string): DesignValues {
    var c = (who && CAST[who]) || CAST.max!, out: DesignValues = {};
    for (var k in DEFAULTS) out[k] = DEFAULTS[k];
    for (var j in c.values) out[j] = c.values[j];
    return out;
  }

export { DESIGN, DEFAULTS, CAST, cast, resolve, mannerOf };
export default { DESIGN, DEFAULTS, CAST, cast, resolve, mannerOf };
