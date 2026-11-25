// hello.ts: a 13-second film. Shots hold beats (poses, looks);
// the editable tracks say who plays the part, which skin it is drawn in, and what it sounds like.
import type { Film } from 'maxcot/film';

const hello: Film = {
  title: 'Hello',
  actor: { key: 'max', label: 'Max' },
  shots: [
    { id: 'wide', from: 0, len: 7.8, camera: { frame: 'full' },
      beats: [
        { at: 0.15, look: 'us', pose: ['rest'] },
        { at: 0.9, pose: 'wave' },
        { at: 2.3, pose: 'selling' },
        { at: 3.6, pose: 'feel-proud' },
        { at: 4.9, pose: 'dunno' },
        { at: 6.2, pose: 'thinking' }
      ] },
    { id: 'single', from: 7.8, len: 3.5, camera: { frame: 'close', on: 'max' },
      beats: [
        { at: 0.15, look: 'us', pose: ['rest'] },
        { at: 0.5, pose: 'feel-surprised' },
        { at: 1.25, pose: 'eyes-suspicious' },
        { at: 2.0, pose: 'mouth-smirk' },
        { at: 2.75, pose: 'thumbsup', look: 'us' }
      ] }
  ],
  tracks: {
    who: [{ from: 0, to: 7.8, who: 'oldman' }],
    style: [{ from: 0, to: 7.8, style: 'pencil' }, { from: 8.3, to: 9.8, style: 'pixelwind', blend: 'wipe' }, { from: 9.8, to: 11.3, style: 'pencil', blend: 'wipe' }],
    // effects and spoken lines; a line moves the mouth of whoever plays the part
    sound: [
      { at: 0.9, say: { len: 1.1, vowels: 'eoa' } },
      { at: 2.35, say: { len: 1.0, seed: 4 } },
      { at: 3.6, sfx: 'ding' },
      { at: 4.9, sfx: 'slide' },
      { at: 6.25, say: { len: 0.9, vowels: 'uoo' } },
      { at: 8.3, sfx: 'whoosh' },
      { at: 9.8, sfx: 'whoosh' },
      { at: 10.55, sfx: 'tada' }
    ]
  },
  cameras: [
    { id: 'A', label: 'Full', frame: 'full' },
    { id: 'B', label: 'Close', frame: 'close', on: 'max' },
    { id: 'C', label: 'Medium', frame: 'medium' },
    { id: 'E', label: 'Hand-held', frame: 'full', kind: 'handheld' }
  ],
  end: { card: 'logo', len: 2 }
};

export default hello;
