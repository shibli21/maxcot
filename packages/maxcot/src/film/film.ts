// maxcot/film: Player (a film's clock and actor) and Editor (a DOM timeline).
import K from '../kit.js';
import { Actor } from '../rig.js';
import { CAST } from '../design.js';
import { render, camera, type RenderOptions } from '../character.js';
import type { Ctx2D, Framing, Skin } from '../types.js';

// ── the film format ─────────────────────────────────────────────────────────
export interface FilmCamera { id?: string; label?: string; frame: Framing | string; on?: string; kind?: 'handheld' | 'push' | 'speaker' | string }
/** Something that happens at `at` seconds into its shot. */
export interface FilmBeat { at: number; pose?: string | string[]; look?: string }
export interface Shot { id: string; from: number; len: number; camera: FilmCamera; beats: FilmBeat[] }
/** Who plays the part between `from` and `to`. */
export interface WhoSegment { from: number; to: number; who: string }
/** Which skin draws it between `from` and `to`; `blend: 'wipe'` wipes in from the previous one. */
export interface StyleSegment { from: number; to: number; style: string; blend?: 'wipe' }
export interface Film {
  title: string;
  actor: { key: string; label: string };
  shots: Shot[];
  tracks: { who?: WhoSegment[]; style?: StyleSegment[] };
  /** Alternative cameras for multicam switching. */
  cameras?: FilmCamera[];
  end?: { card: 'logo'; len: number; text?: string };
}
export type TrackName = 'who' | 'style';
export type Aspect = 'wide' | 'tall' | 'square' | 'portrait';
type TimedBeat = FilmBeat & { t: number; shot: string };

// ── hand-lettered end card ───────────────────────────────────────────────
/** Draw a hand-lettered title card, revealed left to right over `t` seconds. */
export function card(ctx: Ctx2D, w: number, h: number, t: number, text: string): void {
  K.paper(ctx, w, h, '#f2f1ea', 1);
  const buf = K.buffer('card', w, h), c = buf.ctx, fs = Math.min(w / (text.length * 0.98 + 1.2), h * 0.26), rnd = K.rng(Math.floor(t * 8) + 3);
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
  c.save(); c.translate(w / 2, h / 2); c.transform(1, -0.08, -0.32, 1, 0, 0);
  c.font = 'italic 900 ' + fs + 'px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#000'; c.fillText(text, 0, 0); c.lineWidth = fs * 0.04; c.strokeStyle = '#000'; c.strokeText(text, 0, 0);
  c.restore();
  // scribble fill: keep the hatching only where the letters are
  c.globalCompositeOperation = 'source-in'; c.fillStyle = '#1c1c1c'; c.fillRect(0, 0, w, h);
  c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; c.lineWidth = Math.max(1, fs * 0.012);
  for (let d = -h; d < w; d += fs * 0.055) { c.beginPath(); c.moveTo(d + rnd() * 3, h); c.lineTo(d + h * 0.9 + rnd() * 3, 0); c.stroke(); }
  c.globalCompositeOperation = 'source-over';
  const reveal = K.clamp(t / 0.6, 0, 1);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * reveal * 1.1, h); ctx.clip(); ctx.drawImage(buf.canvas, 0, 0); ctx.restore();
}

// ── Player ───────────────────────────────────────────────────────────────
export interface PlayerOptions {
  /** name → skin, so the film's tracks can name their styles as plain strings. */
  skins?: Record<string, Skin>;
  cardText?: string;
}
export interface PlayerRenderOptions { palette?: string; camIndex?: number; t?: number; cardText?: string }

/** Plays a Film: its clock, its actor, and what to draw at any moment. */
export class Player {
  film: Film;
  skins: Record<string, Skin>;
  cardText: string;
  t = 0;
  playing = false;
  /** Index into film.cameras that overrides the shot's own camera. */
  camOverride: number | null = null;
  aspect: Aspect = 'wide';
  key = 'film';
  total: number;
  who = '';
  actor!: Actor;

  constructor(film: Film, o: PlayerOptions = {}) {
    this.film = film; this.skins = o.skins || {}; this.cardText = o.cardText || (film.end && film.end.text) || 'MAXCOT';
    this.total = film.shots.reduce((a, s) => Math.max(a, s.from + s.len), 0) + (film.end ? film.end.len : 0);
    this.seek(0);
  }
  /** Every beat on the film's own clock, in order. */
  beats(): TimedBeat[] {
    const out: TimedBeat[] = [];
    this.film.shots.forEach((s) => { s.beats.forEach((b) => { out.push(Object.assign({ t: s.from + b.at, shot: s.id }, b)); }); });
    return out.sort((a, b) => a.t - b.t);
  }
  segAt(track: 'who', t: number): WhoSegment | null;
  segAt(track: 'style', t: number): StyleSegment | null;
  segAt(track: TrackName, t: number): WhoSegment | StyleSegment | null {
    const L: Array<WhoSegment | StyleSegment> = this.film.tracks[track] || [];
    for (const s of L) if (t >= s.from && t < s.to) return s;
    return null;
  }
  whoAt(t: number): string { const s = this.segAt('who', t); return s ? s.who : this.film.actor.key; }
  styleAt(t: number): StyleSegment | { style: string; from?: number; blend?: undefined } {
    const s = this.segAt('style', t); if (s) return s;
    let prev: StyleSegment | null = null; (this.film.tracks.style || []).forEach((x) => { if (x.to <= t) prev = x; });
    return prev || { style: 'pencil' };
  }
  shotAt(t: number): Shot | null { for (const s of this.film.shots) if (t >= s.from && t < s.from + s.len) return s; return null; }
  private apply(b: FilmBeat): void { if (b.pose) this.actor.pose(b.pose); if (b.look) this.actor.gaze = b.look; }
  /** Jump to t: a fresh actor with every earlier beat applied, settled. */
  seek(t: number): void {
    this.t = K.clamp(t, 0, this.total); this.who = this.whoAt(this.t);
    this.actor = new Actor({ who: this.who, t: this.t });
    this.beats().forEach((b) => { if (b.t <= this.t) this.apply(b); });
    this.actor.snap();
  }
  update(dt: number): void {
    if (this.playing) {
      const t0 = this.t, t1 = Math.min(this.total, this.t + dt);
      this.beats().forEach((b) => { if (b.t > t0 && b.t <= t1) this.apply(b); });
      this.t = t1; if (t1 >= this.total) this.playing = false;
    }
    const who = this.whoAt(this.t); if (who !== this.who) { this.who = who; this.actor.cast(who); }
    this.actor.update(this.playing ? dt : Math.min(dt, 0.02));
  }
  camera(override?: number): FilmCamera {
    const shot = this.shotAt(this.t), cams = this.film.cameras || [];
    const c = override != null ? cams[override] : (this.camOverride != null ? cams[this.camOverride] : null);
    return c ? c : (shot ? shot.camera : { frame: 'full' });
  }
  /** Draw the current moment: the shot through its camera in its skin, or the end card. */
  render(ctx: Ctx2D, w: number, h: number, o: PlayerRenderOptions = {}): void {
    const endFrom = this.total - (this.film.end ? this.film.end.len : 0);
    if (this.t >= endFrom && this.film.end) { card(ctx, w, h, this.t - endFrom, o.cardText || this.cardText); return; }
    const seg = this.styleAt(this.t), cam = this.camera(o.camIndex), F = this.actor.frame(), t = this.t;
    const cm = camera(F.P, w, h, cam.frame || 'full'), skins = this.skins, sk = (n: string): Skin => (skins[n] || skins.pencil)!;
    if (cam.kind === 'handheld') { cm.cx += K.noise(t * 1.3, 1) * w * 0.02; cm.cy += K.noise(t * 1.1, 2) * h * 0.02; }
    const shot = this.shotAt(t); if (cam.kind === 'push' && shot) cm.unit *= 1 + 0.15 * (t - shot.from) / shot.len;
    const key = this.key + (o.camIndex == null ? '' : o.camIndex);
    const opts: RenderOptions = { skin: sk(seg.style), palette: o.palette, t: o.t == null ? performance.now() / 1000 : o.t, key: key, cam: cm };
    const since = t - (seg.from || 0);
    if (seg.blend === 'wipe' && since >= 0 && since < 0.3) {
      const prev = this.styleAt((seg.from || 0) - 0.001);
      render(ctx, w, h, F, Object.assign({}, opts, { skin: sk(prev.style) }));
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * since / 0.3, h); ctx.clip();
      render(ctx, w, h, F, opts); ctx.restore();
    } else render(ctx, w, h, F, opts);
  }
}

// ── Editor: shots / camera / who plays it / style ───────────────────────
function el<K2 extends keyof HTMLElementTagNameMap>(tag: K2, cls?: string, txt?: string): HTMLElementTagNameMap[K2] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e;
}
export interface EditorOptions {
  /** A block was selected: show a picker for that row. */
  onPick?: (row: TrackName, seg: WhoSegment | StyleSegment) => void;
  /** The film's tracks changed (a block was retimed or reassigned). */
  onChange?: () => void;
  onAspect?: (aspect: Aspect) => void;
}

/** A timeline for a Player: shots, cameras, who plays it and style, with draggable block edges. */
export class Editor {
  player: Player;
  /** Pixels per second. */
  pps = 60;
  sel: { row: TrackName; i: number } | null = null;
  picker: HTMLDivElement;
  private onPick?: EditorOptions['onPick'];
  private onChange?: EditorOptions['onChange'];
  private btn: HTMLButtonElement;
  private clock: HTMLSpanElement;
  private aspects: Partial<Record<Aspect, HTMLButtonElement>> = {};
  private ruler: HTMLDivElement;
  private rows: Record<string, { label: HTMLDivElement; lane: HTMLDivElement }> = {};
  private head: HTMLDivElement;

  constructor(host: HTMLElement, player: Player, o: EditorOptions = {}) {
    this.player = player; this.onPick = o.onPick; this.onChange = o.onChange;
    host.innerHTML = '';
    const head = el('div', 'tl-head');
    this.btn = el('button', 'tl-btn', 'Play'); this.btn.onclick = () => { player.playing = !player.playing; if (player.t >= player.total) player.seek(0); };
    this.clock = el('span', 'tl-clock', '0.00 / ' + player.total.toFixed(2) + ' s');
    head.appendChild(this.btn); head.appendChild(this.clock);
    ([['wide', 'Wide', '16:9'], ['tall', 'Tall', '9:16'], ['square', 'Square', '1:1'], ['portrait', 'Portrait', '4:5']] as Array<[Aspect, string, string]>).forEach((a) => {
      const b = el('button', 'tl-btn asp'); b.innerHTML = a[1] + ' <small>' + a[2] + '</small>'; b.onclick = () => { player.aspect = a[0]; this.sync(); if (o.onAspect) o.onAspect(a[0]); };
      this.aspects[a[0]] = b; head.appendChild(b);
    });
    host.appendChild(head);
    const grid = el('div', 'tl-grid');
    const zoom = el('div', 'tl-zoom'), zm = el('button', 'tl-btn', '−'), zp = el('button', 'tl-btn', '+');
    zm.onclick = () => { this.pps = Math.max(20, this.pps / 1.25); this.layout(); }; zp.onclick = () => { this.pps = Math.min(240, this.pps * 1.25); this.layout(); };
    zoom.appendChild(zm); zoom.appendChild(zp);
    this.ruler = el('div', 'tl-lane tl-ruler'); grid.appendChild(zoom); grid.appendChild(this.ruler);
    ([['shots', 'Shots'], ['camera', 'Camera'], ['actor', player.film.actor.label, true], ['who', 'Who plays it'], ['style', 'Style']] as Array<[string, string, boolean?]>).forEach((r) => {
      const lab = el('div', 'tl-label' + (r[2] ? ' tl-actor' : ''), r[1]), lane = el('div', 'tl-lane' + (r[2] ? ' tl-actor' : ''));
      grid.appendChild(lab); grid.appendChild(lane); this.rows[r[0]] = { label: lab, lane: lane };
      lane.addEventListener('mousedown', (e) => { if (e.target === lane) this.seekTo(e, lane); });
    });
    this.ruler.addEventListener('mousedown', (e) => { this.seekTo(e, this.ruler); });
    this.head = el('div', 'tl-playhead'); grid.appendChild(this.head);
    host.appendChild(grid);
    this.picker = el('div', 'tl-picker'); host.appendChild(this.picker);
    this.layout();
  }
  private px(t: number): number { return Math.round(t * this.pps); }
  private lane(name: string): HTMLDivElement { return this.rows[name]!.lane; }
  private seekTo(e: MouseEvent, lane: HTMLElement): void { const r = lane.getBoundingClientRect(); this.player.seek((e.clientX - r.left + lane.scrollLeft) / this.pps); }
  private place(b: HTMLElement, t0: number, t1: number): void { b.style.left = this.px(t0) + 'px'; b.style.width = Math.max(4, this.px(t1) - this.px(t0) - 2) + 'px'; }
  /** Rebuild the blocks from the film. */
  layout(): void {
    const P = this.player, F = P.film, total = P.total;
    this.ruler.innerHTML = '';
    for (let s = 0; s <= total; s += 2) { const tk = el('span', 'tl-tick', String(s)); tk.style.left = this.px(s) + 'px'; this.ruler.appendChild(tk); }
    Object.keys(this.rows).forEach((k) => { if (k !== 'actor') this.lane(k).innerHTML = ''; this.lane(k).style.minWidth = this.px(total) + 'px'; });
    const endFrom = total - (F.end ? F.end.len : 0);
    const FRAME_LABEL: Record<string, string> = { full: 'Full', close: 'Close', medium: 'Medium' };
    F.shots.forEach((sh) => {
      const b = el('div', 'blk', sh.id); this.place(b, sh.from, sh.from + sh.len); this.lane('shots').appendChild(b);
      const c = el('div', 'blk', FRAME_LABEL[sh.camera.frame] || sh.camera.frame); this.place(c, sh.from, sh.from + sh.len); this.lane('camera').appendChild(c);
    });
    if (F.end) { const eb = el('div', 'blk end', 'End card'); this.place(eb, endFrom, total); this.lane('shots').appendChild(eb); }
    const hatch = el('div', 'blk hatch'); this.place(hatch, 0, endFrom); this.lane('who').appendChild(hatch);
    (['who', 'style'] as TrackName[]).forEach((row) => {
      const segs: Array<WhoSegment | StyleSegment> = F.tracks[row] || [];
      segs.forEach((seg, i) => {
        const label = 'who' in seg ? (CAST[seg.who] || { label: seg.who }).label : (this.player.skins[seg.style] || { label: seg.style }).label;
        const b = el('div', 'blk edit' + (this.sel && this.sel.row === row && this.sel.i === i ? ' sel' : ''));
        b.innerHTML = '<i class="grip">∷</i>' + label;
        const hl = el('span', 'h l'), hr = el('span', 'h r'); b.appendChild(hl); b.appendChild(hr);
        this.place(b, seg.from, seg.to); this.lane(row).appendChild(b);
        b.addEventListener('mousedown', (e) => {
          e.stopPropagation(); this.select(row, i);
          if (e.target === hl || e.target === hr) this.drag(e, row, i, e.target === hl ? 'from' : 'to');
        });
      });
    });
    this.sync();
  }
  private drag(e: MouseEvent, row: TrackName, i: number, edge: 'from' | 'to'): void {
    const L: Array<WhoSegment | StyleSegment> = this.player.film.tracks[row] || [], seg = L[i]!, x0 = e.clientX, v0 = seg[edge];
    const lo = edge === 'from' ? (i > 0 ? L[i - 1]!.to : 0) : seg.from + 0.2, hi = edge === 'to' ? (L[i + 1] ? L[i + 1]!.from : this.player.total) : seg.to - 0.2;
    const move = (ev: MouseEvent) => { seg[edge] = Math.round(K.clamp(v0 + (ev.clientX - x0) / this.pps, lo, hi) * 20) / 20; this.layout(); if (this.onChange) this.onChange(); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  }
  /** Select a block (by default the one under the playhead) and open its picker. */
  select(row: TrackName, i?: number): void {
    const L: Array<WhoSegment | StyleSegment> = this.player.film.tracks[row] || [];
    if (i == null) { const t = this.player.t; let pick = 0; L.forEach((s, j) => { if (t >= s.from) pick = j; }); i = pick; }
    const seg = L[i]; if (!seg) return;
    this.sel = { row: row, i: i }; this.layout(); if (this.onPick) this.onPick(row, seg);
  }
  /** Set the selected block's actor or skin. */
  assign(value: string): void {
    if (!this.sel) return; const seg = (this.player.film.tracks[this.sel.row] || [])[this.sel.i]; if (!seg) return;
    if ('who' in seg) seg.who = value; else seg.style = value;
    this.layout(); this.player.seek(this.player.t); if (this.onChange) this.onChange();
  }
  /** Update the clock, the play button and the playhead. */
  sync(): void {
    const P = this.player; this.clock.textContent = P.t.toFixed(2) + ' / ' + P.total.toFixed(2) + ' s';
    this.btn.textContent = P.playing ? 'Pause' : 'Play';
    const lane = this.lane('shots'); this.head.style.left = (lane.offsetLeft + this.px(P.t)) + 'px';
    for (const k in this.aspects) this.aspects[k as Aspect]!.classList.toggle('on', k === P.aspect);
  }
}
