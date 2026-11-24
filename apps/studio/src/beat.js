// beat.js: the beat under the score, synthesised live with WebAudio.
// No samples: kick, clap, hats, bass and a chord stab are all oscillators and noise.
// It is also the master clock while it runs.
const root = window;
  function Beat(bpm) {
    this.bpm = bpm; this.ac = null; this.on = true; this.running = false; this.step = 0; this.t0 = 0; this.timer = null;
  }
  Beat.prototype.ensure = function () {
    if (this.ac) return true;
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return false;
    this.ac = new AC(); this.wire(); return true;
  };
  Beat.prototype.wire = function () {
    this.out = this.ac.createGain(); this.out.gain.value = 0.5; this.out.connect(this.ac.destination);
    var len = this.ac.sampleRate, buf = this.ac.createBuffer(1, len, this.ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  };
  Beat.prototype.sd = function () { return 60 / this.bpm / 4; };            // one sixteenth
  Beat.prototype.start = function (songTime) {
    if (!this.on || !this.ensure()) return false;
    if (this.ac.state === 'suspended') this.ac.resume();
    this.t0 = this.ac.currentTime + 0.05 - songTime; this.step = Math.ceil(songTime / this.sd());
    this.running = true; var self = this; clearInterval(this.timer); this.timer = setInterval(function () { self.pump(); }, 25);
    return true;
  };
  Beat.prototype.stop = function () { this.running = false; clearInterval(this.timer); };
  Beat.prototype.now = function () { return this.ac.currentTime - this.t0; };
  Beat.prototype.pump = function () {
    var ahead = this.ac.currentTime + 0.15;
    while (this.t0 + this.step * this.sd() < ahead) { this.play(this.step, this.t0 + this.step * this.sd()); this.step++; }
  };
  var ROOTS = [57, 53, 48, 55];                                             // A, F, C, G
  var CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  Beat.prototype.play = function (n, at) {
    var bar = Math.floor(n / 16) + 1, s = n % 16;
    if (bar > 25) return;
    if (bar === 1) { if (s % 4 === 0) this.tick(at); return; }                // the count-in under the typing
    var ch = (bar - 2) % 4, end = bar === 25 && s === 0;
    if (s === 0 || s === 8 || s === 10) this.kick(at);
    if (s === 4 || s === 12) this.clap(at);
    if (s % 2 === 0) this.hat(at, s % 4 === 2 ? 0.09 : 0.05, s === 14 ? 0.18 : 0.04);
    if (s === 0 || s === 3 || s === 8 || s === 11 || s === 14) this.bass(at, hz(ROOTS[ch] - 24 + (s === 14 ? 7 : 0)));
    if (s === 6 || s === 12) this.stab(at, CHORDS[ch]);
    if (end) this.out.gain.setTargetAtTime(0.0001, at, 0.6);
  };
  Beat.prototype.env = function (node, at, a, peak, dec) { var g = this.ac.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + dec); node.connect(g); g.connect(this.out); return g; };
  Beat.prototype.kick = function (at) { var o = this.ac.createOscillator(); o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12); this.env(o, at, 0.002, 0.9, 0.35); o.start(at); o.stop(at + 0.4); };
  Beat.prototype.noiseHit = function (at, type, f, q, peak, dec) { var s = this.ac.createBufferSource(); s.buffer = this.noise; var fl = this.ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); this.env(fl, at, 0.001, peak, dec); s.start(at, Math.random() * 0.5); s.stop(at + dec + 0.05); };
  Beat.prototype.clap = function (at) { for (var i = 0; i < 3; i++) this.noiseHit(at + i * 0.012, 'bandpass', 1500, 0.8, 0.35, 0.12); };
  Beat.prototype.hat = function (at, peak, dec) { this.noiseHit(at, 'highpass', 8000, 0.7, peak, dec); };
  Beat.prototype.tick = function (at) { this.noiseHit(at, 'highpass', 5000, 1, 0.12, 0.03); };
  Beat.prototype.bass = function (at, f) { var o = this.ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; var fl = this.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(600, at); fl.frequency.exponentialRampToValueAtTime(120, at + 0.2); o.connect(fl); this.env(fl, at, 0.005, 0.28, 0.22); o.start(at); o.stop(at + 0.3); };
  Beat.prototype.stab = function (at, notes) {
    var self = this; notes.forEach(function (m) {
      var o = self.ac.createOscillator(); o.type = 'square'; o.frequency.value = hz(m + 12);
      var fl = self.ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800; o.connect(fl); self.env(fl, at, 0.004, 0.06, 0.18); o.start(at); o.stop(at + 0.25);
    });
  };
  // Offline: the whole track, sample-accurate to the score, for exporting a video.
  Beat.render = function (bpm, seconds, sr) {
    sr = sr || 48000; var b = new Beat(bpm);
    b.ac = new root.OfflineAudioContext(2, Math.ceil(sr * seconds), sr); b.wire();
    for (var n = 0; n * b.sd() < seconds; n++) b.play(n, n * b.sd());
    return b.ac.startRendering();
  };
  // 16-bit PCM WAV, base64, so a headless recorder can pull it out of the page.
  Beat.wav64 = function (buf) {
    var ch = buf.numberOfChannels, n = buf.length, dv = new DataView(new ArrayBuffer(44 + n * ch * 2)), o = 0;
    var str = function (s) { for (var i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
    var u32 = function (v) { dv.setUint32(o, v, true); o += 4; }, u16 = function (v) { dv.setUint16(o, v, true); o += 2; };
    str('RIFF'); u32(36 + n * ch * 2); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(buf.sampleRate); u32(buf.sampleRate * ch * 2); u16(ch * 2); u16(16); str('data'); u32(n * ch * 2);
    var data = []; for (var c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    for (var i = 0; i < n; i++) for (var k = 0; k < ch; k++) { var s = Math.max(-1, Math.min(1, data[k][i])); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
    var bytes = new Uint8Array(dv.buffer), bin = '', step = 0x8000;
    for (var j = 0; j < bytes.length; j += step) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + step));
    return root.btoa(bin);
  };
export default Beat;

