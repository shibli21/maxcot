// maxcot/score: read a score from text, safely.
//
// The syntax is JSON with the comforts people expect when they type by hand:
// // and /* */ comments, unquoted keys, 'single' or "double" quotes and
// trailing commas. Nothing is ever evaluated, so a score from a stranger's
// share link cannot run code.
//
//   {
//     title: 'Tour', bpm: 92,
//     events: [
//       { at: [2, 1], create: 'max' },   // bar 2, beat 1
//       { at: [3, 1], pose: 'thinking' },
//     ]
//   }
//
// A bare array of events is accepted too.
import type { ScoreEvent } from './conductor.js';

export type ScoreValue = string | number | boolean | null | ScoreValue[] | { [key: string]: ScoreValue };

export interface ScoreDocument {
  title?: string;
  bpm?: number;
  beatsPerBar?: number;
  /** Seconds to keep going after the last event. */
  tail?: number;
  events: ScoreEvent[];
}

export interface ScoreError {
  message: string;
  /** 1-based line and column. */
  line: number;
  col: number;
}

export type ParseResult =
  | { ok: true; score: ScoreDocument; /** 0-based source line where each event starts, by event index. */ lines: number[] }
  | { ok: false; error: ScoreError };

class ParseError extends Error {
  constructor(message: string, readonly pos: number) { super(message); }
}

/** Parse score text. Never throws, never evaluates anything. */
export function parseScore(text: string): ParseResult {
  try {
    const p = new Parser(text);
    p.ws();
    const start = p.pos;
    const root = p.value();
    p.ws();
    if (p.pos < text.length) throw new ParseError('Unexpected text after the score', p.pos);
    const doc = toDocument(root, start, p);
    return { ok: true, score: doc.score, lines: doc.lines };
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: { message: e.message, ...lineCol(text, e.pos) } };
    throw e;
  }
}

function lineCol(text: string, pos: number): { line: number; col: number } {
  let line = 1, col = 1;
  for (let i = 0; i < pos && i < text.length; i++) { if (text[i] === '\n') { line++; col = 1; } else col++; }
  return { line, col };
}

function toDocument(root: ScoreValue, start: number, p: Parser): { score: ScoreDocument; lines: number[] } {
  let events: ScoreValue, meta: Record<string, ScoreValue> = {};
  if (Array.isArray(root)) events = root;
  else if (root && typeof root === 'object') {
    meta = root as Record<string, ScoreValue>;
    if (!('events' in meta)) throw new ParseError('A score needs an `events: [...]` list', start);
    events = meta.events!;
  } else throw new ParseError('A score is an object with `events`, or a list of events', start);
  if (!Array.isArray(events)) throw new ParseError('`events` must be a list', p.where(events, start));
  const score: ScoreDocument = { events: [] };
  for (const [k, kind] of [['title', 'string'], ['bpm', 'number'], ['beatsPerBar', 'number'], ['tail', 'number']] as const) {
    if (k in meta) {
      if (typeof meta[k] !== kind) throw new ParseError('`' + k + '` must be a ' + kind, p.where(meta[k]!, start));
      (score as unknown as Record<string, ScoreValue>)[k] = meta[k]!;
    }
  }
  if (score.bpm != null && !(score.bpm > 0 && score.bpm < 1000)) throw new ParseError('`bpm` must be between 0 and 1000', p.where(meta.bpm!, start));
  const lines: number[] = [];
  events.forEach((ev) => {
    const at = p.where(ev, start);
    if (!ev || typeof ev !== 'object' || Array.isArray(ev)) throw new ParseError('Each event is an object like { at: [bar, beat], pose: \'wave\' }', at);
    const o = ev as Record<string, ScoreValue>;
    const when = o.at;
    if (!Array.isArray(when) || when.length < 1 || when.length > 2 || when.some((n) => typeof n !== 'number'))
      throw new ParseError('`at` must be [bar, beat], e.g. at: [3, 1.5]', 'at' in o ? p.where(when!, at) : at);
    const [bar, beat = 1] = when as number[];
    if (!(bar! >= 1) || !(beat >= 1)) throw new ParseError('Bars and beats count from 1', p.where(when, at));
    if (Object.keys(o).length < 2) throw new ParseError('This event has a time but no command', at);
    score.events.push(o as unknown as ScoreEvent);
    lines.push(lineCol(p.text, at).line - 1);
  });
  return { score, lines };
}

class Parser {
  pos = 0;
  /** Where each parsed object or array started, for error positions and line numbers. */
  private starts = new WeakMap<object, number>();
  constructor(readonly text: string) {}
  where(v: ScoreValue, fallback: number): number { return v && typeof v === 'object' ? this.starts.get(v) ?? fallback : fallback; }

  ws(): void {
    const t = this.text;
    for (;;) {
      const c = t[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') this.pos++;
      else if (c === '/' && t[this.pos + 1] === '/') { while (this.pos < t.length && t[this.pos] !== '\n') this.pos++; }
      else if (c === '/' && t[this.pos + 1] === '*') {
        const end = t.indexOf('*/', this.pos + 2);
        if (end < 0) throw new ParseError('Unclosed /* comment', this.pos);
        this.pos = end + 2;
      } else return;
    }
  }
  value(): ScoreValue {
    this.ws();
    const c = this.text[this.pos];
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === "'" || c === '"') return this.string();
    if (c === '-' || c === '+' || c === '.' || (c != null && c >= '0' && c <= '9')) return this.number();
    const word = this.ident();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null') return null;
    if (word) throw new ParseError('`' + word + '` is not a value. Did you mean the text \'' + word + '\'?', this.pos - word.length);
    if (c == null) throw new ParseError('The score ends too early: something is not closed', this.pos);
    throw new ParseError('Unexpected `' + c + '`', this.pos);
  }
  private object(): Record<string, ScoreValue> {
    const start = this.pos++, out: Record<string, ScoreValue> = {};
    this.starts.set(out, start);
    for (;;) {
      this.ws();
      if (this.text[this.pos] === '}') { this.pos++; return out; }
      const keyAt = this.pos, c = this.text[this.pos];
      const key = c === "'" || c === '"' ? this.string() : this.ident();
      if (!key) throw new ParseError(c == null ? 'Missing } to close this object' : 'Expected a name like `pose`, got `' + c + '`', c == null ? start : keyAt);
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') throw new ParseError('`' + key + '` is not allowed as a name', keyAt);
      if (key in out) throw new ParseError('`' + key + '` appears twice in this object', keyAt);
      this.ws();
      if (this.text[this.pos] !== ':') throw new ParseError('Expected `:` after `' + key + '`', this.pos);
      this.pos++;
      out[key] = this.value();
      this.ws();
      const d = this.text[this.pos];
      if (d === ',') { this.pos++; continue; }
      if (d === '}') { this.pos++; return out; }
      if (d != null && /[A-Za-z_$'"]/.test(d)) throw new ParseError('Missing `,` before `' + (this.text.slice(this.pos).match(/^[\w$'"]+/) || [d])[0] + '`', this.pos);
      throw new ParseError(d == null ? 'Missing } to close this object' : 'Expected `,` or `}`, got `' + d + '`', d == null ? start : this.pos);
    }
  }
  private array(): ScoreValue[] {
    const start = this.pos++, out: ScoreValue[] = [];
    this.starts.set(out, start);
    for (;;) {
      this.ws();
      if (this.text[this.pos] === ']') { this.pos++; return out; }
      if (this.pos >= this.text.length) throw new ParseError('Missing ] to close this list', start);
      out.push(this.value());
      this.ws();
      const d = this.text[this.pos];
      if (d === ',') { this.pos++; continue; }
      if (d === ']') { this.pos++; return out; }
      if (d === '{' || d === '[' || d === "'" || d === '"') throw new ParseError('Missing `,` before this item (at the end of the line above?)', this.pos);
      throw new ParseError(d == null ? 'Missing ] to close this list' : 'Expected `,` or `]`, got `' + d + '`', d == null ? start : this.pos);
    }
  }
  private string(): string {
    const q = this.text[this.pos], start = this.pos++;
    let out = '';
    for (;;) {
      const c = this.text[this.pos++];
      if (c == null || c === '\n') throw new ParseError('This text is missing its closing ' + q, start);
      if (c === q) return out;
      if (c === '\\') {
        const e = this.text[this.pos++];
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '\\': '\\', "'": "'", '"': '"', '/': '/' };
        if (e != null && e in map) out += map[e];
        else if (e === 'u' && /^[0-9a-fA-F]{4}$/.test(this.text.slice(this.pos, this.pos + 4))) { out += String.fromCharCode(parseInt(this.text.slice(this.pos, this.pos + 4), 16)); this.pos += 4; }
        else throw new ParseError('Unknown escape \\' + (e ?? ''), this.pos - 2);
      } else out += c;
    }
  }
  private number(): number {
    const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(this.text.slice(this.pos));
    if (!m) throw new ParseError('Expected a number', this.pos);
    this.pos += m[0].length;
    return Number(m[0]);
  }
  private ident(): string {
    const m = /^[A-Za-z_$][\w$]*/.exec(this.text.slice(this.pos));
    if (!m) return '';
    this.pos += m[0].length;
    return m[0];
  }
}
