// beat.ts: the beat under the score, synthesised live with WebAudio.
// No samples: kick, clap, hats, bass and a chord stab are all oscillators and noise.
// It is also the master clock while it runs.

const ROOTS = [57, 53, 48, 55];                                             // A, F, C, G
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export default class Beat {
  bpm: number;
  ac: BaseAudioContext | null = null;
  on = true;
  running = false;
  private step = 0;
  private t0 = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private out!: GainNode;
  private noise!: AudioBuffer;

  constructor(bpm: number) { this.bpm = bpm; }

  private ensure(): boolean {
    if (this.ac) return true;
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext || w.webkitAudioContext; if (!AC) return false;
    this.ac = new AC(); this.wire(); return true;
  }
  private wire(): void {
    const ac = this.ac!;
    this.out = ac.createGain(); this.out.gain.value = 0.5; this.out.connect(ac.destination);
    const len = ac.sampleRate, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
  /** One sixteenth note, in seconds. */
  sd(): number { return 60 / this.bpm / 4; }
  start(songTime: number): boolean {
    if (!this.on || !this.ensure()) return false;
    const ac = this.ac as AudioContext;
    if (ac.state === 'suspended') void ac.resume();
    this.t0 = ac.currentTime + 0.05 - songTime; this.step = Math.ceil(songTime / this.sd());
    this.running = true; clearInterval(this.timer); this.timer = setInterval(() => this.pump(), 25);
    return true;
  }
  stop(): void { this.running = false; clearInterval(this.timer); }
  /** Song time, read off the audio clock. */
  now(): number { return this.ac!.currentTime - this.t0; }
  private pump(): void {
    const ahead = this.ac!.currentTime + 0.15;
    while (this.t0 + this.step * this.sd() < ahead) { this.play(this.step, this.t0 + this.step * this.sd()); this.step++; }
  }
  private play(n: number, at: number): void {
    const bar = Math.floor(n / 16) + 1, s = n % 16;
    if (bar > 25) return;
    if (bar === 1) { if (s % 4 === 0) this.tick(at); return; }                // the count-in under the typing
    const ch = (bar - 2) % 4, end = bar === 25 && s === 0;
    if (s === 0 || s === 8 || s === 10) this.kick(at);
    if (s === 4 || s === 12) this.clap(at);
    if (s % 2 === 0) this.hat(at, s % 4 === 2 ? 0.09 : 0.05, s === 14 ? 0.18 : 0.04);
    if (s === 0 || s === 3 || s === 8 || s === 11 || s === 14) this.bass(at, hz(ROOTS[ch]! - 24 + (s === 14 ? 7 : 0)));
    if (s === 6 || s === 12) this.stab(at, CHORDS[ch]!);
    if (end) this.out.gain.setTargetAtTime(0.0001, at, 0.6);
  }
  private env(node: AudioNode, at: number, a: number, peak: number, dec: number): GainNode {
    const g = this.ac!.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(peak, at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + dec);
    node.connect(g); g.connect(this.out); return g;
  }
  private kick(at: number): void { const o = this.ac!.createOscillator(); o.frequency.setValueAtTime(140, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.12); this.env(o, at, 0.002, 0.9, 0.35); o.start(at); o.stop(at + 0.4); }
  private noiseHit(at: number, type: BiquadFilterType, f: number, q: number, peak: number, dec: number): void {
    const s = this.ac!.createBufferSource(); s.buffer = this.noise; const fl = this.ac!.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl); this.env(fl, at, 0.001, peak, dec); s.start(at, Math.random() * 0.5); s.stop(at + dec + 0.05);
  }
  private clap(at: number): void { for (let i = 0; i < 3; i++) this.noiseHit(at + i * 0.012, 'bandpass', 1500, 0.8, 0.35, 0.12); }
  private hat(at: number, peak: number, dec: number): void { this.noiseHit(at, 'highpass', 8000, 0.7, peak, dec); }
  private tick(at: number): void { this.noiseHit(at, 'highpass', 5000, 1, 0.12, 0.03); }
  private bass(at: number, f: number): void {
    const o = this.ac!.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const fl = this.ac!.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(600, at); fl.frequency.exponentialRampToValueAtTime(120, at + 0.2);
    o.connect(fl); this.env(fl, at, 0.005, 0.28, 0.22); o.start(at); o.stop(at + 0.3);
  }
  private stab(at: number, notes: number[]): void {
    notes.forEach((m) => {
      const o = this.ac!.createOscillator(); o.type = 'square'; o.frequency.value = hz(m + 12);
      const fl = this.ac!.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800; o.connect(fl); this.env(fl, at, 0.004, 0.06, 0.18); o.start(at); o.stop(at + 0.25);
    });
  }

  /** Offline: the whole track, sample-accurate to the score, for exporting a video. */
  static render(bpm: number, seconds: number, sr = 48000): Promise<AudioBuffer> {
    const b = new Beat(bpm);
    b.ac = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr); b.wire();
    for (let n = 0; n * b.sd() < seconds; n++) b.play(n, n * b.sd());
    return (b.ac as OfflineAudioContext).startRendering();
  }
  /** 16-bit PCM WAV, base64, so a headless recorder can pull it out of the page. */
  static wav64(buf: AudioBuffer): string {
    const ch = buf.numberOfChannels, n = buf.length, dv = new DataView(new ArrayBuffer(44 + n * ch * 2));
    let o = 0;
    const str = (s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o++, s.charCodeAt(i)); };
    const u32 = (v: number) => { dv.setUint32(o, v, true); o += 4; }, u16 = (v: number) => { dv.setUint16(o, v, true); o += 2; };
    str('RIFF'); u32(36 + n * ch * 2); str('WAVE'); str('fmt '); u32(16); u16(1); u16(ch); u32(buf.sampleRate); u32(buf.sampleRate * ch * 2); u16(ch * 2); u16(16); str('data'); u32(n * ch * 2);
    const data: Float32Array[] = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) { const s = Math.max(-1, Math.min(1, data[k]![i]!)); dv.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2; }
    const bytes = new Uint8Array(dv.buffer); let bin = ''; const step = 0x8000;
    for (let j = 0; j < bytes.length; j += step) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + step)));
    return btoa(bin);
  }
}
