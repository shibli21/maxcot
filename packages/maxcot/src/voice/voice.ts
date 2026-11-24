// voice.ts: live lip-sync in the browser.
//
// A Voice listens to a microphone, an audio file or raw samples through a
// WebAudio analyser and, each frame, turns what it hears into a mouth shape
// (analyze.ts) for the actor it is attached to. Everything stays on the page:
// nothing is recorded or sent anywhere.
import { analyze, LipSmoother, QUIET, type AnalyzeOptions, type Lips } from './analyze.js';

/** Anything with a mouth to drive: an Actor, or your own object. */
export interface LipTarget { lips: Lips | null }

export interface VoiceOptions extends AnalyzeOptions {
  /** Share an AudioContext (one is made on first use otherwise). */
  context?: AudioContext;
  /** Who to drive. Can be changed later with attach(). */
  target?: LipTarget | null;
  /** Play files and samples out loud as well as reading them. Default true. The microphone is never played back. */
  monitor?: boolean;
}

export class Voice {
  /** The latest mouth shape. */
  lips: Lips = QUIET;
  target: LipTarget | null;
  /** Analysis settings; change them any time. */
  gate: number;
  range: number;
  monitor: boolean;
  /** What is feeding the voice right now. */
  source: 'none' | 'microphone' | 'file' = 'none';
  /** Fires once when a file or sample clip finishes playing. */
  onended: (() => void) | null = null;
  private ac: AudioContext | null;
  private analyser: AnalyserNode | null = null;
  private node: AudioNode | null = null;
  private stream: MediaStream | null = null;
  private buf: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private smoother = new LipSmoother();

  constructor(o: VoiceOptions = {}) {
    this.ac = o.context || null; this.target = o.target || null;
    this.gate = o.gate ?? -50; this.range = o.range ?? 32; this.monitor = o.monitor ?? true;
  }
  get context(): AudioContext {
    if (!this.ac) {
      const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AC = w.AudioContext || w.webkitAudioContext; if (!AC) throw new Error('This browser has no Web Audio.');
      this.ac = new AC();
    }
    return this.ac;
  }
  get active(): boolean { return this.node !== null; }
  /** Drive another actor (the old one's mouth is let go). */
  attach(target: LipTarget | null): this {
    if (this.target && this.target !== target) this.target.lips = null;
    this.target = target; return this;
  }
  /** Listen to the microphone. Asks the browser for permission. */
  async microphone(): Promise<void> {
    const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!md || !md.getUserMedia) throw new Error('This browser cannot open a microphone here (it needs https or localhost).');
    const stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.stop(); await this.wake();
    this.stream = stream; this.connect(this.context.createMediaStreamSource(stream), false); this.source = 'microphone';
  }
  /** Decode and play an audio file (a File, Blob or ArrayBuffer). Resolves with its length in seconds. */
  async file(data: Blob | ArrayBuffer): Promise<number> {
    const bytes = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    const buffer = await this.context.decodeAudioData(bytes.slice(0));
    this.play(buffer); this.source = 'file'; return buffer.duration;
  }
  /** Play mono samples (e.g. from babble()). `offset` starts part way in. */
  samples(data: Float32Array, sampleRate: number, offset = 0): void {
    const b = this.context.createBuffer(1, data.length, sampleRate); b.getChannelData(0).set(data);
    this.play(b, offset); this.source = 'file';
  }
  /** Play a decoded buffer. */
  play(buffer: AudioBuffer, offset = 0): void {
    this.stop(); void this.wake();
    const s = this.context.createBufferSource(); s.buffer = buffer;
    s.onended = () => { if (this.node === s) { this.stop(); const f = this.onended; if (f) f(); } };
    this.connect(s, this.monitor); s.start(0, Math.max(0, offset));
  }
  /** Stop listening or playing and close the mouth. */
  stop(): void {
    const n = this.node; this.node = null;
    if (n) { try { if (n instanceof AudioBufferSourceNode) { n.onended = null; n.stop(); } } catch { /* already stopped */ } n.disconnect(); }
    if (this.stream) { this.stream.getTracks().forEach((t) => t.stop()); this.stream = null; }
    this.source = 'none'; this.smoother.reset(); this.lips = QUIET;
    if (this.target) this.target.lips = null;
  }
  /** Read the sound and move the mouth. Call once a frame. */
  update(dt: number): Lips {
    if (!this.node || !this.analyser) return this.lips;
    this.analyser.getFloatTimeDomainData(this.buf);
    this.lips = this.smoother.push(analyze(this.buf, this.context.sampleRate, { gate: this.gate, range: this.range }), dt);
    if (this.target) this.target.lips = this.lips;
    return this.lips;
  }
  /** Stop and release the audio context if this voice made it. */
  close(): void { this.stop(); if (this.ac) void this.ac.close(); this.ac = null; this.analyser = null; }

  private async wake(): Promise<void> { if (this.context.state === 'suspended') await this.context.resume(); }
  private connect(n: AudioNode, out: boolean): void {
    const ac = this.context;
    if (!this.analyser) { this.analyser = ac.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0; }
    n.connect(this.analyser); if (out) n.connect(ac.destination);
    this.node = n;
  }
}

export function createVoice(o: VoiceOptions = {}): Voice { return new Voice(o); }
