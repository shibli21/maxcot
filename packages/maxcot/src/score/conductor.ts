// maxcot/score: a sequencer for scores written in bars and beats.
//
//   const c = createConductor({ bpm: 92, events: [{ at: [2, 1], pose: 'wave' }, ...],
//                               onCommand: (cmd, value, event, ctx) => { ... } });
//   c.play(); every frame: c.tick(dt); c.seek(seconds) at any time.
//
// Each event fires its commands (its keys, minus modifiers like `at`) on time.
// A seek calls onReset, replays every earlier event instantly (ctx.instant),
// then calls onSettle. The host always ends up in exactly the state the score
// describes at that moment, whichever way you scrub.

/** [bar, beat], both counted from 1. Beats can be fractional: [4, 2.5]. */
export type BarBeat = [number, number];

/** One line of a score: when, plus any number of commands and modifiers. */
export interface ScoreEvent { at: BarBeat; [key: string]: unknown }

/** An event as scheduled: its index, its time in seconds and the commands it fires. */
export interface ScheduledEvent extends ScoreEvent { i: number; t: number; cmds: string[] }

export interface CommandContext {
  /** True while a seek replays history: skip transitions and side effects. */
  instant: boolean;
  /** The song time at which the command ran (the seek target during a replay). */
  now: number;
  /** Seconds since the event's own time. Use it to resume something mid-flight. */
  since: number;
}

/** An external clock to follow, e.g. an audio context, so pictures stay on the beat. */
export interface Clock { start(t: number): void; stop(): void; now(): number; readonly running: boolean }

export interface ConductorOptions {
  bpm?: number;
  beatsPerBar?: number;
  events?: ScoreEvent[];
  onCommand?: (cmd: string, value: unknown, event: ScheduledEvent, ctx: CommandContext) => void;
  onReset?: (t: number) => void;
  onSettle?: (t: number) => void;
  clock?: Clock | null;
  /** Keys that qualify a command rather than being one. Default ['at']. */
  modifiers?: string[];
  /** Decide which keys of an event are commands, overriding `modifiers`. */
  commandsOf?: (e: ScoreEvent) => string[];
  /** Seconds to keep going after the last event. */
  tail?: number;
}

export function createConductor(o?: ConductorOptions): Conductor { return new Conductor(o); }

export class Conductor {
  bpm: number;
  beatsPerBar: number;
  events: ScheduledEvent[];
  /** Length of the score in seconds, including the tail. */
  total: number;
  /** Where the playhead is, in seconds. */
  songT = 0;
  playing = false;
  /** Index of the last event fired. */
  last = -1;
  clock: Clock | null;
  private next = 0;
  private tail: number;
  private commandsOf: (e: ScoreEvent) => string[];
  private onCommand: NonNullable<ConductorOptions['onCommand']>;
  private onReset: (t: number) => void;
  private onSettle: (t: number) => void;

  constructor(o: ConductorOptions = {}) {
    this.bpm = o.bpm || 120; this.beatsPerBar = o.beatsPerBar || 4;
    this.onCommand = o.onCommand || (() => {}); this.onReset = o.onReset || (() => {}); this.onSettle = o.onSettle || (() => {});
    this.clock = o.clock || null;
    const mods = new Set(o.modifiers || ['at']);
    this.commandsOf = o.commandsOf || ((e: ScoreEvent) => Object.keys(e).filter((k) => !mods.has(k) && k !== 'i' && k !== 't'));
    this.tail = o.tail || 0;
    this.events = []; this.total = 0;
    this.schedule(o.events || []);
  }
  private schedule(events: ScoreEvent[]): void {
    this.events = events
      .map((e, i): ScheduledEvent => ({ ...e, i, t: this.timeOf(e.at), cmds: this.commandsOf(e) }))
      .sort((a, b) => a.t - b.t || a.i - b.i);
    const lastEvent = this.events[this.events.length - 1];
    this.total = (lastEvent ? lastEvent.t : 0) + this.tail;
  }
  /**
   * Swap in new events (an edited score), optionally with a new tempo, keeping the
   * playhead where it is. The host's state is rebuilt by replaying up to it.
   */
  load(events: ScoreEvent[], o: { bpm?: number; beatsPerBar?: number; tail?: number } = {}): void {
    if (o.bpm) this.bpm = o.bpm;
    if (o.beatsPerBar) this.beatsPerBar = o.beatsPerBar;
    if (o.tail != null) this.tail = o.tail;
    this.schedule(events);
    this.seek(Math.min(this.songT, this.total));
  }
  /** Seconds per beat. */
  spb(): number { return 60 / this.bpm; }
  /** [bar, beat] to seconds. */
  timeOf(at: BarBeat): number { return ((at[0] - 1) * this.beatsPerBar + ((at[1] || 1) - 1)) * this.spb(); }
  /** Seconds to [bar, beat]. */
  barBeat(t: number): BarBeat { const b = t / this.spb(); return [Math.floor(b / this.beatsPerBar) + 1, (b % this.beatsPerBar) + 1]; }
  play(): void {
    if (this.songT >= this.total) this.seek(0);
    this.playing = true; if (this.clock) this.clock.start(this.songT);
  }
  pause(): void { this.playing = false; if (this.clock) this.clock.stop(); }
  /** Follow a different clock (or none: then tick(dt) advances time). */
  setClock(clock: Clock | null): void {
    if (this.clock) this.clock.stop();
    this.clock = clock || null; if (this.clock && this.playing) this.clock.start(this.songT);
  }
  private fire(e: ScheduledEvent, instant: boolean, now: number): void {
    e.cmds.forEach((c) => { this.onCommand(c, e[c], e, { instant, now, since: Math.max(0, now - e.t) }); });
    this.last = e.i;
  }
  /** Advance by dt seconds (or to the clock's time) and fire whatever is due. */
  tick(dt: number): void {
    if (!this.playing) return;
    if (this.clock && this.clock.running) this.songT = Math.max(this.songT, this.clock.now()); else this.songT += dt;
    while (this.next < this.events.length && this.events[this.next]!.t <= this.songT) this.fire(this.events[this.next++]!, false, this.songT);
    if (this.songT >= this.total) this.pause();
  }
  /** Jump anywhere: reset, replay everything before t instantly, settle. */
  seek(t: number): void {
    t = Math.max(0, Math.min(this.total, t)); const was = this.playing;
    if (was && this.clock) this.clock.stop();
    this.onReset(t);
    this.songT = t; this.next = 0; this.last = -1;
    while (this.next < this.events.length && this.events[this.next]!.t <= t) this.fire(this.events[this.next++]!, true, t);
    this.onSettle(t);
    if (was && this.clock) this.clock.start(t);
  }
}
