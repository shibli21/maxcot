// bts/bts.js: the conductor. Turns [bar, beat] into seconds, fires each line of
// the score on time, and on a seek rebuilds the studio by replaying every line
// up to that point instantly, so scrubbing is always exact.
(function (root) {
  'use strict';
  var MODIFIERS = { at: 1, palette: 1, to: 1, from: 1 };

  function Conductor(scoreFn, o) {
    o = o || {};
    this.bpm = o.bpm || 92; this.studio = o.studio;
    this.events = scoreFn('max', 'glitch').map(function (e, i) { return Object.assign({ i: i }, e); });
    var self = this;
    this.events.forEach(function (e) { e.t = self.timeOf(e.at); e.cmds = Object.keys(e).filter(function (k) { return !MODIFIERS[k] && k !== 'i' && k !== 't'; }); });
    if (this.events.length && this.events[0].create) this.events[0].cmds = ['create'];
    this.events.forEach(function (e) { if (e.sheet) e.cmds = ['sheet']; });
    this.total = this.events[this.events.length - 1].t + 3.2;
    this.songT = 0; this.next = 0; this.playing = false; this.last = -1;
    this.beat = new root.BTSBeat(this.bpm);
    this.source = sourceOf(scoreFn);
  }
  Conductor.prototype.spb = function () { return 60 / this.bpm; };
  Conductor.prototype.timeOf = function (at) { return ((at[0] - 1) * 4 + (at[1] - 1)) * this.spb(); };
  Conductor.prototype.barBeat = function (t) { var b = t / this.spb(); return [Math.floor(b / 4) + 1, (b % 4) + 1]; };
  Conductor.prototype.play = function () {
    if (this.songT >= this.total) this.seek(0);
    this.playing = true; if (this.sound) this.beat.start(this.songT);
  };
  Conductor.prototype.pause = function () { this.playing = false; this.beat.stop(); };
  Conductor.prototype.setSound = function (on) { this.sound = on; this.beat.on = on; if (!on) this.beat.stop(); else if (this.playing) this.beat.start(this.songT); };
  Conductor.prototype.fire = function (e, instant, now) {
    var st = this.studio;
    e.cmds.forEach(function (c) { st.exec(c, e[c], e, { instant: instant, now: now, since: Math.max(0, now - e.t) }); });
    this.last = e.i;
  };
  Conductor.prototype.tick = function (dt) {
    if (!this.playing) return;
    if (this.beat.running) this.songT = Math.max(this.songT, this.beat.now()); else this.songT += dt;
    while (this.next < this.events.length && this.events[this.next].t <= this.songT) this.fire(this.events[this.next++], false, this.songT);
    if (this.songT >= this.total) this.pause();
  };
  Conductor.prototype.seek = function (t) {
    t = Math.max(0, Math.min(this.total, t)); var was = this.playing;
    if (was) this.beat.stop();
    this.studio.reset(t);
    this.songT = t; this.next = 0; this.last = -1;
    while (this.next < this.events.length && this.events[this.next].t <= t) this.fire(this.events[this.next++], true, t);
    this.studio.settle(t);
    if (was && this.sound) this.beat.start(t);
  };

  // The score shown in the code pane, read back out of the function itself.
  function sourceOf(fn) {
    var s = fn.toString(), a = s.indexOf('return ['), b = s.lastIndexOf('];');
    var body = s.slice(a + 8, b).split('\n').filter(function (l, i, arr) { return !(i === 0 && !l.trim()); });
    var ind = body.reduce(function (m, l) { if (!l.trim()) return m; var n = l.match(/^\s*/)[0].length; return Math.min(m, n); }, 99);
    var lines = body.map(function (l) { return '  ' + l.slice(ind); });
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return ['var score = ['].concat(lines).concat(['];']);
  }

  root.BTSConductor = Conductor;
})(window);
