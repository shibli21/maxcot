// face.ts: the engine draws the face, three.js wears it.
//
// Each frame the actor is flattened front-on (no turn, lean or perspective)
// and only its face parts (eyes, brows, mouth, blush, tears...) are drawn into
// a canvas, scaled so the front of the block fills it. That canvas is the
// texture on the front of the 3D block, so every pose, blink, lip-sync and
// puppet move shows up in 3D exactly as it does in 2D.
import { camera as flatCamera, kit as K, scene as flatScene, type CanvasLike, type Ctx2D, type Frame, type Part, type Scene } from 'maxcot';

/** The roles that belong on the face texture. */
const FACE = /^(eye|eye-line|iris|pupil|glint|lid|lash|brow|mouth|mouth-line|lip|teeth|teeth-line|tongue|blush|tear|sweat|heart|eye-heart|split)$/;

export interface FaceInk {
  /** Line colour. */
  ink: string;
  /** Fill for each face part (null leaves it out). */
  fill(p: Part): string | null | undefined;
  /** Line weight as a share of the unit. */
  lw?: number;
  /** Draw a soft glow under the lines (for light-based looks). */
  glow?: string;
}
/** Where the hands sit, relative to the front of the block: x and y are -1..1 across it, r is a radius in the same units. */
export interface FaceHands { L: { x: number; y: number; r: number } | null; R: { x: number; y: number; r: number } | null }

const FLAT_P = { 'view.yaw': 0, 'view.pitch': 0, 'view.persp': 0, 'body.taper': 0, 'body.slant': 0 };
const STILL_C = { lean: 0, twist: 0, nod: 0, x: 0, y: 0, squash: 0, bend: 0, hop: 0, shake: 0 };

/** Draw `F`'s face into `ctx` (w×h, cleared to transparent). Returns where its hands are. */
export function drawFace(ctx: Ctx2D, w: number, h: number, F: Frame, ink: FaceInk): FaceHands {
  const P = Object.assign({}, F.P, FLAT_P), C = Object.assign({}, F.C, STILL_C);
  const flat: Frame = { P, C, D: F.D, t: F.t, who: F.who };
  const cam = flatCamera(P, 1000, 1000, 'full');
  const S = flatScene(flat, { w: 1000, h: 1000, cam, seed: 0 });
  const fb = K.bbox(S.front);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  ctx.scale(w / fb.w, h / fb.h); ctx.translate(-fb.x, -fb.y);
  const face: Scene = Object.assign({}, S, { parts: S.parts.filter((p) => FACE.test(p.role)), guides: false });
  if (ink.glow) { ctx.shadowColor = ink.glow; ctx.shadowBlur = S.unit * 0.03; }
  K.toon(face, ctx, { ink: ink.ink, lw: ink.lw ?? 0.014, fill: ink.fill });
  ctx.restore();
  const rel = (q: { x: number; y: number; r: number } | undefined) => (q ? { x: (q.x - fb.cx) / (fb.w / 2), y: -(q.y - fb.cy) / (fb.h / 2), r: q.r / (fb.w / 2) } : null);
  return { L: rel(S.handL), R: rel(S.handR) };
}

/** A canvas for a face texture, from the maxcot canvas factory (so it works in Node too). */
export function faceCanvas(w: number, h: number): { canvas: CanvasLike; ctx: Ctx2D } {
  const canvas = K.createCanvas(w, h), ctx = canvas.getContext('2d') as Ctx2D;
  return { canvas, ctx };
}
