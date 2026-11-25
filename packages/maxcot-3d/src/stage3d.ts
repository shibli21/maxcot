// stage3d.ts: a three.js stage for maxcot actors.
//
// It reads the same Actors the 2D Stage plays (their frames carry every pose,
// blink, lip-sync and puppet move) and stands them in a lit set as rounded
// blocks with live-drawn faces and mitts for hands. Give it a canvas and it
// renders with WebGL; give it none and it only keeps the scene graph (for
// tests, or to render it yourself).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Frame } from 'maxcot';
import { drawFace, faceCanvas, type FaceHands } from './face.js';
import { LOOK, type Look3D } from './looks.js';
import { SET, type Set3D, type SetDef } from './sets.js';

/** Anything that can give a frame: an Actor. */
export interface Frameable { frame(t?: number | null): Frame; who: string }
export interface Member3D { id: string; actor: Frameable; x: number; z: number }
export type Framing3D = 'wide' | 'full' | 'medium' | 'close';
export interface Stage3DOptions { canvas?: HTMLCanvasElement | null; look?: Look3D; set?: Set3D; pixelRatio?: number }

/** World units between stage x positions. */
const SPREAD = 2.6;
const FACE_W = 256;

/** One actor in 3D: a rounded block, a face texture, two mitts. */
export class Actor3D {
  readonly root = new THREE.Group();
  /** Turns and leans about the foot. */
  readonly pivot = new THREE.Group();
  body!: THREE.Mesh; face!: THREE.Mesh; outline: THREE.Mesh | null = null; edges: THREE.LineSegments | null = null;
  hands: [THREE.Mesh, THREE.Mesh];
  /** The face texture's canvas (drawn by the engine each frame). */
  faceCanvas: ReturnType<typeof faceCanvas>;
  hold: FaceHands = { L: null, R: null };
  private tex: THREE.CanvasTexture;
  private shape = '';
  private look: Look3D;
  private tint: number;

  constructor(look: Look3D, tint = 0) {
    this.look = look; this.tint = tint;
    this.faceCanvas = faceCanvas(FACE_W, FACE_W);
    this.tex = new THREE.CanvasTexture(this.faceCanvas.canvas as unknown as HTMLCanvasElement); this.tex.colorSpace = THREE.SRGBColorSpace;
    const L = LOOK[look], hc = new THREE.Color(L.colors[1]).offsetHSL(tint * 0.13, 0, 0);
    const mitt = new THREE.SphereGeometry(1, 20, 14);
    this.hands = [new THREE.Mesh(mitt, L.hand(hc)), new THREE.Mesh(mitt, L.hand(hc))];
    this.hands.forEach((h) => { h.castShadow = L.shadows; this.pivot.add(h); });
    this.root.add(this.pivot);
  }
  /** (Re)build the block when its proportions change. */
  private build(P: Frame['P']): { w: number; h: number; d: number } {
    const s = P['body.size'] ?? 1, w = (P['body.w'] ?? 1) * 2 * s, h = (P['body.h'] ?? 1) * 2 * s, d = (P['body.d'] ?? 0.62) * 1.7 * s;
    const r = Math.min(Math.max(P['body.rt'] ?? 0.1, P['body.rb'] ?? 0.06, 0.04) * s * 1.4, Math.min(w, h, d) * 0.45);
    const key = [w, h, d, r].map((v) => v.toFixed(2)).join(',');
    if (key !== this.shape) {
      this.shape = key;
      [this.body, this.face, this.outline, this.edges].forEach((o) => { if (o) { this.pivot.remove(o); o.geometry.dispose(); } });
      const L = LOOK[this.look], bc = new THREE.Color(L.colors[0]).offsetHSL(this.tint * 0.13, 0, 0);
      const geo = new RoundedBoxGeometry(w, h, d, 4, r);
      this.body = new THREE.Mesh(geo, L.body(bc)); this.body.castShadow = L.shadows; this.body.receiveShadow = L.shadows; this.pivot.add(this.body);
      if (L.outline) { this.outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: L.outline, side: THREE.BackSide })); this.outline.scale.setScalar(1.035); this.pivot.add(this.outline); }
      else this.outline = null;
      if (L.edges) { this.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: L.edges, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending })); this.pivot.add(this.edges); }
      else this.edges = null;
      this.face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.98, h * 0.98), L.face(this.tex)); this.face.position.z = d / 2 + 0.004; this.pivot.add(this.face);
      this.body.position.y = this.face.position.y = h / 2;
      if (this.outline) this.outline.position.y = h / 2;
      if (this.edges) this.edges.position.y = h / 2;
    }
    return { w, h, d };
  }
  /** Pose the block from a frame. */
  update(F: Frame): void {
    const { w, h, d } = this.build(F.P), C = F.C, c = (k: string, v = 0) => C[k] ?? v;
    this.hold = drawFace(this.faceCanvas.ctx, FACE_W, FACE_W, F, LOOK[this.look].ink);
    this.tex.needsUpdate = true;
    const sq = c('squash');
    this.pivot.position.y = 0.35 + c('y') * h * 0.5;
    this.pivot.rotation.set(c('nod') * 0.5, c('twist') * 1.1, -c('lean') * 0.7);
    this.pivot.scale.set(1 + sq * 0.25, 1 - sq * 0.4, 1 + sq * 0.25);
    this.pivot.position.x = c('x') * w * 0.5;
    (['L', 'R'] as const).forEach((k, i) => {
      const q = this.hold[k], m = this.hands[i]!;
      m.visible = !!q; if (!q) return;
      const r = (F.P['hands.size'] ?? 0.2) * (F.P['body.size'] ?? 1) * 1.7;   // the design's own mitt size
      m.scale.set(r, r * 0.9, r * 0.8);
      m.position.set(q.x * w * 0.5, h / 2 + q.y * h * 0.5, d * 0.2 + c('hand' + k + '.z') * d * 0.6);
    });
  }
  dispose(): void {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose()); });
    this.tex.dispose();
  }
}

export class Stage3D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  readonly renderer: THREE.WebGLRenderer | null;
  readonly actors = new Map<string, Actor3D>();
  look: Look3D;
  set: Set3D;
  shotSpec: { frame: Framing3D; on?: string | string[] } = { frame: 'wide' };
  private setDef!: SetDef;
  private hemi = new THREE.HemisphereLight('#ffffff', '#887766', 1);
  private sun = new THREE.DirectionalLight('#ffffff', 2);
  private aim = new THREE.Vector3(0, 1.4, 0);
  private eye = new THREE.Vector3(0, 3, 12);
  private snap = true;
  private members: Member3D[] = [];

  constructor(o: Stage3DOptions = {}) {
    this.look = o.look || 'toon'; this.set = o.set || 'studio';
    this.renderer = o.canvas ? new THREE.WebGLRenderer({ canvas: o.canvas, antialias: true, preserveDrawingBuffer: true }) : null;
    if (this.renderer) {
      this.renderer.setPixelRatio(o.pixelRatio ?? 1);
      this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    }
    this.sun.position.set(-6, 12, 8); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024); Object.assign(this.sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -6, near: 1, far: 40 });
    this.sun.shadow.bias = -0.0005; this.sun.shadow.radius = 4;
    this.scene.add(this.hemi, this.sun);
    this.setSet(this.set);
  }
  /** Change what the actors are made of. */
  setLook(look: Look3D): this {
    if (look === this.look) return this;
    this.look = look; const keep = this.members; this.clearActors(); this.sync(keep); return this;
  }
  /** Change where they stand. */
  setSet(set: Set3D): this {
    if (this.setDef) { this.scene.remove(this.setDef.group); this.setDef.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    this.set = set; this.setDef = SET[set]();
    this.scene.add(this.setDef.group); this.scene.background = this.setDef.background; this.scene.fog = this.setDef.fog;
    this.hemi.intensity = this.setDef.ambient; this.sun.intensity = this.setDef.sun; this.sun.color.set(this.setDef.sunColor);
    return this;
  }
  /** Match the cast: add, remove and place actors. */
  sync(members: Member3D[]): this {
    this.members = members.slice();
    const ids = new Set(members.map((m) => m.id));
    this.actors.forEach((a, id) => { if (!ids.has(id)) { this.scene.remove(a.root); a.dispose(); this.actors.delete(id); } });
    members.forEach((m, i) => {
      let a = this.actors.get(m.id);
      if (!a) { a = new Actor3D(this.look, i); this.actors.set(m.id, a); this.scene.add(a.root); }
      a.root.position.set(m.x * SPREAD, 0, -m.z * 2.2);
    });
    return this;
  }
  /** Point the camera: 'wide' shows everyone, the others close in on `on`. `cut` jumps instead of easing. */
  shot(frame: Framing3D, on?: string | string[], cut?: boolean): this { this.shotSpec = { frame, on }; if (cut) this.snap = true; return this; }
  /** Pose everyone from their actors' frames, move the camera, and render (if there is a renderer). */
  draw(t: number, dt = 0): void {
    this.members.forEach((m) => { const a = this.actors.get(m.id); if (a) a.update(m.actor.frame(t)); });
    this.moveCamera(dt);
    if (this.renderer) this.renderer.render(this.scene, this.camera);
  }
  resize(w: number, h: number): void {
    this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix();
    if (this.renderer) this.renderer.setSize(w, h, false);
    this.snap = true;
  }
  dispose(): void { this.clearActors(); if (this.renderer) this.renderer.dispose(); }

  private clearActors(): void { this.actors.forEach((a) => { this.scene.remove(a.root); a.dispose(); }); this.actors.clear(); }
  private moveCamera(dt: number): void {
    const on = this.shotSpec.on == null ? null : Array.isArray(this.shotSpec.on) ? this.shotSpec.on : [this.shotSpec.on];
    const picked = Array.from(this.actors.entries()).filter(([id]) => !on || on.includes(id)).map(([, a]) => a);
    const list = picked.length ? picked : Array.from(this.actors.values());
    const box = new THREE.Box3(); list.forEach((a) => box.expandByObject(a.root));
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2.5, 1));
    const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const f = this.shotSpec.frame, tight = f === 'close' ? 0.55 : f === 'medium' ? 0.8 : f === 'full' ? 1.25 : 1.55;
    const vfov = (this.camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const need = Math.max((size.y * tight) / 2 / Math.tan(vfov / 2), (size.x * tight) / 2 / Math.tan(hfov / 2)) + size.z;
    const aimY = f === 'close' ? box.max.y - size.y * 0.32 : mid.y;
    const aim = new THREE.Vector3(mid.x, aimY, mid.z), eye = new THREE.Vector3(mid.x + need * 0.18, aimY + need * 0.16, mid.z + need);
    const k = this.snap ? 1 : 1 - Math.exp(-3.5 * dt);
    this.aim.lerp(aim, k); this.eye.lerp(eye, k); this.snap = false;
    this.camera.position.copy(this.eye); this.camera.lookAt(this.aim);
  }
}

export function createStage3D(o: Stage3DOptions = {}): Stage3D { return new Stage3D(o); }
