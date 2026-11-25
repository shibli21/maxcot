// mixer.ts: every sound the show makes besides the beat (spoken lines, effects,
// the film's sound track), played live and written down.
//
// Each cue is logged with the song time it starts at, keyed so a replay or a
// seek never logs it twice. An export then mixes the logged cues onto the
// offline beat, so the video carries exactly what was heard.
import { mixInto, wav } from 'maxcot/sound';

export interface Cue { key: string; at: number; samples: Float32Array; sampleRate: number; gain: number }

export default class Mixer {
  /** Sound on or off (the transport's Beat box). */
  on = true;
  readonly log = new Map<string, Cue>();
  private ac: AudioContext | null = null;
  private nodes: AudioBufferSourceNode[] = [];

  /** Log a cue and, if `live`, play it from `offset` seconds in. Pass `log: false` for previews off the song clock. */
  play(cue: Cue, offset = 0, live = true, log = true): void {
    if (log) this.log.set(cue.key, cue);
    if (!live || !this.on || offset >= cue.samples.length / cue.sampleRate) return;
    try {
      if (!this.ac) this.ac = new AudioContext();
      const ac = this.ac; if (ac.state === 'suspended') void ac.resume();
      const b = ac.createBuffer(1, cue.samples.length, cue.sampleRate); b.getChannelData(0).set(cue.samples);
      const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; g.gain.value = cue.gain;
      s.connect(g); g.connect(ac.destination); s.start(0, Math.max(0, offset));
      s.onended = () => { this.nodes = this.nodes.filter((n) => n !== s); }; this.nodes.push(s);
    } catch { /* no audio here: the pictures still run */ }
  }
  /** Stop everything that is sounding now. */
  hush(): void { this.nodes.forEach((n) => { try { n.stop(); } catch { /* already done */ } }); this.nodes = []; }
  get sounding(): boolean { return this.nodes.length > 0; }
  /** Forget the log (a different score). */
  clear(): void { this.log.clear(); this.hush(); }
  /** The logged cues mixed onto a rendered beat, one array per channel. */
  mixed(beat: AudioBuffer): Float32Array[] {
    const rate = beat.sampleRate, chans: Float32Array[] = [];
    for (let c = 0; c < beat.numberOfChannels; c++) chans.push(Float32Array.from(beat.getChannelData(c)));
    this.log.forEach((cue) => { chans.forEach((ch) => mixInto(ch, rate, cue)); });
    return chans;
  }
  /** Mix the logged cues onto a rendered beat and return the whole soundtrack as a base64 WAV. */
  render(beat: AudioBuffer): string {
    const bytes = wav(this.mixed(beat), beat.sampleRate); let bin = '';
    for (let j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(j, j + 0x8000)));
    return btoa(bin);
  }
}
