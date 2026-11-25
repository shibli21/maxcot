// puppet.ts: play an actor live with a mouse, a keyboard or a gamepad.
//
// Inputs set targets; every frame the puppet eases toward them and writes the
// result into actor.offsets (gaze, lean, nod, an open mouth, the hands), so a
// puppet plays on top of whatever pose the actor holds. Buttons and number
// keys fire poses from a bank. The input methods (point, button, key, pad)
// are plain calls, so anything (a test, a MIDI controller, a webcam tracker)
// can drive it too.
import type { Channels } from '../types.js';

/** Anything with offsets to drive and poses to strike: an Actor, or your own object. */
export interface PuppetTarget { offsets: Channels | null; pose(name: string | string[]): unknown }

/** The poses on number keys 1-9 (and gamepad buttons A, B, X, Y take the first four). */
export const DEFAULT_BANK = ['wave', 'thumbsup', 'point-you', 'shrug', 'facepalm', 'cheer', 'feel-happy', 'feel-surprised', 'feel-furious'];

export interface PuppetOptions {
  target?: PuppetTarget | null;
  /** Poses for keys 1-9. */
  bank?: string[];
  /** Pose for key 0 and for letting go: default 'rest'. */
  rest?: string;
  /** How fast the puppet follows its inputs (per second). Default 12. */
  follow?: number;
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
/** Gamepad sticks rest a little off centre: ignore the first 15%. */
const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);

export class Puppet {
  target: PuppetTarget | null;
  bank: string[];
  rest: string;
  follow: number;
  /** Called with each pose the puppeteer strikes (to record a take, say). */
  onPose: ((name: string) => void) | null = null;
  /** Called with a sideways step (-1 or 1) when A/D or the d-pad is pressed (the host moves the actor). */
  onStep: ((dir: number) => void) | null = null;
  /** The last pose struck. */
  pose = '';
  /** Where the inputs want things, each -1..1 (mouth 0..1). */
  aim = { x: 0, y: 0, mouth: 0, handX: 0, handY: 0, squash: 0 };
  /** Where things are now (eased toward `aim`). */
  now = { x: 0, y: 0, mouth: 0, handX: 0, handY: 0, squash: 0, hop: 0 };
  /** The connected gamepad's name, if one is in use. */
  gamepad: string | null = null;
  private pointerDown = false;
  /** The sticks took over from the pointer (until the pointer moves again). */
  private usingPad = false;
  private keysDown = new Set<string>();
  private padPrev: boolean[] = [];
  private hopT = -1;
  private el: HTMLElement | null = null;
  private off: Array<() => void> = [];

  constructor(o: PuppetOptions = {}) {
    this.target = o.target || null; this.bank = (o.bank || DEFAULT_BANK).slice(); this.rest = o.rest || 'rest'; this.follow = o.follow ?? 12;
  }
  /** Play another actor (the old one is let go). */
  attach(target: PuppetTarget | null): this {
    if (this.target && this.target !== target) this.target.offsets = null;
    this.target = target; return this;
  }

  // ── inputs: call these directly, or let bind() wire them to the page ──
  /** The pointer at (nx, ny), each -1..1 from the centre of the stage. */
  point(nx: number, ny: number): void { this.usingPad = false; this.aim.x = clamp(nx, -1, 1); this.aim.y = clamp(ny, -1, 1); }
  /** The main button (or a held key): opens the mouth. */
  button(down: boolean): void { this.pointerDown = down; this.aim.mouth = down ? 1 : 0; }
  /** A key went down or up (KeyboardEvent.code). Returns true if the puppet used it. */
  key(code: string, down: boolean): boolean {
    const digit = /^(Digit|Numpad)([0-9])$/.exec(code);
    if (digit) { if (down && !this.keysDown.has(code)) this.strike(+digit[2]! === 0 ? this.rest : this.bank[+digit[2]! - 1]); this.mark(code, down); return true; }
    if (code === 'KeyW') { if (down && !this.keysDown.has(code)) this.hop(); this.mark(code, down); return true; }
    if (code === 'KeyA' || code === 'KeyD') { if (down && !this.keysDown.has(code) && this.onStep) this.onStep(code === 'KeyA' ? -1 : 1); this.mark(code, down); return true; }
    if (code === 'KeyS') { this.aim.squash = down ? 1 : 0; this.mark(code, down); return true; }
    if (code === 'KeyM') { this.aim.mouth = down || this.pointerDown ? 1 : 0; this.mark(code, down); return true; }
    return false;
  }
  /** A gamepad reading in the standard layout: sticks, triggers, face buttons, d-pad. */
  pad(axes: readonly number[], buttons: ReadonlyArray<{ pressed: boolean; value: number }>): void {
    const ax = (i: number) => dead(axes[i] || 0), b = (i: number) => buttons[i] || { pressed: false, value: 0 };
    const edge = (i: number) => { const p = b(i).pressed, was = !!this.padPrev[i]; this.padPrev[i] = p; return p && !was; };
    if ([0, 1, 2, 3].some((i) => ax(i) !== 0) || b(6).value > 0.05 || b(7).value > 0.05) this.usingPad = true;
    if (this.usingPad) {
      this.aim.x = ax(0); this.aim.y = ax(1);
      this.aim.handX = ax(2); this.aim.handY = ax(3);
      this.aim.mouth = Math.max(b(7).value, this.pointerDown ? 1 : 0);
      this.aim.squash = b(6).value;
    }
    [0, 1, 2, 3].forEach((i) => { if (edge(i)) this.strike(this.bank[i]); });
    if (edge(4) || edge(5)) this.hop();
    if (edge(14) && this.onStep) this.onStep(-1);
    if (edge(15) && this.onStep) this.onStep(1);
    if (edge(12)) this.strike(this.rest);
    if (edge(13)) this.hop();
  }
  /** Strike a pose now. */
  strike(name: string | undefined): void {
    if (!name || !this.target) return;
    this.target.pose(name); this.pose = name; if (this.onPose) this.onPose(name);
  }
  hop(): void { this.hopT = 0; }

  /** Ease toward the inputs and write the actor's offsets. Call once a frame. */
  update(dt: number): Channels | null {
    this.poll();
    const a = 1 - Math.exp(-this.follow * dt), n = this.now, m = this.aim;
    (['x', 'y', 'mouth', 'handX', 'handY', 'squash'] as const).forEach((k) => { n[k] += (m[k] - n[k]) * (k === 'mouth' ? Math.min(1, a * 2) : a); });
    if (this.hopT >= 0) { this.hopT += dt; n.hop = Math.sin(Math.min(1, this.hopT / 0.42) * Math.PI); if (this.hopT >= 0.42) { this.hopT = -1; n.hop = 0; } }
    const o: Channels = {
      'eyes.lookX': n.x * 0.9, 'eyes.lookY': n.y * 0.7,
      twist: n.x * 0.32, lean: n.x * 0.08, nod: n.y * 0.12,
      'mouth.open': n.mouth * 0.85, 'mouth.round': n.mouth * 0.25,
      'handR.x': n.handX * 0.35, 'handR.y': -n.handY * 0.3, 'handL.x': n.handX * 0.35, 'handL.y': -n.handY * 0.3,
      squash: n.squash * 0.35, y: n.hop * 0.22
    };
    if (this.target) this.target.offsets = o;
    return o;
  }

  // ── the page: pointer over an element, keys on the window, the first gamepad ──
  /** Listen to the pointer over `element` and to the keyboard. Keys typed into text fields are left alone. */
  bind(element: HTMLElement, keys: EventTarget = window): this {
    this.unbind(); this.el = element;
    const move = (e: PointerEvent) => { const r = element.getBoundingClientRect(); this.point(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1); };
    const down = (e: PointerEvent) => { if (e.button === 0) { this.button(true); move(e); } };
    const up = () => this.button(false);
    const typing = (e: Event) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox') || t.tagName === 'SELECT' || t.isContentEditable); };
    const kd = (e: Event) => { const k = e as KeyboardEvent; if (typing(k) || k.ctrlKey || k.metaKey || k.altKey) return; if (this.key(k.code, true)) { k.preventDefault(); k.stopImmediatePropagation(); } };
    const ku = (e: Event) => { const k = e as KeyboardEvent; if (this.key(k.code, false)) k.preventDefault(); };
    window.addEventListener('pointermove', move); element.addEventListener('pointerdown', down); window.addEventListener('pointerup', up);
    keys.addEventListener('keydown', kd, { capture: true }); keys.addEventListener('keyup', ku, { capture: true });
    this.off = [
      () => window.removeEventListener('pointermove', move), () => element.removeEventListener('pointerdown', down), () => window.removeEventListener('pointerup', up),
      () => keys.removeEventListener('keydown', kd, { capture: true }), () => keys.removeEventListener('keyup', ku, { capture: true })
    ];
    return this;
  }
  /** Stop listening and let the actor go. */
  unbind(): void {
    this.off.forEach((f) => f()); this.off = []; this.el = null; this.keysDown.clear(); this.pointerDown = false;
    this.aim = { x: 0, y: 0, mouth: 0, handX: 0, handY: 0, squash: 0 };
    if (this.target) this.target.offsets = null;
  }
  get bound(): boolean { return this.el !== null; }

  private mark(code: string, down: boolean): void { if (down) this.keysDown.add(code); else this.keysDown.delete(code); }
  private poll(): void {
    if (!this.el || typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const p = Array.from(navigator.getGamepads()).find((g) => g && g.connected);
    this.gamepad = p ? p.id : null;
    if (p) this.pad(p.axes, p.buttons);
  }
}

export function createPuppet(o: PuppetOptions = {}): Puppet { return new Puppet(o); }
