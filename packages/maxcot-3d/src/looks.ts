// looks.ts: what a 3D actor is made of. Toon (cel-shaded with an outline),
// clay (matte plasticine with a thumbed surface), toy (glossy vinyl under a
// clear coat) and hologram (additive light and a wire cage).
import * as THREE from 'three';
import { kit as K, type Part } from 'maxcot';
import type { FaceInk } from './face.js';

export type Look3D = 'toon' | 'clay' | 'toy' | 'hologram';
export const LOOKS: Array<[Look3D, string, string]> = [
  ['toon', 'Toon', 'Cel-shaded in three tones with an ink outline.'],
  ['clay', 'Clay', 'Matte plasticine with a thumbed surface.'],
  ['toy', 'Vinyl toy', 'Glossy vinyl under a clear coat.'],
  ['hologram', 'Hologram', 'Additive light and a wire cage.']
];

export interface LookDef {
  body(color: THREE.Color): THREE.Material;
  hand(color: THREE.Color): THREE.Material;
  /** The face texture's material. */
  face(map: THREE.Texture): THREE.Material;
  /** An inked silhouette (inverted hull) in this colour, or null. */
  outline: string | null;
  /** Wire edges in this colour, or null. */
  edges: string | null;
  /** Casts and takes shadows. */
  shadows: boolean;
  ink: FaceInk;
  /** Base colours for body and hands; each actor on stage gets a hue shift. */
  colors: [string, string];
}

const INK: Record<string, string> = { pupil: '#1d1b26', brow: '#1d1b26', mouth: '#5b1f2a', teeth: '#ffffff', tongue: '#ef6f7f', eyeWhite: '#ffffff', glint: '#ffffff', blush: 'rgba(255,110,130,0.45)', tear: '#8fd0ff', heart: '#ff4d6d' };
const inkFill = (pal: Record<string, string>) => (p: Part) => (p.fill ? pal[p.fill] ?? null : null);

let gradient: THREE.DataTexture | null = null;
function toonRamp(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
  }
  return gradient;
}
let thumbs: THREE.Texture | null = null;
/** A soft, uneven surface for clay, drawn once. */
function clayBump(): THREE.Texture | null {
  if (thumbs) return thumbs;
  try {
    const c = K.createCanvas(256, 256), x = c.getContext('2d') as CanvasRenderingContext2D, rnd = K.rng(11);
    x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
      const cx = rnd() * 256, cy = rnd() * 256, r = 6 + rnd() * 18, g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      const v = rnd() < 0.5 ? 60 : 200; g.addColorStop(0, 'rgba(' + v + ',' + v + ',' + v + ',0.35)'); g.addColorStop(1, 'rgba(128,128,128,0)');
      x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    thumbs = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); thumbs.wrapS = thumbs.wrapT = THREE.RepeatWrapping;
    return thumbs;
  } catch { return null; }
}

export const LOOK: Record<Look3D, LookDef> = {
  toon: {
    body: (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonRamp() }),
    hand: (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: toonRamp() }),
    face: (map) => new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.04 }),
    outline: '#1d1b26', edges: null, shadows: true, colors: ['#7bd389', '#ff6b6b'],
    ink: { ink: '#1d1b26', lw: 0.016, fill: inkFill(INK) }
  },
  clay: {
    body: (c) => { const b = clayBump(); return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, ...(b && { bumpMap: b, bumpScale: 2 }) }); },
    hand: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
    face: (map) => new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.04, roughness: 0.9 }),
    outline: null, edges: null, shadows: true, colors: ['#e07a3f', '#f2c14e'],
    ink: { ink: '#2a1f1a', lw: 0.02, fill: inkFill(Object.assign({}, INK, { pupil: '#2a1f1a', brow: '#2a1f1a' })) }
  },
  toy: {
    body: (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 }),
    hand: () => new THREE.MeshPhysicalMaterial({ color: '#fafafa', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
    face: (map) => new THREE.MeshPhysicalMaterial({ map, transparent: true, alphaTest: 0.04, roughness: 0.3, clearcoat: 1 }),
    outline: null, edges: null, shadows: true, colors: ['#4fa3ff', '#fafafa'],
    ink: { ink: '#14213d', lw: 0.012, fill: inkFill(Object.assign({}, INK, { pupil: '#14213d', brow: '#14213d' })) }
  },
  hologram: {
    body: (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    hand: (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }),
    face: (map) => new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    outline: null, edges: '#5ff4ff', shadows: false, colors: ['#3ff4ff', '#3ff4ff'],
    ink: { ink: '#bffaff', lw: 0.014, glow: '#3ff4ff', fill: (p) => (p.fill === 'pupil' || p.fill === 'brow' ? '#bffaff' : p.fill === 'mouth' ? 'rgba(63,244,255,0.5)' : null) }
  }
};
