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

export function createConductor(o) { return new Conductor(o); }

export class Conductor {
  constructor(o) {
    o = o || {};
    this.bpm = o.bpm || 120; this.beatsPerBar = o.beatsPerBar || 4;
    this.onCommand = o.onCommand || function () {}; this.onReset = o.onReset || function () {}; this.onSettle = o.onSettle || function () {};
    this.clock = o.clock || null;              // optional { start(t), stop(), now(), running }, e.g. an audio clock
    var mods = {}; (o.modifiers || ['at']).forEach(function (m) { mods[m] = 1; });
    var commandsOf = o.commandsOf || function (e) { return Object.keys(e).filter(function (k) { return !mods[k] && k !== 'i' && k !== 't'; }); };
    var self = this;
    this.events = (o.events || []).map(function (e, i) { var x = Object.assign({}, e, { i: i }); x.t = self.timeOf(e.at); return x; })
      .sort(function (a, b) { return a.t - b.t || a.i - b.i; });
    this.events.forEach(function (e) { e.cmds = commandsOf(e); });
    this.total = (this.events.length ? this.events[this.events.length - 1].t : 0) + (o.tail || 0);
    this.songT = 0; this.next = 0; this.playing = false; this.last = -1;
  }
  spb() { return 60 / this.bpm; }
  timeOf(at) { return ((at[0] - 1) * this.beatsPerBar + ((at[1] || 1) - 1)) * this.spb(); }
  barBeat(t) { var b = t / this.spb(); return [Math.floor(b / this.beatsPerBar) + 1, (b % this.beatsPerBar) + 1]; }
  play() {
    if (this.songT >= this.total) this.seek(0);
    this.playing = true; if (this.clock) this.clock.start(this.songT);
  }
  pause() { this.playing = false; if (this.clock) this.clock.stop(); }
  setClock(clock) {
    if (this.clock) this.clock.stop();
    this.clock = clock || null; if (this.clock && this.playing) this.clock.start(this.songT);
  }
  fire(e, instant, now) {
    var self = this;
    e.cmds.forEach(function (c) { self.onCommand(c, e[c], e, { instant: instant, now: now, since: Math.max(0, now - e.t) }); });
    this.last = e.i;
  }
  tick(dt) {
    if (!this.playing) return;
    if (this.clock && this.clock.running) this.songT = Math.max(this.songT, this.clock.now()); else this.songT += dt;
    while (this.next < this.events.length && this.events[this.next].t <= this.songT) this.fire(this.events[this.next++], false, this.songT);
    if (this.songT >= this.total) this.pause();
  }
  seek(t) {
    t = Math.max(0, Math.min(this.total, t)); var was = this.playing;
    if (was && this.clock) this.clock.stop();
    this.onReset(t);
    this.songT = t; this.next = 0; this.last = -1;
    while (this.next < this.events.length && this.events[this.next].t <= t) this.fire(this.events[this.next++], true, t);
    this.onSettle(t);
    if (was && this.clock) this.clock.start(t);
  }
}
