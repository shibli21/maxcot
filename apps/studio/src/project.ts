// project.ts: what a saved or shared project is, and how it travels.
//
// A project is the score text plus the film (with any timeline edits). It is
// saved as a .maxcot.json file or packed, compressed, into a share link.
// Everything read back from a file or a link is untrusted: it is parsed as
// data, checked field by field and size-limited. Nothing in it is executed.
import { parseScore } from 'maxcot/score';
import type { Film } from 'maxcot/film';

export interface Project {
  format: 'maxcot-project';
  version: 1;
  title: string;
  /** The score as text, comments and all. */
  score: string;
  film?: Film;
}
export type ReadResult = { ok: true; project: Project } | { ok: false; error: string };

/** Hard limits for anything read back in. */
const MAX_SCORE = 200_000, MAX_JSON = 1_000_000, MAX_ITEMS = 500;

export function makeProject(score: string, film?: Film): Project {
  const r = parseScore(score);
  const title = (r.ok && r.score.title) || 'Untitled';
  return film ? { format: 'maxcot-project', version: 1, title, score, film } : { format: 'maxcot-project', version: 1, title, score };
}

/** A file-system-friendly name for downloads. */
export function fileName(p: Project): string {
  return (p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project') + '.maxcot.json';
}

export function readProject(text: string): ReadResult {
  if (text.length > MAX_JSON) return { ok: false, error: 'That file is too large to be a project.' };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'That is not a project file (not valid JSON).' }; }
  if (!isObj(raw) || raw.format !== 'maxcot-project') return { ok: false, error: 'That is not a Maxcot project.' };
  if (raw.version !== 1) return { ok: false, error: 'This project was made by a newer version of Maxcot.' };
  if (typeof raw.score !== 'string' || raw.score.length > MAX_SCORE) return { ok: false, error: 'The project has no usable score.' };
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 120) : 'Untitled';
  const project: Project = { format: 'maxcot-project', version: 1, title, score: raw.score };
  if (raw.film !== undefined) {
    const film = checkFilm(raw.film);
    if (!film) return { ok: false, error: 'The project’s film is damaged.' };
    project.film = film;
  }
  return { ok: true, project };
}

// ── share links: deflate + base64url in the URL fragment (never sent to a server) ──
export async function encodeShare(p: Project): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  const packed = await pipe(bytes, new CompressionStream('deflate-raw'));
  let bin = ''; packed.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function decodeShare(code: string): Promise<ReadResult> {
  try {
    if (code.length > MAX_JSON) return { ok: false, error: 'That link is too long to be a project.' };
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const text = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_JSON));
    return readProject(text);
  } catch {
    return { ok: false, error: 'That share link is broken or incomplete.' };
  }
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit = Infinity): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = []; let n = 0;
  for (;;) {
    const { done, value } = await out.read(); if (done) break;
    n += value.length; if (n > limit) { await out.cancel(); throw new Error('too large'); }
    chunks.push(value);
  }
  const all = new Uint8Array(n); let o = 0; chunks.forEach((c) => { all.set(c, o); o += c.length; });
  return all;
}

// ── field-by-field film check: only known fields, of the right types, within limits ──
function isObj(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
const num = (v: unknown, min = -1e6, max = 1e6): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;
function list<T>(v: unknown, each: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length > MAX_ITEMS) return null;
  const out: T[] = []; for (const x of v) { const y = each(x); if (y === null) return null; out.push(y); }
  return out;
}
function checkFilm(v: unknown): Film | null {
  if (!isObj(v) || !str(v.title) || !isObj(v.actor) || !str(v.actor.key) || !str(v.actor.label) || !isObj(v.tracks)) return null;
  const camera = (c: unknown) => (isObj(c) && str(c.frame) && (c.on === undefined || str(c.on)) && (c.kind === undefined || str(c.kind)) && (c.id === undefined || str(c.id)) && (c.label === undefined || str(c.label))
    ? { frame: c.frame, ...(c.on !== undefined && { on: c.on as string }), ...(c.kind !== undefined && { kind: c.kind as string }), ...(c.id !== undefined && { id: c.id as string }), ...(c.label !== undefined && { label: c.label as string }) } : null);
  const beat = (b: unknown) => {
    if (!isObj(b) || !num(b.at, 0)) return null;
    const pose = b.pose === undefined ? undefined : str(b.pose) ? b.pose : list(b.pose, (x) => (str(x) ? x : null));
    if (pose === null || (b.look !== undefined && !str(b.look))) return null;
    return { at: b.at, ...(pose !== undefined && { pose }), ...(b.look !== undefined && { look: b.look as string }) };
  };
  const shots = list(v.shots, (s) => {
    if (!isObj(s) || !str(s.id) || !num(s.from, 0) || !num(s.len, 0.01, 3600)) return null;
    const cam = camera(s.camera), beats = list(s.beats, beat);
    return cam && beats ? { id: s.id, from: s.from, len: s.len, camera: cam, beats } : null;
  });
  const who = v.tracks.who === undefined ? [] : list(v.tracks.who, (s) => (isObj(s) && num(s.from, 0) && num(s.to, 0) && str(s.who) ? { from: s.from, to: s.to, who: s.who } : null));
  const style = v.tracks.style === undefined ? [] : list(v.tracks.style, (s) => (isObj(s) && num(s.from, 0) && num(s.to, 0) && str(s.style) && (s.blend === undefined || s.blend === 'wipe')
    ? { from: s.from, to: s.to, style: s.style, ...(s.blend === 'wipe' && { blend: 'wipe' as const }) } : null));
  const cameras = v.cameras === undefined ? undefined : list(v.cameras, camera);
  const end = v.end === undefined ? undefined : isObj(v.end) && v.end.card === 'logo' && num(v.end.len, 0, 60) && (v.end.text === undefined || str(v.end.text, 40))
    ? { card: 'logo' as const, len: v.end.len, ...(v.end.text !== undefined && { text: v.end.text as string }) } : null;
  if (!shots || !who || !style || cameras === null || end === null) return null;
  return {
    title: v.title, actor: { key: v.actor.key, label: v.actor.label }, shots, tracks: { who, style },
    ...(cameras && { cameras }), ...(end && { end })
  };
}
