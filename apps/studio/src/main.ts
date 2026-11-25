// main.ts: the studio. Views (single, sizes, sheets, aspects, film, card),
// the side panel (Styles, Tune, Poses, Design, Motion), the two code panes and
// the transport. Every score command lands in CMD below; the UI calls the same
// functions, so anything the score can do, a person can do by hand.
import { kit as K, Actor, Character, Stage, CAST, DESIGN, POSES, POSE_SECTIONS, render, type DesignRow, type DesignValues, type Manner, type Skin, type StageFraming } from 'maxcot';
import { GROUPS, allSkins, skinsByName } from 'maxcot/skins';
import { Editor, Player, card, type EditRow, type Film, type SoundClip, type StyleSegment, type WhoSegment } from 'maxcot/film';
import { SFX, SFX_LABEL, clipSamples, sfx as sfxSamples } from 'maxcot/sound';
import { createConductor, parseScore, type CommandContext, type Conductor, type ScheduledEvent, type ScoreEvent } from 'maxcot/score';
import { Voice, babble, lipTrack, lipsAt, pitchOf, type Lips } from 'maxcot/voice';
import hello from './hello';
import Beat from './beat';
import Mixer from './mixer';
import { decodeShare, encodeShare, fileName, makeProject, readProject, type Project } from './project';
import './studio.css';
// The code panes show the real source files.
import characterSrc from '../../../packages/maxcot/src/character.ts?raw';
import rigSrc from '../../../packages/maxcot/src/rig.ts?raw';
import designSrc from '../../../packages/maxcot/src/design.ts?raw';
import drawnSrc from '../../../packages/maxcot/src/skins/drawn.ts?raw';
import printSrc from '../../../packages/maxcot/src/skins/print.ts?raw';
import screensSrc from '../../../packages/maxcot/src/skins/screens.ts?raw';
import glitchSrc from '../../../packages/maxcot/src/skins/glitch.ts?raw';
import filmSrc from '../../../packages/maxcot/src/film/film.ts?raw';
import voiceSrc from '../../../packages/maxcot/src/voice/analyze.ts?raw';
import sfxSrc from '../../../packages/maxcot/src/sound/sfx.ts?raw';
import tourScoreRaw from './scores/tour.score?raw';
import mainSrc from './main.ts?raw';
// textareas normalise line endings, so compare against the same form
const tourScore = tourScoreRaw.replace(/\r\n?/g, '\n');

type Mode = 'single' | 'sizes' | 'sheet' | 'deal' | 'faces' | 'aspects' | 'film' | 'card';
type Panel = 'Styles' | 'Tune' | 'Poses' | 'Design' | 'Motion' | 'Voice';
interface StudioState {
  actor: Actor; style: string; palette: string; guides: boolean; mode: Mode;
  sizesUpTo: number; grid: number; sheetKind: string; dealSeed: number; faces: number;
  panel: Panel | null; panelHolo?: boolean; editRow: EditRow | null; multicam: boolean;
  card: { text: string; start: number } | null; pointer: { start: number } | null;
  clock: number; rev: number; revAt: number; panelRev: number; created: boolean;
  src: [string, string?] | null; instant?: boolean;
  /** Who score commands without `on:` are for, and who the panels edit. */
  lead: string; selected: string;
}
interface Tile { h: Character; shared: boolean; anim: boolean; c: HTMLCanvasElement }
interface TileOptions { actor: Actor; style: string; palette?: string; shared?: boolean; isStatic?: boolean; frame?: string; key: string; dpr?: number }
interface ThumbSpec { who?: string; design?: DesignValues; pose?: string; style: string; palette?: string; frame?: string; key?: string }
type Command = (v: unknown, ev: ScheduledEvent, ctx: CommandContext) => void;

const SKINS = skinsByName();
const skin = (name: string): Skin => SKINS[name] || SKINS.pencil!;
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
const CAPTURE = /[?&]capture(=|&|$)/.test(location.search), SMOOTH: ScrollBehavior = CAPTURE ? 'auto' : 'smooth';
const $ = <T extends HTMLElement = HTMLElement>(s: string): T => document.querySelector(s) as T;
function el<T extends keyof HTMLElementTagNameMap>(tag: T, cls?: string | null, txt?: string): HTMLElementTagNameMap[T] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e;
}

const STYLE_ORDER = allSkins.map((s) => s.name);
const CAST_ORDER = ['max', 'child', 'girl', 'boss', 'clerk', 'teen', 'professor', 'oldman', 'grandma'];
const SECTION_LABEL: Record<string, string> = { attitudes: 'Attitudes', feelings: 'Feelings', eyes: 'Eyes', mouth: 'Mouth and tongues', hands: 'Hands', body: 'Body' };
const FACES = ['feel-happy', 'feel-furious', 'feel-sad', 'feel-surprised', 'feel-terrified', 'feel-plotting', 'feel-crying', 'feel-laughing', 'feel-bored', 'feel-flirting', 'feel-sulking', 'feel-proud', 'feel-embarrassed', 'feel-excited', 'eyes-suspicious', 'eyes-sleepy', 'mouth-smirk', 'mouth-oo'];
const FACE_STYLES = ['pencil', 'sketch', 'felttip', 'ballpoint', 'riso', 'inkbleed', 'print', 'manga', 'gigposter', 'gloss'];

let ST = { clock: 0 } as StudioState;
let film: Player | null = null, editor: Editor | null = null;
let tiles: Tile[] = [], tilesSig = '';
let thumbQ: Array<[HTMLCanvasElement, ThumbSpec]> = [], thumbId = 0;
let bts: Conductor;
const stage = new Stage($<HTMLCanvasElement>('#main'), { skin: skin('pencil'), key: 'main', autoplay: false });
// lip-sync: one live voice (microphone or a file) and any number of scored `talk` lines
const voice = new Voice();
const TALK_SR = 22050, TALK_FPS = 60;
interface Talk { start: number; len: number; track: Lips[] }
const talks = new Map<Actor, Talk>();
// every sound besides the beat goes through the mixer, which also logs it for export
const mixer = new Mixer();
let wasPlaying = false;
const sfxCache = new Map<string, Float32Array>();
function sfxOf(name: string): Float32Array { let s = sfxCache.get(name); if (!s) { s = sfxSamples(name, { sampleRate: 44100 }); sfxCache.set(name, s); } return s; }
/** A film clip reached during playback: play it, and log it on the song clock when the score is running. */
function filmSound(clip: SoundClip, i: number, offset: number): void {
  if (!film) return; const who = film.whoAt(clip.at), line = clip.say != null;
  const at = bts.songT - offset, samples = line ? clipSamples(clip, who, TALK_SR) : sfxOf(clip.sfx || 'pop');
  mixer.play({ key: 'film:' + i + ':' + Math.round(at * 10), at, samples, sampleRate: line ? TALK_SR : 44100, gain: (clip.gain ?? 1) * (line ? 0.55 : 0.6) }, offset, !CAPTURE, bts.playing);
}
function updateTalks(): void {
  if (wasPlaying && !bts.playing) mixer.hush(); wasPlaying = bts.playing;
  talks.forEach((k, a) => {
    const t = bts.songT - k.start;
    if (t < 0 || t > k.len + 0.25) { talks.delete(a); if (voice.target !== a) a.lips = null; return; }
    if (voice.target !== a || !voice.active) a.lips = lipsAt(k.track, TALK_FPS, t);
  });
}
function useStageSkin(name: string): void { if (stage.skin.name !== name) { stage.skin = skin(name); stage.dirty = true; } }

/** Switch a character's skin by name, redrawing only when it really changes. */
function useSkin(h: Character, name: string): void { if (h.skin.name !== name) { h.skin = skin(name); h.dirty = true; } }

// ── state ────────────────────────────────────────────────────────────────
function reset(): void {
  ST = {
    actor: new Actor({ who: 'max' }), style: 'pencil', palette: 'cyan', guides: false, mode: 'single',
    sizesUpTo: 48, grid: 3, sheetKind: 'styles', dealSeed: 0, faces: 1, panel: null, editRow: null, multicam: false,
    card: null, pointer: null, clock: ST.clock || 0, rev: 0, revAt: 0, panelRev: -1, created: false, src: null,
    lead: 'max', selected: 'max'
  };
  castOnly('max', ST.actor); K.tune = {};
  talks.clear(); mixer.hush(); if (voice.active) voice.attach(ST.actor);
  film = null; editor = null; $('#timeline').innerHTML = ''; $('#pointer').style.display = 'none';
  $('#panel').classList.remove('on'); setMode('single');
}
function settle(): void {
  ST.actor.snap(); if (film) film.update(0);
  tiles.forEach((x) => { x.h.dirty = true; });
  if (bts.last >= 0) hiScore(bts.last);
  if (ST.src) showSource(ST.src[0], ST.src[1]);
  if (ST.panel) openPanel(ST.panel); else closePanel();
  stage.cut();
  layout();
}
/** Empty the stage and put one actor on it. */
function castOnly(id: string, actor: Actor): void {
  stage.members.slice().forEach((m) => stage.remove(m.id));
  stage.add({ id, actor, x: 0 }); stage.shot('wide', undefined, true);
}
/** The actor a command is for: `on:` if given, otherwise the lead. */
function actorFor(ev: Record<string, unknown>): Actor {
  const id = ev.on != null ? String(ev.on) : ST.lead;
  return stage.has(id) ? stage.get(id) : ST.actor;
}
/** Make an actor the one the panels edit (clicking an actor on stage does this). */
function selectActor(id: string): void {
  if (!stage.has(id)) return;
  ST.selected = id; ST.actor = stage.get(id); bump();
  if (voice.active) voice.attach(ST.actor);
  if (ST.panel) openPanel(ST.panel);
}

// ── commands: one per score verb ─────────────────────────────────────────
const str = (v: unknown) => String(v), num = (v: unknown) => Number(v);
const needFilm = (): Player => { ensureFilm(); return film!; };
const CMD: Record<string, Command> = {
  create(v) { const id = str(v); ST.actor = new Actor({ who: id }); castOnly(id, ST.actor); ST.lead = ST.selected = id; ST.created = true; setMode('single'); src('create'); },
  enter(v, ev) {
    const o = (typeof v === 'string' ? { id: v } : (v || {})) as { id?: string; who?: string; x?: number; z?: number; pose?: string };
    const id = String(o.id || o.who || 'guest');
    if (!stage.has(id)) stage.add({ id, who: o.who || id, x: o.x, z: o.z, pose: o.pose });
    if (ev.on == null && stage.shotSpec.frame === 'wide') stage.shot('wide');
    leaveSpecial(); src('stage');
  },
  exit(v) { const id = str(v); if (stage.has(id) && stage.members.length > 1) stage.remove(id); if (ST.selected === id) selectActor(ST.lead); src('stage'); },
  shot(v, ev) { stage.shot(str(v) as StageFraming, ev.on as string | string[] | undefined, !!ev.cut); leaveSpecial(); src('stage'); },
  place(v, ev) { const id = ev.on != null ? String(ev.on) : ST.lead, at = Array.isArray(v) ? v : [v]; if (stage.has(id)) stage.place(id, num(at[0]), at[1] != null ? num(at[1]) : undefined); src('stage'); },
  spread() { stage.spread(); src('stage'); },
  talk(v, ev, ctx) {
    const o = (typeof v === 'number' ? { len: v } : (v || {})) as { len?: number; pitch?: number; seed?: number; vowels?: string };
    const a = actorFor(ev), len = K.clamp(Number(o.len ?? 2) || 2, 0.1, 30);
    const samples = babble({ seconds: len, sampleRate: TALK_SR, pitch: pitchOf(a.who) * (Number(o.pitch) || 1), seed: o.seed ?? (ev.i ?? 0) + 1, vowels: o.vowels });
    talks.set(a, { start: ctx.now - ctx.since, len, track: lipTrack(samples, TALK_SR, TALK_FPS) });
    mixer.play({ key: 'talk:' + ev.i, at: ctx.now - ctx.since, samples, sampleRate: TALK_SR, gain: 0.55 }, ctx.since, !ctx.instant && !CAPTURE);
    src('voice');
  },
  sfx(v, ev, ctx) {
    const name = str(v);
    if (ST.mode === 'film' && ST.editRow === 'sound' && editor) { editor.assign(name); markPicker(name); }
    mixer.play({ key: 'sfx:' + ev.i, at: ctx.now - ctx.since, samples: sfxOf(name), sampleRate: 44100, gain: 0.6 }, ctx.since, !ctx.instant && !CAPTURE);
    src('sound', name);
  },
  manner(v, ev) { actorFor(ev).setManner((v || {}) as Partial<Manner>); stage.dirty = true; if (ST.panel === 'Motion' && !ST.instant) openPanel('Motion'); src('manner'); },
  style(v, ev) {
    const name = str(v), palette = ev.palette as string | undefined;
    if (ST.mode === 'film' && ST.editRow === 'style' && editor) { editor.assign(name); markPicker(name); }
    else {
      ST.style = name; if (palette) ST.palette = palette;
      if (ST.mode === 'film' || ST.mode === 'card') setMode('single');
      if (ST.panel === 'Styles' && (name === 'hologram') !== !!ST.panelHolo) openPanel('Styles');
      markPanel('style', name); if (palette) markPanel('palette', palette);
    }
    src('style', name);
  },
  look(v, ev) {
    const s = str(v);
    if (s === 'code') ST.guides = true; else if (s === 'clean') ST.guides = false;
    else { const id = ev.on != null ? String(ev.on) : ST.lead; if (stage.has(id)) stage.look(id, s === 'none' ? null : s); else ST.actor.gaze = s; }
    src('look');
  },
  open(v) { setMode('single'); openPanel(str(v) as Panel); },
  pose(v, ev) { leaveSpecial(); actorFor(ev).pose(str(v)); stage.dirty = true; markPanel('pose', str(v)); src('pose', str(v)); },
  who(v, ev) {
    const who = str(v);
    if (ST.mode === 'film' && ST.editRow === 'who' && editor) { editor.assign(who); markPicker(who); }
    else { actorFor(ev).cast(who); bump(); markPanel('cast', who); }
    src('who', who);
  },
  size(v) { if (num(v) >= 1000) setMode('single'); else { ST.sizesUpTo = num(v); setMode('sizes'); } src('size'); },
  sheet(v, ev) { ST.sheetKind = str(v); ST.grid = num(ev.grid) || 3; setMode('sheet'); src('sheet'); },
  grid(v) { ST.grid = num(v); setMode(ST.mode === 'deal' ? 'deal' : 'sheet'); },
  deal(v) { ST.dealSeed = num(v); setMode('deal'); src('deal'); },
  edit(v) { const f = needFilm(); ST.editRow = /style/i.test(str(v)) ? 'style' : /sound/i.test(str(v)) ? 'sound' : 'who'; f.playing = false; ST.multicam = false; f.camOverride = null; setMode('film'); editor!.select(ST.editRow); if (ST.editRow === 'sound') buildPicker('sound'); src('film'); },
  set(v, ev) { leaveSpecial(); if (ST.panel !== 'Design') openPanel('Design'); actorFor(ev).set(str(v), num(ev.to)); bump(); markPanel('dial', str(v)); src('set', str(v)); },
  preset(v, ev) { leaveSpecial(); if (ST.panel !== 'Design') openPanel('Design'); actorFor(ev).cast(str(v)); bump(); markPanel('cast', str(v)); src('who', str(v)); },
  play(_v, ev, ctx) {
    const f = needFilm(); ST.editRow = null; ST.multicam = false; f.camOverride = null; setMode('film');
    f.seek(num(ev.from || 0) + ctx.since); f.playing = true; buildPicker(null); src('film');
  },
  faces(v) { ST.faces = num(v); setMode('faces'); src('faces'); },
  camera(v, _ev, ctx) {
    const f = needFilm(); ST.editRow = null; buildPicker(null);
    if (!ST.multicam) { f.seek(ctx.since); f.playing = true; }
    ST.multicam = true; f.camOverride = num(v) - 1; setMode('film'); src('film');
  },
  sizes() { setMode('aspects'); src('aspects'); },
  take(_v, _ev, ctx) { setMode('single'); ST.panel = null; $('#panel').classList.remove('on'); ST.pointer = { start: ST.clock - ctx.since }; src('take'); },
  end(v, _ev, ctx) { const o = (v || {}) as { text?: string }; ST.card = { text: o.text || 'MAXCOT', start: ST.clock - ctx.since }; ST.pointer = null; setMode('card'); src('end'); }
};
function exec(cmd: string, v: unknown, ev?: Partial<ScheduledEvent>, ctx?: CommandContext): void {
  ctx = ctx || { instant: false, now: 0, since: 0 }; ST.instant = ctx.instant;
  const fn = CMD[cmd]; if (!fn) { console.warn('unknown command', cmd); return; }
  fn(v, (ev || {}) as ScheduledEvent, ctx);
  if (!ctx.instant && ev && ev.i != null) hiScore(ev.i);
}
function guidesFor(s: string): boolean { return ST.guides && (s === 'pencil' || s === 'sketch' || s === 'ballpoint'); }
function leaveSpecial(): void { if (ST.mode !== 'single' && ST.mode !== 'aspects') setMode('single'); }
function bump(): void { ST.rev++; ST.revAt = ST.clock; }
function src(kind: string, name?: string): void { ST.src = [kind, name]; if (!ST.instant) showSource(kind, name); }

// ── modes and layout ─────────────────────────────────────────────────────
const VIEW: Record<Mode, string> = { single: 'single', sizes: 'sizes', sheet: 'grid', deal: 'grid', faces: 'grid', aspects: 'aspects', film: 'film', card: 'card' };
function setMode(m: Mode): void {
  const changed = ST.mode !== m; ST.mode = m;
  ['single', 'sizes', 'grid', 'aspects', 'film', 'card'].forEach((v) => { $('#v-' + v).classList.toggle('on', VIEW[m] === v); });
  $('#panel').classList.toggle('on', m === 'single' && !!ST.panel);
  if (m !== 'film') ST.editRow = null;
  if (changed) tilesSig = '';
  layout();
}
function fit(c: HTMLCanvasElement, w: number, h: number): void {
  const cw = Math.max(2, Math.round(w * DPR)), ch = Math.max(2, Math.round(h * DPR));
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  c.style.width = w + 'px'; c.style.height = h + 'px';
}
function layout(): void {
  const area = $('#viewArea'), W = area.clientWidth, H = area.clientHeight;
  if (!W || !H) return;
  switch (ST.mode) {
    case 'single': fit($<HTMLCanvasElement>('#main'), W, H); stage.dirty = true; break;
    case 'card': fit($<HTMLCanvasElement>('#cardCanvas'), W, H); break;
    case 'sizes': buildSizes(W, H); break;
    case 'sheet': case 'deal': case 'faces': buildGrid(W, H); break;
    case 'aspects': buildAspects(W, H); break;
    case 'film': layoutFilm(); break;
  }
}
function tile(host: HTMLElement, w: number, h: number, o: TileOptions): Tile {
  const c = el('canvas'); c.width = Math.round(w * (o.dpr || DPR)); c.height = Math.round(h * (o.dpr || DPR)); c.style.width = w + 'px'; c.style.height = h + 'px';
  host.appendChild(c);
  const hd = new Character(c, { actor: o.actor, skin: skin(o.style), palette: o.palette, isStatic: o.isStatic, frame: o.frame, key: o.key, autoplay: false });
  const t: Tile = { h: hd, shared: !!o.shared, anim: !o.isStatic, c: c }; tiles.push(t); return t;
}

// the sizes row: the same drawing at the pixel sizes it will really ship at
function buildSizes(W: number, H: number): void {
  const sig = 'sizes|' + ST.sizesUpTo + '|' + W + '|' + H; if (sig === tilesSig) return; tilesSig = sig;
  const host = $('#v-sizes'); host.innerHTML = ''; tiles = [];
  [48, 96, 200].filter((s) => s <= ST.sizesUpTo).forEach((s) => {
    const f = el('figure'); host.appendChild(f);
    tile(f, s, s, { actor: ST.actor, shared: true, dpr: 1, style: ST.style, key: 'size' + s });
    f.appendChild(el('figcaption', null, s + ' px'));
  });
}
// sheets: every style at once; deals: shuffled actor × style × pose; faces: expressions
function buildGrid(W: number, H: number): void {
  const m = ST.mode, sig = [m, ST.grid, ST.dealSeed, ST.faces, W, H].join('|'); if (sig === tilesSig) return; tilesSig = sig;
  const host = $('#v-grid'); host.innerHTML = ''; tiles = []; const gap = 6;
  let cols: number, sz: number;
  if (m === 'sheet') {
    const n = ST.grid; sz = Math.floor(Math.min((W - gap * (n - 1)) / n, (H - gap * (n - 1)) / n));
    cols = n; for (let i = 0; i < n * n; i++) tile(host, sz, sz, { actor: ST.actor, shared: true, style: STYLE_ORDER[i % STYLE_ORDER.length]!, palette: ['cyan', 'amber', 'rose', 'green'][i % 4], isStatic: n >= 7, key: 'sh' + i });
  } else {
    cols = m === 'deal' ? 5 : ST.faces + 1;
    sz = Math.floor((W - gap * (cols - 1)) / cols); const rows = Math.max(1, Math.floor((H + gap) / (sz + gap)));
    if (rows * (sz + gap) - gap > H) sz = Math.floor((H - gap * (rows - 1)) / rows);
    const rnd = K.rng(ST.dealSeed * 7717 + ST.faces * 31 + 1), whos = CAST_ORDER, poses = POSE_SECTIONS.attitudes.concat(POSE_SECTIONS.feelings);
    for (let i = 0; i < cols * rows; i++) {
      const a = new Actor({ who: m === 'deal' ? whos[(rnd() * whos.length) | 0] : 'max' });
      a.pose(m === 'deal' ? poses[(rnd() * poses.length) | 0]! : FACES[i % FACES.length]!).snap();
      const st = m === 'deal' ? STYLE_ORDER[(rnd() * STYLE_ORDER.length) | 0]! : FACE_STYLES[(i * 7 + ST.faces) % FACE_STYLES.length]!;
      tile(host, sz, sz, { actor: a, style: st, palette: 'cyan', isStatic: true, frame: m === 'faces' ? 'close' : 'full', key: m + i });
    }
  }
  host.style.padding = '0 ' + Math.max(0, Math.floor((W - (cols * sz + gap * (cols - 1))) / 2) - 1) + 'px';
}
// the same frame for every screen it will be shown on
function buildAspects(W: number, H: number): void {
  const sig = 'asp|' + W + '|' + H; if (sig === tilesSig) return; tilesSig = sig;
  const host = $('#v-aspects'); host.innerHTML = ''; tiles = []; const g = 12;
  const h1 = Math.floor(Math.min((W - g) / (16 / 9 + 9 / 16), (H - g) / 1.85)), h2 = Math.floor(h1 * 0.85);
  const w1 = h1 * 16 / 9, w2 = h1 * 9 / 16, x0 = (W - (w1 + g + w2)) / 2, y0 = (H - (h1 + g + h2)) / 2;
  const w3 = h2, w4 = h2 * 0.8, x1 = (W - (w3 + g + w4)) / 2;
  ([['Wide 16:9', x0, y0, w1, h1], ['Tall 9:16', x0 + w1 + g, y0, w2, h1], ['Square 1:1', x1, y0 + h1 + g, w3, h2], ['Portrait 4:5', x1 + w3 + g, y0 + h1 + g, w4, h2]] as Array<[string, number, number, number, number]>).forEach((a, i) => {
    const d = el('div', 'asp'); d.style.left = a[1] + 'px'; d.style.top = a[2] + 'px'; d.style.width = a[3] + 'px'; d.style.height = a[4] + 'px';
    host.appendChild(d); const t = tile(d, a[3], a[4], { actor: ST.actor, shared: true, style: ST.style, key: 'asp' + i }); t.c.style.width = '100%'; t.c.style.height = '100%';
    d.appendChild(el('span', null, a[0]));
  });
}

// ── film ─────────────────────────────────────────────────────────────────
function ensureFilm(): void {
  if (film) return;
  film = new Player(structuredClone(filmData), { skins: SKINS, onSound: filmSound });
  editor = new Editor($('#timeline'), film, { onPick: (row) => buildPicker(row), onAspect: layoutFilm, onChange: () => { mixer.log.forEach((_c, k) => { if (k.indexOf('film:') === 0) mixer.log.delete(k); }); src('film'); saveDraftSoon(); } });
}
const ASPECT: Record<string, number> = { wide: 16 / 9, tall: 9 / 16, square: 1, portrait: 0.8 };
function layoutFilm(): void {
  if (!film) return; const f = film;
  const mc = $('#multicam'); mc.classList.toggle('on', ST.multicam);
  const prev = $('.film-prev'), W = prev.clientWidth, H = prev.clientHeight, r = ASPECT[f.aspect] || 16 / 9;
  const w = Math.min(W, H * r), h = w / r, c = $<HTMLCanvasElement>('#filmCanvas'); fit(c, Math.floor(w), Math.floor(h));
  c.style.left = Math.floor((W - w) / 2) + 'px'; c.style.top = Math.floor((H - h) / 2) + 'px';
  if (ST.multicam && !mc.children.length) {
    (f.film.cameras || []).forEach((cam, i) => {
      const fig = el('figure'), cv = el('canvas'); fig.appendChild(cv); fig.appendChild(el('figcaption', null, (i + 1) + ' ' + cam.label));
      fig.onclick = () => { f.camOverride = i; markCams(); }; mc.appendChild(fig);
    });
  }
  mc.querySelectorAll('canvas').forEach((cv) => { const cw = Math.floor(Math.min(mc.clientWidth || 160, (H - 3 * 8) / 4 * 16 / 9)); fit(cv, cw, Math.round(cw * 9 / 16)); });
  markCams();
}
function markCams(): void { Array.from($('#multicam').children).forEach((f, i) => { f.classList.toggle('on', !!film && film.camOverride === i); }); }
function buildPicker(row: EditRow | null): void {
  if (!editor) return; const ed = editor, host = ed.picker; host.innerHTML = '';
  if (!row) return;
  if (row === 'sound') {
    // effects and a spoken line; clicking one also plays it
    const sel = ed.sel && ed.sel.row === 'sound' ? (film!.film.tracks.sound || [])[ed.sel.i] : undefined;
    const add = el('button', 'tl-btn snd-add', '+ Add a sound at the playhead'); add.onclick = () => { ed.addSound({ sfx: 'pop' }); preview({ at: 0, sfx: 'pop' }); }; host.appendChild(add);
    [...SFX, 'line'].forEach((k) => {
      const b = el('button', 'tl-btn snd' + (sel && (k === 'line' ? sel.say != null : sel.sfx === k) ? ' on' : ''), k === 'line' ? 'Spoken line' : SFX_LABEL[k as keyof typeof SFX_LABEL]); b.dataset.k = k;
      b.onclick = () => { if (!ed.sel || ed.sel.row !== 'sound') ed.addSound(); ed.assign(k); markPicker(k); const c = (film!.film.tracks.sound || [])[ed.sel!.i]; if (c) preview(c); };
      host.appendChild(b);
    });
    if (sel) { const del = el('button', 'tl-btn snd-del', 'Delete'); del.onclick = () => { ed.removeSound(); buildPicker('sound'); }; host.appendChild(del); }
    return;
  }
  const list = row === 'who' ? CAST_ORDER : STYLE_ORDER;
  list.forEach((k) => {
    const f = el('figure'), c = el('canvas'); c.width = 192; c.height = 160; f.appendChild(c);
    f.appendChild(el('figcaption', null, row === 'who' ? CAST[k]!.label : skin(k).label)); f.dataset.k = k;
    f.onclick = () => { ed.assign(k); markPicker(k); }; host.appendChild(f);
    queueThumb(c, row === 'who' ? { who: k, style: 'pencil', pose: 'rest' } : { design: film!.actor.designTo, who: film!.who, style: k, pose: 'rest' });
  });
}
function preview(c: SoundClip): void {
  const line = c.say != null;
  mixer.play({ key: 'preview', at: 0, samples: line ? clipSamples(c, film ? film.whoAt(c.at) : 'max', TALK_SR) : sfxOf(c.sfx || 'pop'), sampleRate: line ? TALK_SR : 44100, gain: 0.6 }, 0, !CAPTURE, false);
}
function markPicker(k: string): void {
  if (!editor) return;
  Array.from(editor.picker.children).forEach((f) => { const on = (f as HTMLElement).dataset.k === k; f.classList.toggle('on', on); if (on && !ST.instant) f.scrollIntoView({ block: 'nearest', inline: 'center', behavior: SMOOTH }); });
}

// ── thumbnails, rendered a few per frame ────────────────────────────────
function queueThumb(c: HTMLCanvasElement, spec: ThumbSpec): void { spec.key = 'th' + (thumbId++); thumbQ.push([c, spec]); }
function renderThumb(c: HTMLCanvasElement, s: ThumbSpec): void {
  const a = new Actor({ who: s.who || 'max' }); if (s.design) Object.assign(a.designTo, s.design);
  a.pose(s.pose || 'rest').snap(); a.gaze = 'us';
  render(c.getContext('2d')!, c.width, c.height, a.frame(0.6), { skin: skin(s.style), palette: s.palette, t: 0.6, key: s.key, frame: s.frame });
}

// ── panel ────────────────────────────────────────────────────────────────
const TABS: Panel[] = ['Styles', 'Tune', 'Poses', 'Design', 'Motion', 'Voice'];
function openPanel(name: Panel): void {
  ST.panel = name; $('#panel').classList.toggle('on', ST.mode === 'single');
  const tabs = $('#tabs'); tabs.innerHTML = '';
  TABS.forEach((t) => { const b = el('button', t === name ? 'on' : '', t); b.onclick = () => openPanel(t); tabs.appendChild(b); });
  buildPanel(); layout();
}
function voiceStatus(): string {
  return voice.source === 'microphone' ? 'Listening to the microphone. Speak, sing or play something.'
    : voice.source === 'file' ? 'Playing ' + (voiceName || 'a clip') + '.' : 'Pick a sound to drive the mouth.';
}
let voiceName = '';
async function startVoice(kind: 'microphone' | 'test' | 'file', f?: File): Promise<void> {
  voice.attach(ST.actor);
  try {
    if (kind === 'microphone') await voice.microphone();
    else if (kind === 'file' && f) { voiceName = f.name; await voice.file(f); }
    else { voiceName = 'the test voice'; voice.samples(babble({ seconds: 6, sampleRate: TALK_SR, pitch: pitchOf(ST.actor.who), seed: 7 }), TALK_SR); }
  } catch (e) {
    toast(kind === 'microphone' ? 'No microphone: ' + ((e as Error).message || 'permission was refused') : 'Could not play that file: ' + ((e as Error).message || 'unknown format'));
  }
  if (ST.panel === 'Voice') buildPanel();
}
voice.onended = () => { if (ST.panel === 'Voice') buildPanel(); };
function updateMeter(): void {
  if (ST.panel !== 'Voice') return;
  const bar = document.querySelector<HTMLElement>('#panelBody .meter i'); if (bar) bar.style.width = Math.round(voice.lips.level * 100) + '%';
}
function closePanel(): void { ST.panel = null; $('#panel').classList.remove('on'); layout(); }
function section(body: HTMLElement, title: string): HTMLDivElement { body.appendChild(el('h4', null, title)); const g = el('div', 'thumbs'); body.appendChild(g); return g; }
function thumbFig(grid: HTMLElement, k: string, label: string, spec: ThumbSpec, onClick: () => void): void {
  const f = el('figure'), c = el('canvas'); c.width = 220; c.height = 220; f.appendChild(c); f.appendChild(el('figcaption', null, label));
  f.dataset.k = k; f.title = label; f.onclick = onClick; grid.appendChild(f); queueThumb(c, spec);
}
function buildPanel(): void {
  const body = $('#panelBody'), scroll = body.scrollTop; body.innerHTML = ''; ST.panelRev = ST.rev;
  const d = ST.actor.designTo, who = ST.actor.who;
  if (ST.panel === 'Styles') {
    ST.panelHolo = ST.style === 'hologram';
    if (ST.panelHolo) {
      const hg = section(body, 'Hologram beams');
      (skin('hologram').palettes || []).forEach((p) => { thumbFig(hg, 'palette:' + p.name, p.label, { design: d, who: who, style: 'hologram', palette: p.name }, () => exec('style', 'hologram', { palette: p.name })); });
    }
    GROUPS.forEach(([group, title]) => {
      const grid = section(body, title);
      allSkins.filter((s) => s.group === group).forEach((s) => {
        thumbFig(grid, 'style:' + s.name, s.label, { design: d, who: who, style: s.name, palette: ST.palette }, () => exec('style', s.name));
      });
    });
  } else if (ST.panel === 'Poses') {
    (Object.keys(POSE_SECTIONS) as Array<keyof typeof POSE_SECTIONS>).forEach((s) => {
      const grid = section(body, SECTION_LABEL[s]!);
      POSE_SECTIONS[s].forEach((p) => { thumbFig(grid, 'pose:' + p, p, { design: d, who: who, style: 'pencil', pose: p }, () => exec('pose', p, { on: ST.selected } as Partial<ScheduledEvent>)); });
    });
  } else if (ST.panel === 'Design') {
    body.appendChild(el('h4', null, 'Who plays it'));
    const chips = el('div', 'chips'); body.appendChild(chips);
    CAST_ORDER.forEach((k) => {
      const ch = el('div', 'chip' + (k === who ? ' on' : '')), c = el('canvas'); c.width = 60; c.height = 60; ch.appendChild(c); ch.appendChild(document.createTextNode(CAST[k]!.label));
      ch.dataset.k = 'cast:' + k; ch.onclick = () => exec('preset', k, { on: ST.selected } as Partial<ScheduledEvent>); chips.appendChild(ch); queueThumb(c, { who: k, style: 'pencil', frame: 'close' });
    });
    const groups: Record<string, DesignRow[]> = {}; DESIGN.forEach((r) => { (groups[r[1]] = groups[r[1]] || []).push(r); });
    Object.keys(groups).forEach((g) => {
      body.appendChild(el('h4', null, g));
      groups[g]!.forEach((r) => {
        const opts = r[7];
        if (opts) choice(body, 'dial:' + r[0], r[2], opts, opts[Math.round(d[r[0]] || 0)]!, (v) => { ST.actor.set(r[0], opts.indexOf(v)); bump(); src('set', r[0]); }, r[0]);
        else dial(body, 'dial:' + r[0], r[2], r[4], r[5], d[r[0]]!, r[3], (v) => { ST.actor.set(r[0], v); bump(); src('set', r[0]); }, r[0]);
      });
    });
  } else if (ST.panel === 'Tune') {
    const sk = skin(ST.style); body.appendChild(el('h4', null, sk.label)); body.appendChild(el('p', 'note', sk.about));
    (sk.params || []).forEach((p) => { dial(body, 'tune:' + p[0], p[1], p[2], p[3], Number(K.tv(p[0], p[4])), '', (v) => { K.tune[p[0]] = v; stage.dirty = true; }); });
    if (!(sk.params || []).length) body.appendChild(el('p', 'note', 'This skin has no dials of its own.'));
    if (sk.palettes) {
      body.appendChild(el('h4', null, 'Beam')); const pc = el('div', 'chips'); body.appendChild(pc);
      sk.palettes.forEach((p) => { const ch = el('div', 'chip' + (p.name === ST.palette ? ' on' : ''), p.label); ch.style.padding = '4px 8px'; ch.onclick = () => { exec('style', ST.style, { palette: p.name }); openPanel('Tune'); }; pc.appendChild(ch); });
    }
    body.appendChild(el('h4', null, 'Look'));
    toggle(body, 'Construction lines', ST.guides, (on) => { ST.guides = on; });
    toggle(body, 'Eyes to camera', ST.actor.gaze === 'us', (on) => { ST.actor.gaze = on ? 'us' : null; });
  } else if (ST.panel === 'Motion') {
    const a = ST.actor, m = a.manner;
    body.appendChild(el('h4', null, 'Manner of ' + ST.selected));
    body.appendChild(el('p', 'note', 'How this actor moves on its own. Click another actor on stage to edit theirs.'));
    dial(body, 'm:weight', 'Weight', 0, 1, m.weight, 'Light and springy (0) to heavy and slow (1)', (v) => { a.setManner({ weight: v }); bump(); syncMotion(); });
    choice(body, 'm:idle', 'Idle habit', ['none', 'still', 'fidget', 'bouncy', 'sway'], m.idle, (v) => { a.setManner({ idle: v as Manner['idle'] }); stage.dirty = true; });
    choice(body, 'm:gaze', 'Gaze habit', ['steady', 'away', 'darting', 'us'], m.gaze, (v) => { a.setManner({ gaze: v as Manner['gaze'] }); stage.dirty = true; });
    choice(body, 'm:rest', 'Rest pose', POSE_SECTIONS.attitudes.concat(POSE_SECTIONS.hands), m.rest, (v) => { a.setManner({ rest: v }); a.pose(v); stage.dirty = true; });
    body.appendChild(el('h4', null, 'Fine tune'));
    body.appendChild(el('p', 'note', 'Every channel springs toward its pose. Stiffer is snappier, lower damping overshoots.'));
    dial(body, 'm:stiff', 'Stiffness', 4, 40, a.stiff, '', (v) => { a.stiff = v; });
    dial(body, 'm:damp', 'Damping', 0.2, 1.2, a.damp, '', (v) => { a.damp = v; });
    dial(body, 'm:idle', 'Idle life', 0, 2, a.idle, '', (v) => { a.idle = v; });
    dial(body, 'm:morph', 'Recast speed', 1, 20, a.morph, '', (v) => { a.morph = v; });
  } else if (ST.panel === 'Voice') {
    body.appendChild(el('h4', null, 'Lip-sync for ' + ST.selected));
    body.appendChild(el('p', 'note', 'The mouth follows the sound: loudness opens it, the vowel shapes it. The sound is read right here on the page; nothing is recorded or sent anywhere.'));
    const row = el('div', 'vbtns');
    const btn = (label: string, k: string, fn: () => void) => { const b = el('button', voice.source === k ? 'on' : '', label); b.dataset.k = 'voice:' + k; b.onclick = fn; row.appendChild(b); };
    btn('Microphone', 'microphone', () => { void startVoice('microphone'); });
    btn('Audio file…', 'file', () => $<HTMLInputElement>('#voiceFile').click());
    btn('Test voice', 'test', () => { void startVoice('test'); });
    btn('Stop', 'none', () => { voice.stop(); buildPanel(); });
    body.appendChild(row);
    const meter = el('div', 'meter'); meter.appendChild(el('i')); body.appendChild(meter);
    body.appendChild(el('p', 'note voiceStatus', voiceStatus()));
    dial(body, 'v:gate', 'Sensitivity', 20, 70, -voice.gate, 'Higher hears quieter sound', (v) => { voice.gate = -v; });
    dial(body, 'v:range', 'Mouth range', 10, 50, voice.range, 'Lower opens the mouth fully at a lower volume', (v) => { voice.range = v; });
    toggle(body, 'Play files out loud', voice.monitor, (on) => { voice.monitor = on; });
    body.appendChild(el('h4', null, 'In a score'));
    body.appendChild(el('p', 'note', "{ at: [2, 1], talk: 2, on: 'kid' } babbles for two seconds in that actor's own voice, and the mouth follows it. talk: { len: 2, pitch: 1.2, vowels: 'aoi' } tunes it."));
  }
  body.scrollTop = scroll;
}
function dial(host: HTMLElement, k: string, label: string, min: number, max: number, val: number, help: string, onInput: (v: number) => void, key?: string): void {
  const row = el('label', 'dial'), r = el('input'), o = el('output');
  r.type = 'range'; r.min = String(min); r.max = String(max); r.step = String((max - min) / 400); r.value = String(val); o.textContent = (+val).toFixed(2);
  row.title = help || ''; row.dataset.k = k; if (key) r.dataset.key = key;
  r.oninput = () => { o.textContent = (+r.value).toFixed(2); onInput(+r.value); };
  row.appendChild(el('span', null, label)); row.appendChild(r); row.appendChild(o); host.appendChild(row);
}
function choice(host: HTMLElement, k: string, label: string, options: string[], value: string, onChange: (v: string) => void, key?: string): void {
  const row = el('label', 'dial'), sel = el('select'); if (key) sel.dataset.key = key;
  options.forEach((o) => { const opt = el('option', null, o); opt.value = o; sel.appendChild(opt); });
  sel.value = value; sel.onchange = () => onChange(sel.value); row.dataset.k = k;
  row.appendChild(el('span', null, label)); row.appendChild(sel); row.appendChild(el('output')); host.appendChild(row);
}
/** Keep the spring dials in step after the weight changes them. */
function syncMotion(): void {
  const body = $('#panelBody'), set = (k: string, v: number) => { const r = body.querySelector<HTMLInputElement>('[data-k="' + k + '"] input'); if (r) { r.value = String(v); (r.nextSibling as HTMLElement).textContent = v.toFixed(2); } };
  set('m:stiff', ST.actor.stiff); set('m:damp', ST.actor.damp);
}
function toggle(host: HTMLElement, label: string, on: boolean, fn: (on: boolean) => void): void {
  const l = el('label', 'dial'), c = el('input'); c.type = 'checkbox'; c.checked = on; c.onchange = () => fn(c.checked);
  l.appendChild(el('span', null, label)); l.appendChild(c); host.appendChild(l);
}
function markPanel(kind: string, v: string): void {
  if (ST.instant) return;
  const body = $('#panelBody'), sel = body.querySelector<HTMLElement>('[data-k="' + kind + ':' + v + '"]'); if (!sel) return;
  body.querySelectorAll('[data-k^="' + kind + ':"]').forEach((n) => { n.classList.toggle('on', n === sel); });
  sel.scrollIntoView({ block: 'center', behavior: SMOOTH });
  if (kind === 'dial') setTimeout(() => { sel.classList.remove('on'); }, 1400);
}
function syncDials(): void {
  if (ST.panel !== 'Design') return;
  $('#panelBody').querySelectorAll<HTMLSelectElement>('select[data-key]').forEach((sel) => {
    if (document.activeElement === sel) return; const v = ST.actor.design[sel.dataset.key!]; if (v == null) return;
    const want = sel.options[Math.round(v)]; if (want && sel.value !== want.value) sel.value = want.value;
  });
  $('#panelBody').querySelectorAll<HTMLInputElement>('input[data-key]').forEach((r) => {
    if (document.activeElement === r) return; const v = ST.actor.design[r.dataset.key!]; if (v == null) return;
    r.value = String(v); (r.nextSibling as HTMLElement).textContent = (+v).toFixed(2);
  });
}

// ── code panes: the real source files, highlighted at the line that is running ──
const TOK = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b(?:var|let|const|function|return|if|else|for|new|this|true|false|null|while|switch|case|break|typeof|import|export|from|type|interface|class|extends|private)\b)/g;
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function hl(line: string): string {
  let out = '', last = 0;
  line.replace(TOK, (m: string, c: string, s: string, n: string, _k: string, off: number) => { out += esc(line.slice(last, off)) + '<span class="t-' + (c ? 'c' : s ? 's' : n ? 'n' : 'k') + '">' + esc(m) + '</span>'; last = off + m.length; return m; });
  return out + esc(line.slice(last));
}
function renderCode(host: HTMLElement, lines: string[], hi: number): void {
  host.innerHTML = lines.map((l, i) => '<div class="ln' + (i === hi ? ' hi' : '') + '">' + (hl(l) || ' ') + '</div>').join('');
  scrollCode(host, hi);
}
function scrollCode(host: HTMLElement, i: number): void { const ln = host.children[i] as HTMLElement | undefined; if (ln) host.scrollTop = Math.max(0, ln.offsetTop - host.clientHeight * 0.32); }
// ── the score editor: plain data, parsed (never run) and applied as you type ──
interface Mark { line: number; level: 'error' | 'warn'; message: string }
let baseText = tourScore, scoreText = tourScore, scoreLineOf: number[] = [], marks: Mark[] = [], hiLine = -1, applyTimer = 0, pending = false;
const edTa = () => $<HTMLTextAreaElement>('#scoreEdit'), edHl = () => $('#scoreHl');
/** `palette`, `to` and `from` qualify a command; `grid` does too when it rides along with `sheet`. */
function commandsOf(e: ScoreEvent): string[] { return e.sheet ? ['sheet'] : Object.keys(e).filter((k) => ['at', 'palette', 'to', 'from', 'on'].indexOf(k) < 0); }

function renderScore(): void {
  const lines = scoreText.split('\n'), byLine = new Map(marks.map((m) => [m.line, m] as const));
  edHl().innerHTML = lines.map((l, i) => {
    const m = byLine.get(i);
    return '<div class="ln' + (i === hiLine ? ' hi' : '') + (m ? ' ' + m.level : '') + '">' + (hl(l) || ' ') + '</div>';
  }).join('');
  const first = marks.find((m) => m.level === 'error') || marks[0], status = $('#scoreStatus');
  status.textContent = first
    ? (first.level === 'error' ? 'Line ' : 'Warning, line ') + (first.line + 1) + ': ' + first.message + (marks.length > 1 ? '  (+' + (marks.length - 1) + ' more)' : '')
    : pending ? 'typing…' : scoreText === baseText ? '' : 'playing your version';
  status.className = first ? first.level : pending || scoreText === baseText ? '' : 'ok';
  status.title = marks.map((m) => 'line ' + (m.line + 1) + ': ' + m.message).join('\n');
  syncScroll();
}
function syncScroll(): void { edHl().scrollTop = edTa().scrollTop; edHl().scrollLeft = edTa().scrollLeft; }
function hiScore(i: number): void {
  const li = scoreLineOf[i]; if (li == null) return;
  const host = edHl(), old = host.querySelector('.hi'); if (old) old.classList.remove('hi');
  hiLine = li; const ln = host.children[li] as HTMLElement | undefined; if (!ln) return;
  ln.classList.add('hi');
  // follow the playhead, but never yank the text away from someone typing
  if (document.activeElement !== edTa()) { edTa().scrollTop = Math.max(0, ln.offsetTop - edTa().clientHeight * 0.32); syncScroll(); }
}

/** Closest known name, for "did you mean" hints. */
function nearest(word: string, names: Iterable<string>): string | null {
  let best: string | null = null, bestD = Infinity;
  for (const n of names) {
    const a = word.toLowerCase(), b = n.toLowerCase(), d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = d[0]!; d[0] = i;
      for (let j = 1; j <= b.length; j++) { const tmp = d[j]!; d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = tmp; }
    }
    const dist = d[b.length]!; if (dist < bestD) { bestD = dist; best = n; }
  }
  return best && bestD <= Math.max(2, word.length / 3) ? best : null;
}
const KNOWN: Record<string, Set<string>> = {
  pose: new Set(Object.keys(POSES)), style: new Set(Object.keys(SKINS)),
  who: new Set(Object.keys(CAST)), preset: new Set(Object.keys(CAST)), create: new Set(Object.keys(CAST)),
  set: new Set(DESIGN.map((r) => r[0])), open: new Set(['Styles', 'Tune', 'Poses', 'Design', 'Motion', 'Voice']),
  edit: new Set(['Who plays it', 'Style', 'Sound']), sfx: new Set<string>(SFX), shot: new Set(['wide', 'full', 'medium', 'close'])
};
const PALETTES = new Set((skin('hologram').palettes || []).map((p) => p.name));
/** Things that parse but won't do what the author meant: shown as warnings, the score still plays. */
function validate(events: ScoreEvent[], lines: number[]): Mark[] {
  const out: Mark[] = [];
  const castIds = new Set<string>(['max']);
  events.forEach((e) => { if (e.create != null) castIds.add(String(e.create)); if (e.enter != null) castIds.add(typeof e.enter === 'string' ? e.enter : String((e.enter as { id?: string; who?: string }).id || (e.enter as { who?: string }).who)); });
  events.forEach((e, i) => {
    const line = lines[i]!;
    commandsOf(e).forEach((c) => {
      if (!CMD[c]) { const n = nearest(c, Object.keys(CMD)); out.push({ line, level: 'warn', message: 'unknown command `' + c + '`' + (n ? ', did you mean `' + n + '`?' : '') }); return; }
      const known = KNOWN[c], v = String(e[c]);
      if (known && !known.has(v)) { const n = nearest(v, known); out.push({ line, level: 'warn', message: 'no ' + c + " called '" + v + "'" + (n ? ", did you mean '" + n + "'?" : '') }); }
    });
    if (e.on != null && !castIds.has(String(e.on))) out.push({ line, level: 'warn', message: "nobody called '" + e.on + "' has entered (use create or enter)" });
    if (e.enter != null && typeof e.enter === 'object' && (e.enter as { who?: string }).who && !CAST[(e.enter as { who: string }).who]) out.push({ line, level: 'warn', message: "no actor called '" + (e.enter as { who: string }).who + "'" });
    if (e.manner != null) {
      const mm = e.manner as Record<string, unknown>, ok: Record<string, string[]> = { idle: ['none', 'still', 'fidget', 'bouncy', 'sway'], gaze: ['steady', 'away', 'darting', 'us'] };
      if (typeof mm !== 'object' || Array.isArray(mm)) out.push({ line, level: 'warn', message: 'manner is an object, e.g. { weight: 0.8, idle: \'sway\' }' });
      else for (const key of Object.keys(mm)) {
        if (key === 'weight') { if (typeof mm.weight !== 'number' || mm.weight < 0 || mm.weight > 1) out.push({ line, level: 'warn', message: 'weight goes from 0 (light) to 1 (heavy)' }); }
        else if (key === 'rest') { if (!POSES[String(mm.rest)]) out.push({ line, level: 'warn', message: "no pose called '" + mm.rest + "'" }); }
        else if (ok[key]) { if (!ok[key]!.includes(String(mm[key]))) out.push({ line, level: 'warn', message: key + ' is one of ' + ok[key]!.join(', ') }); }
        else out.push({ line, level: 'warn', message: 'manner has weight, idle, gaze and rest; not `' + key + '`' });
      }
    }
    if (e.palette != null && !PALETTES.has(String(e.palette))) out.push({ line, level: 'warn', message: "no palette called '" + e.palette + "'" });
    if (e.talk != null) {
      const t = e.talk as Record<string, unknown>;
      if (typeof t === 'number') { if (t <= 0 || t > 30) out.push({ line, level: 'warn', message: 'talk is a length in seconds, up to 30' }); }
      else if (typeof t !== 'object' || Array.isArray(t)) out.push({ line, level: 'warn', message: "talk is seconds, or { len: 2, pitch: 1.2, vowels: 'aoi' }" });
      else for (const key of Object.keys(t)) {
        if (key === 'vowels') { if (typeof t.vowels !== 'string' || !/^[aeiou]+$/.test(t.vowels)) out.push({ line, level: 'warn', message: 'vowels are letters from a, e, i, o, u' }); }
        else if (key === 'len' || key === 'pitch' || key === 'seed') { if (typeof t[key] !== 'number') out.push({ line, level: 'warn', message: key + ' is a number' }); }
        else out.push({ line, level: 'warn', message: 'talk has len, pitch, seed and vowels; not `' + key + '`' });
      }
    }
    if (e.set != null && typeof e.to !== 'number') out.push({ line, level: 'warn', message: '`set` needs `to: <number>`' });
  });
  return out;
}
function applyScore(): void {
  pending = false;
  const r = parseScore(scoreText);
  if (!r.ok) { marks = [{ line: r.error.line - 1, level: 'error', message: r.error.message + ' (column ' + r.error.col + ')' }]; renderScore(); return; }
  marks = validate(r.score.events, r.lines);
  scoreLineOf = r.lines;
  const bpm = r.score.bpm || 92; beat.bpm = bpm;
  mixer.clear(); bts.load(r.score.events, { bpm, tail: r.score.tail ?? 3.2 });
  $<HTMLInputElement>('#scrub').max = String(bts.total);
  renderScore();
  saveDraftSoon();
}
// ── projects: open, save, share; a local draft survives reloads ──────────
const TOUR_LABEL = 'apps/studio/src/scores/tour.score', DRAFT_KEY = 'maxcot.draft';
let filmData: Film = hello, toastTimer = 0, draftTimer = 0;
function toast(msg: string, kind = ''): void {
  const t = $('#toast'); t.textContent = msg; t.className = 'on ' + kind;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { t.className = ''; }, 3200);
}
function currentProject(): Project { return makeProject(scoreText, film ? film.film : filmData !== hello ? filmData : undefined); }
function setLabel(label: string): void { $('#scoreFile').textContent = label; }
/** `base` is what Revert returns to: the loaded text itself, or the tour for a restored draft. */
function loadProject(p: Project, label: string, base = p.score): void {
  filmData = p.film ? structuredClone(p.film) : hello; baseText = base.replace(/\r\n?/g, '\n');
  setLabel(label);
  const ta = edTa(); ta.value = p.score; scoreText = ta.value; pending = false;
  clearTimeout(applyTimer); applyScore();
}
function saveDraftSoon(): void {
  if (CAPTURE) return;
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    try {
      const p = currentProject();
      if (p.score === tourScore && !p.film) localStorage.removeItem(DRAFT_KEY); else localStorage.setItem(DRAFT_KEY, JSON.stringify(p));
    } catch { /* storage full or blocked: drafts are a convenience only */ }
  }, 600);
}
function saveProject(): void {
  const p = currentProject(), a = el('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
  a.download = fileName(p); document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Saved ' + a.download);
}
async function openFile(f: File): Promise<void> {
  const r = readProject(await f.text());
  if (!r.ok) { toast(r.error, 'error'); return; }
  loadProject(r.project, f.name); saveDraftSoon(); toast('Opened ' + r.project.title);
}
async function shareProject(): Promise<void> {
  const code = await encodeShare(currentProject()), url = location.origin + location.pathname + '#p=' + code;
  history.replaceState(null, '', '#p=' + code);
  try { await navigator.clipboard.writeText(url); toast('Share link copied (' + (url.length / 1024).toFixed(1) + ' KB)', 'ok'); }
  catch { toast('Share link is in the address bar: copy it from there', 'ok'); }
}
/** On boot: a share link wins, then an unsaved draft, then the tour. */
async function restoreProject(): Promise<void> {
  const m = /^#p=([A-Za-z0-9_-]+)$/.exec(location.hash);
  if (m) {
    const r = await decodeShare(m[1]!);
    if (r.ok) { loadProject(r.project, 'shared: ' + r.project.title); toast('Opened a shared project: ' + r.project.title, 'ok'); return; }
    toast(r.error, 'error');
  }
  if (CAPTURE) return;
  try {
    const saved = localStorage.getItem(DRAFT_KEY); if (!saved) return;
    const r = readProject(saved);
    if (r.ok) { loadProject(r.project, 'draft: ' + r.project.title, tourScore); toast('Restored your unsaved edits. Revert goes back to the tour.'); }
  } catch { /* no storage */ }
}

function initEditor(): void {
  const ta = edTa(); ta.value = scoreText;
  ta.addEventListener('input', () => {
    scoreText = ta.value; pending = true; renderScore();
    clearTimeout(applyTimer); applyTimer = window.setTimeout(applyScore, 250);
  });
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
    else if (e.key === 'Escape') ta.blur();
  });
  $('#bRevert').onclick = () => {
    // first undo your edits to what you opened; pressed again, go back to the tour
    if (scoreText !== baseText) { ta.value = baseText; scoreText = ta.value; pending = false; clearTimeout(applyTimer); applyScore(); return; }
    filmData = hello; baseText = tourScore; setLabel(TOUR_LABEL); if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    ta.value = tourScore; scoreText = ta.value; pending = false; clearTimeout(applyTimer); applyScore();
  };
  $('#bOpen').onclick = () => $<HTMLInputElement>('#fileOpen').click();
  $<HTMLInputElement>('#fileOpen').onchange = (e) => { const inp = e.target as HTMLInputElement, f = inp.files && inp.files[0]; if (f) void openFile(f); inp.value = ''; };
  $('#bSave').onclick = saveProject;
  $('#bShare').onclick = () => { void shareProject(); };
  $<HTMLInputElement>('#voiceFile').onchange = (e) => { const inp = e.target as HTMLInputElement, f = inp.files && inp.files[0]; if (f) void startVoice('file', f); inp.value = ''; };
  // every .score file in scores/ is a demo
  const demos = import.meta.glob('./scores/*.score', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const pick = $<HTMLSelectElement>('#demo');
  Object.keys(demos).sort((a, b) => (a.includes('tour') ? -1 : b.includes('tour') ? 1 : a.localeCompare(b))).forEach((path) => {
    const r = parseScore(demos[path]!), o = el('option', null, r.ok && r.score.title ? r.score.title : path); o.value = path; pick.appendChild(o);
  });
  pick.onchange = () => {
    const path = pick.value; pick.value = ''; if (!path) return;
    const text = demos[path]!.replace(/\r\n?/g, '\n'), was = bts.playing;
    loadProject(makeProject(text), 'apps/studio/src/scores/' + path.split('/').pop());
    bts.seek(0); if (was) bts.play();
    toast('Opened the ' + (makeProject(text).title) + ' demo');
  };
  renderScore();
}
function lit(o: unknown): string[] { return JSON.stringify(o, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, '$1:').replace(/"((?:[^"\\]|\\.)*)"/g, "'$1'").split('\n'); }
const LIB = 'packages/maxcot/src/';
const SKIN_FILE: Record<string, [string, string]> = { drawn: ['drawn', drawnSrc], print: ['print', printSrc], screens: ['screens', screensSrc], signal: ['glitch', glitchSrc], time: ['glitch', glitchSrc] };
/** A whole source file, highlighted at the first line containing `needle`. */
function fileAt(text: string, needle: string): { lines: string[]; hi: number } {
  const lines = text.split('\n'); let hi = lines.findIndex((l) => l.includes(needle)); if (hi < 0) hi = 0;
  return { lines, hi };
}
function showSource(kind: string, name?: string): void {
  let file = LIB + 'character.ts', view: { lines: string[]; hi: number };
  const n = name || '';
  if (kind === 'style') { const s = skin(n), f = SKIN_FILE[s.group]!; file = LIB + 'skins/' + f[0] + '.ts'; view = fileAt(f[1], 'Skins.' + s.name + ' = {'); }
  else if (kind === 'pose') { file = LIB + 'rig.ts'; view = fileAt(rigSrc, n.indexOf('feel-') === 0 ? "feel('" + n.slice(5) + "'" : "'" + n + "'"); }
  else if (kind === 'who') { file = LIB + 'design.ts'; view = fileAt(designSrc, "cast('" + n + "'"); }
  else if (kind === 'sound') { file = LIB + 'sound/sfx.ts'; view = fileAt(sfxSrc, "case '" + n + "'"); }
  else if (kind === 'voice') { file = LIB + 'voice/analyze.ts'; view = fileAt(voiceSrc, 'export function analyze'); }
  else if (kind === 'manner') { file = LIB + 'design.ts'; view = fileAt(designSrc, 'const MANNERS'); }
  else if (kind === 'set') { file = LIB + 'design.ts'; view = fileAt(designSrc, "['" + n + "'"); }
  else if (kind === 'film') {
    // the live film, so edits made in the timeline show up here
    file = 'apps/studio/src/hello.ts'; const lines = ('export default ' + lit(film ? film.film : hello).join('\n') + ';').split('\n');
    const want = ST.editRow ? ST.editRow + ':' : (ST.multicam ? 'cameras:' : 'shots:');
    view = { lines, hi: Math.max(0, lines.findIndex((l) => l.trim().indexOf(want) === 0)) };
  }
  else if (kind === 'create') { file = LIB + 'rig.ts'; view = fileAt(rigSrc, 'export class Actor'); }
  else if (kind === 'look') { file = LIB + 'character.ts'; view = fileAt(characterSrc, 'function guideParts'); }
  else if (kind === 'take') { file = LIB + 'skins/glitch.ts'; view = fileAt(glitchSrc, 'Skins.pixelwind = {'); }
  else if (kind === 'end') { file = LIB + 'film/film.ts'; view = fileAt(filmSrc, 'export function card'); }
  else { file = 'apps/studio/src/main.ts'; view = fileAt(mainSrc, 'function ' + ({ size: 'buildSizes', aspects: 'buildAspects' } as Record<string, string>)[kind] || 'function buildGrid'); }
  $('#engineFile').textContent = file; renderCode($('#engineSrc'), view.lines, view.hi);
}

// ── pointer gag ─────────────────────────────────────────────────────────
function updatePointer(): void {
  const p = ST.pointer, ptr = $('#pointer'); if (!p || ST.mode !== 'single') { ptr.style.display = 'none'; return; }
  const dt = ST.clock - p.start, area = $('#viewArea'), S = stage.S, b = S ? S.body : { cx: area.clientWidth * DPR / 2, cy: area.clientHeight * DPR / 2 };
  const tx = b.cx / DPR, ty = b.cy / DPR, fx = area.clientWidth + 60, fy = area.clientHeight + 60, k = K.ease(dt / 0.45);
  const x = K.lerp(fx, tx, k), y = K.lerp(fy, ty, k), s = dt > 0.45 && dt < 0.58 ? 0.8 : 1;
  ptr.style.display = 'block'; ptr.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  if (dt > 0.5) { if (ST.style !== 'pixelwind') ST.style = 'pixelwind'; K.tune['pixelwind.wind'] = K.clamp((dt - 0.5) / 0.5, 0, 1); stage.dirty = true; }
}

// ── transport ────────────────────────────────────────────────────────────
function fmt(t: number): string { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
let scrubbing = false;
function transport(): void {
  $('#bPlay').innerHTML = bts.playing ? '&#10074;&#10074;' : '&#9654;';
  const bb = bts.barBeat(bts.songT); $('#pos').textContent = 'bar ' + bb[0] + ' · ' + (Math.floor(bb[1] * 2) / 2);
  $('#clock').textContent = fmt(bts.songT); if (!scrubbing) $<HTMLInputElement>('#scrub').value = String(bts.songT);
  const intro = $('#intro');
  if (ST.created) intro.classList.add('off');
  else {
    intro.classList.remove('off'); intro.classList.toggle('typing', bts.playing || bts.songT > 0);
    const line = '{ at: [2, 1], create: max }', k = bts.playing || bts.songT > 0 ? Math.floor(K.clamp(bts.songT / (bts.timeOf([2, 1]) * 0.85), 0, 1) * line.length) : 0;
    $('#typed').innerHTML = esc(line.slice(0, k)) + '<span class="cur"></span>';
  }
}
function wire(): void {
  $('#bPlay').onclick = () => { if (bts.playing) bts.pause(); else bts.play(); };
  $('#bRestart').onclick = () => bts.seek(0);
  $('#bPrev').onclick = () => { const bb = bts.barBeat(bts.songT); bts.seek(bts.timeOf([Math.max(1, bb[0] - (bb[1] < 1.3 ? 1 : 0)), 1])); };
  $('#bNext').onclick = () => { const bb = bts.barBeat(bts.songT); bts.seek(bts.timeOf([bb[0] + 1, 1]) + 0.001); };
  const sc = $<HTMLInputElement>('#scrub'); sc.max = String(bts.total);
  sc.oninput = () => { scrubbing = true; bts.seek(+sc.value); }; sc.onchange = () => { scrubbing = false; };
  $<HTMLInputElement>('#cSound').onchange = (e) => setSound((e.target as HTMLInputElement).checked);
  $<HTMLInputElement>('#cCode').onchange = (e) => { $('#app').classList.toggle('nocode', !(e.target as HTMLInputElement).checked); setTimeout(layout, 30); };
  $('#bPanel').onclick = () => { if (ST.panel && ST.mode === 'single') closePanel(); else { setMode('single'); openPanel(ST.panel || 'Styles'); } };
  $('#bStart').onclick = () => { bts.seek(0); bts.play(); };
  $('#bFree').onclick = () => bts.seek(bts.timeOf([4, 4.5]) + 0.01);
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type !== 'range')) return;
    if (e.code === 'Space') { e.preventDefault(); $('#bPlay').click(); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); $('#bNext').click(); }
    else if (e.code === 'ArrowLeft') { e.preventDefault(); $('#bPrev').click(); }
    else if (e.key === 'Escape') closePanel();
    else if (e.key === 'g') ST.guides = !ST.guides;
  });
  $('#main').addEventListener('click', (e) => {
    const r = $('#main').getBoundingClientRect(), id = stage.pick((e.clientX - r.left) * DPR, (e.clientY - r.top) * DPR);
    if (id && id !== ST.selected && stage.members.length > 1) { selectActor(id); toast('The panels now edit ' + id); }
  });
  new ResizeObserver(() => { tilesSig = ''; layout(); }).observe($('#viewArea'));
}

// ── the frame loop ───────────────────────────────────────────────────────
// ?capture renders deterministically: no clock of its own, Studio.step(dt) advances it.
let lastNow = performance.now(), lastFilm = 0, lastCams = 0, lastCard = 0, lastDial = 0;
function loop(now: number): void { step(Math.min(0.1, (now - lastNow) / 1000)); lastNow = now; requestAnimationFrame(loop); }
function step(dt: number): void {
  ST.clock += dt;
  try {
    bts.tick(dt);
    updateTalks();
    if (voice.active) voice.update(dt);
    stage.members.forEach((m) => m.actor.update(dt));
    if (!stage.members.some((m) => m.actor === ST.actor)) ST.actor.update(dt);
    updatePointer();
    const t = ST.clock;
    if (ST.mode === 'single') { useStageSkin(ST.style); stage.palette = ST.palette; stage.guides = guidesFor(ST.style); stage.updateCamera(dt); stage.draw(t); }
    else if (ST.mode === 'card') { if (t - lastCard > 1 / 12 && ST.card) { lastCard = t; const cc = $<HTMLCanvasElement>('#cardCanvas'); card(cc.getContext('2d')!, cc.width, cc.height, t - ST.card.start, ST.card.text); } }
    else if (ST.mode === 'film' && film) {
      const f = film; f.update(dt); editor!.sync();
      if (t - lastFilm > 1 / 30) { lastFilm = t; const fc = $<HTMLCanvasElement>('#filmCanvas'); f.render(fc.getContext('2d')!, fc.width, fc.height, { palette: ST.palette, t: t }); }
      if (ST.multicam && t - lastCams > 1 / 10) { lastCams = t; $('#multicam').querySelectorAll('canvas').forEach((cv, i) => { f.render(cv.getContext('2d')!, cv.width, cv.height, { camIndex: i, t: t }); }); }
    } else {
      let budget = 6;
      tiles.forEach((x) => {
        if (x.shared) { x.h.actor = ST.actor; if (ST.mode !== 'sheet') { useSkin(x.h, ST.style); x.h.palette = ST.palette; x.h.guides = guidesFor(ST.style); } }
        if (x.anim) x.h.draw(t); else if (x.h.dirty && budget > 0) { budget--; x.h.draw(t, true); }
      });
    }
    for (let q = 0; q < (CAPTURE ? 40 : 3) && thumbQ.length;) { const it = thumbQ.shift()!; if (it[0].isConnected) { renderThumb(it[0], it[1]); q++; } }
    if ((ST.panel === 'Styles' || ST.panel === 'Poses') && ST.rev !== ST.panelRev && t - ST.revAt > 0.6 && ST.mode === 'single') buildPanel();
    if (t - lastDial > 0.08) { lastDial = t; syncDials(); }
    updateMeter();
    transport();
  } catch (e) { console.error(e); }
}

// ── boot ─────────────────────────────────────────────────────────────────
const tour = parseScore(tourScore);
if (!tour.ok) throw new Error('tour.score line ' + tour.error.line + ': ' + tour.error.message);
const BPM = tour.score.bpm || 92, beat = new Beat(BPM);
scoreLineOf = tour.lines;
const beatClock = { start: (t: number) => { beat.start(t); }, stop: () => beat.stop(), now: () => beat.now(), get running() { return beat.running; } };
function setSound(on: boolean): void { beat.on = on; mixer.on = on; if (!on) mixer.hush(); bts.setClock(on ? beatClock : null); }
bts = createConductor({
  bpm: BPM, events: tour.score.events, tail: tour.score.tail ?? 3.2, onCommand: exec, onReset: reset, onSettle: settle, commandsOf
});
setSound(!CAPTURE);
if (CAPTURE) document.documentElement.classList.add('capture');
marks = validate(tour.score.events, tour.lines);
initEditor();
void restoreProject();
// a share link pasted into a tab that already has the studio open only changes the hash
window.addEventListener('hashchange', () => { if (location.hash.indexOf('#p=') === 0) void restoreProject(); });
reset(); wire(); showSource('create'); transport();
if (!CAPTURE) requestAnimationFrame(loop);

declare global { interface Window { Studio: unknown } }
window.Studio = {
  exec, step, openPanel, setMode, conductor: bts, stage, voice,
  renderBeatWav: (sec: number) => Beat.render(bts.bpm, sec).then(Beat.wav64),
  /** The beat plus every logged cue (lines, effects, the film's sound track) as one WAV. */
  renderSoundWav: (sec: number) => Beat.render(bts.bpm, sec).then((b) => mixer.render(b)), mixer,
  project: () => currentProject(), loadProject, shareCode: () => encodeShare(currentProject()),
  setScore: (text: string) => { const ta = edTa(); ta.value = text; ta.dispatchEvent(new Event('input')); clearTimeout(applyTimer); applyScore(); },
  get state() { return ST; }, get film() { return film; }
};
export type { StyleSegment, WhoSegment };
