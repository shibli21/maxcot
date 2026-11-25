// sets.ts: where the actors stand. A photo studio's curved white cyclorama,
// a small room with a window and a lamp, and a street at night.
import * as THREE from 'three';
import { kit as K } from 'maxcot';

export type Set3D = 'studio' | 'room' | 'street';
export const SETS: Array<[Set3D, string, string]> = [
  ['studio', 'Studio', 'A curved white cyclorama under soft lights.'],
  ['room', 'Room', 'Wooden floor, a window, a lamp and a plant.'],
  ['street', 'Street', 'A street at night: lit windows and lamp posts.']
];

export interface SetDef { group: THREE.Group; background: THREE.Color; fog: THREE.Fog | null; ambient: number; sun: number; sunColor: string }

const mat = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9 }, o));
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, shadows = true): THREE.Mesh {
  const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.receiveShadow = shadows; o.castShadow = shadows; return o;
}
/** A canvas texture drawn by `draw`, or null where there is no canvas. */
function painted(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.Texture | null {
  try { const cv = K.createCanvas(w, h); draw(cv.getContext('2d') as CanvasRenderingContext2D); const t = new THREE.CanvasTexture(cv as unknown as HTMLCanvasElement); t.colorSpace = THREE.SRGBColorSpace; return t; } catch { return null; }
}

function studio(): SetDef {
  const g = new THREE.Group(), white = mat('#eeeeea', { roughness: 1 });
  const floor = mesh(new THREE.PlaneGeometry(60, 30), white, 0, 0, 0); floor.rotation.x = -Math.PI / 2; floor.castShadow = false; g.add(floor);
  // the cove: a quarter cylinder joining the floor to the back wall
  const cove = mesh(new THREE.CylinderGeometry(6, 6, 60, 24, 1, true, 0, Math.PI / 2), white, 0, 6, -9); cove.rotation.z = Math.PI / 2; cove.rotation.y = Math.PI; cove.castShadow = false; g.add(cove);
  const wall = mesh(new THREE.PlaneGeometry(60, 30), white, 0, 21, -15); wall.castShadow = false; g.add(wall);
  return { group: g, background: new THREE.Color('#e9e9e4'), fog: null, ambient: 1.4, sun: 2.2, sunColor: '#ffffff' };
}

function room(): SetDef {
  const g = new THREE.Group();
  const boards = painted(256, 256, (c) => { c.fillStyle = '#b07a4f'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#a46f45' : '#bb8558'; c.fillRect(0, i * 32, 256, 30); c.fillStyle = 'rgba(60,30,10,0.4)'; c.fillRect(0, i * 32 + 30, 256, 2); } });
  if (boards) { boards.wrapS = boards.wrapT = THREE.RepeatWrapping; boards.repeat.set(7, 7); }
  const floor = mesh(new THREE.PlaneGeometry(40, 40), mat('#ffffff', boards ? { map: boards } : { color: '#b07a4f' }), 0, 0, 12); floor.rotation.x = -Math.PI / 2; floor.castShadow = false; g.add(floor);
  const paper = mat('#e8d5b5');
  const back = mesh(new THREE.PlaneGeometry(24, 10), paper, 0, 5, -8); back.castShadow = false; g.add(back);
  const left = mesh(new THREE.PlaneGeometry(40, 10), paper, -12, 5, 12); left.rotation.y = Math.PI / 2; left.castShadow = false; g.add(left);
  // the window: sky behind a frame
  g.add(mesh(new THREE.PlaneGeometry(3.6, 2.6), new THREE.MeshBasicMaterial({ color: '#bfe3ff' }), 4, 5.2, -7.98, false));
  const frame = mat('#f4f1ea');
  [[4, 6.5, 3.8, 0.15], [4, 3.9, 3.8, 0.15], [2.2, 5.2, 0.15, 2.75], [5.8, 5.2, 0.15, 2.75], [4, 5.2, 0.1, 2.6]].forEach(([x, y, w, h]) => g.add(mesh(new THREE.BoxGeometry(w!, h!, 0.12), frame, x!, y!, -7.9)));
  // a rug, a lamp and a plant
  const rug = mesh(new THREE.CircleGeometry(3.2, 40), mat('#c0504d'), 0, 0.01, -0.5); rug.rotation.x = -Math.PI / 2; rug.castShadow = false; g.add(rug);
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 8), mat('#333'), -5, 1.7, -5.5));
  g.add(mesh(new THREE.ConeGeometry(0.8, 0.9, 24, 1, true), mat('#f6e7b0', { side: THREE.DoubleSide, emissive: '#f6d77a', emissiveIntensity: 0.6 }), -5, 3.6, -5.5));
  const bulb = new THREE.PointLight('#ffd89a', 18, 12); bulb.position.set(-5, 3.4, -5.5); g.add(bulb);
  g.add(mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.8, 16), mat('#d9b38c'), 6.5, 0.4, -5));
  g.add(mesh(new THREE.SphereGeometry(0.9, 16, 12), mat('#4f8a3a'), 6.5, 1.5, -5));
  return { group: g, background: new THREE.Color('#e8d5b5'), fog: null, ambient: 1.0, sun: 1.6, sunColor: '#fff3df' };
}

function street(): SetDef {
  const g = new THREE.Group();
  const road = mesh(new THREE.PlaneGeometry(80, 40), mat('#2b2d33', { roughness: 0.75 }), 0, 0, 0); road.rotation.x = -Math.PI / 2; road.castShadow = false; g.add(road);
  const walk = mesh(new THREE.BoxGeometry(80, 0.2, 5), mat('#5c5f66'), 0, 0.1, -7); walk.castShadow = false; g.add(walk);
  const windows = painted(128, 256, (c) => {
    c.fillStyle = '#1d1f2a'; c.fillRect(0, 0, 128, 256); const rnd = K.rng(3);
    for (let y = 12; y < 250; y += 28) for (let x = 10; x < 120; x += 28) { c.fillStyle = rnd() < 0.55 ? '#ffd27a' : '#2c3040'; c.fillRect(x, y, 16, 18); }
  });
  const rnd = K.rng(9);
  for (let i = -4; i <= 4; i++) {
    const h = 6 + rnd() * 8, w = 5 + rnd() * 3;
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, ...(windows && { map: windows, emissiveMap: windows, emissive: '#ffffff', emissiveIntensity: 0.9 }) });
    g.add(mesh(new THREE.BoxGeometry(w, h, 4), m, i * 8.5, h / 2, -12 - rnd() * 3));
  }
  [-9, 0, 9].forEach((x) => {
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8), mat('#1b1c20'), x, 2.1, -5.2));
    g.add(mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff1c4' }), x, 4.3, -5.2, false));
    const lamp = new THREE.PointLight('#ffd58a', 30, 14); lamp.position.set(x, 4.1, -5); g.add(lamp);
  });
  return { group: g, background: new THREE.Color('#0d1024'), fog: new THREE.Fog('#0d1024', 18, 45), ambient: 0.35, sun: 0.5, sunColor: '#9fb4ff' };
}

export const SET: Record<Set3D, () => SetDef> = { studio, room, street };
