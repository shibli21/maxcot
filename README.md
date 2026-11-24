# Maxcot

**A character animation studio drawn entirely in code.** One rig, 26 visual skins, 8
actors and a film timeline, all driven by a score you write in bars and beats.

**[▶ Open the live studio](https://shibli21.github.io/maxcot/)** · [all 26 skins](https://shibli21.github.io/maxcot/sheet.html?mode=skins) · [smallest example](https://shibli21.github.io/maxcot/example.html)

![Maxcot](media/social-preview.png)

![The studio playing its score](media/demo.gif)

No images, no sprites, no audio samples. Every line, hatch, halftone dot and glitch is
generated each frame on a `<canvas>`, and the soundtrack is synthesized with WebAudio.

This repository has two parts:

- **[`packages/maxcot`](packages/maxcot)**: the engine as an npm library (strict TypeScript, no runtime dependencies). It runs in the browser, in workers and in Node.
- **[`apps/studio`](apps/studio)**: the studio, a 64-second showcase that plays a score through every feature, with panels for playing with it yourself.

## Run the studio

```sh
git clone https://github.com/shibli21/maxcot.git
cd maxcot
bun install
bun run dev
```

- **Play the score** plays the showcase: poses, all 26 skins, every actor, the design dials, the film editor, multicam and four aspect ratios.
- **Open the studio** gives you the panels for free play: Styles, Tune, Poses, Design and Motion.
- Space plays and pauses, ← and → jump a bar, and the scrubber seeks anywhere. `g` toggles construction lines and Esc closes the panel.
- While it plays, the left side shows the score line that's running and the real source of whatever it touches.

## Use the engine

```ts
import { createCharacter } from 'maxcot';
import { pencil, hologram } from 'maxcot/skins';

const max = createCharacter(canvas, { skin: pencil, pose: 'wave' });
max.pose('feel-excited');
max.setSkin(hologram, 'cyan');
max.cast('oldman');
```

See the **[library README](packages/maxcot/README.md)** for scores, films, rendering in
Node and writing your own skin.

## The score

The whole showcase is one data file, [`apps/studio/src/score.ts`](apps/studio/src/score.ts):

```ts
{ at: [2, 1], create: max },
{ at: [3, 1], pose: 'thinking' },
{ at: [5, 2], style: 'felttip' },
{ at: [8, 1], style: 'hologram', palette: 'cyan' },
{ at: [9, 2], who: 'girl' },
{ at: [17, 1], set: 'body.w', to: 1.05 },
{ at: [20, 1], play: 'filmkit/films/hello.js' },
{ at: [24, 2.5], end: { card: 'logo', text: 'MAXCOT' } }
```

The library's generic conductor (`maxcot/score`) schedules it. Each verb (`create`,
`style`, `pose`, `who`, `set`, `play`, `camera`, `end` and the rest) is one function in the
studio's `CMD` table, and the UI calls the same functions, so anything the score can do,
you can do by hand.

## How it works

**A skin never sees 3D.** The rig poses an actor and the scene builder flattens it into
`S.parts`: polygons and lines tagged with a role, fill, shade, group and clip. The body is
a rounded, tapered box, extruded and projected, with back-face culling and shaded facets.
The face is mapped onto the front plane. A skin only decides how to paint those parts,
which is why one rig can be shown in 26 skins, and most skins are a short recipe on a
shared toon renderer.

**Poses are layered and sprung.** A pose sets channel targets on one layer (`all`, `face`,
`eyes`, `mouth`, `hands`, `body`) and is composed from small libraries of body moves,
expressions, mouths and hand shapes. Every channel springs toward its target, so any pose
can follow any other.

**Seeking replays the score.** A seek resets the studio and replays every earlier event
instantly, so the state at any moment is exactly what the score says.

```
packages/maxcot/src/
  types.ts           the scene contract shared by rig, scene builder and skins
  kit.ts             seeded noise, sketch/hatch/halftone/brush, the toon renderer, canvas factory
  design.ts          DESIGN (one row per dial) and CAST (actors as overrides)
  rig.ts             channels, layers, pose libraries, the spring-driven Actor
  character.ts       Actor → Scene, render(), the Character class
  skins/             26 skins in 5 groups
  film/film.ts       film Player and timeline Editor
  score/conductor.ts bars-and-beats sequencer with seek-by-replay
apps/studio/src/
  main.ts            views, panels, code panes, transport, the CMD table
  score.ts           the showcase
  hello.ts           the 13-second film
  beat.ts            the WebAudio drum machine
```

## The skins

![All 26 skins](media/skins.png)

| Group | Skins |
|---|---|
| Drawn | pencil, sketch, ballpoint, felt-tip, ink bleed, ink punch, gloss |
| Print and paste | CMYK print, riso, gig poster, spray stencil, manga, cubist collage |
| Screens and light | hologram (8 beams), vector wireframe, neon, oscilloscope, teletext, pixel sprite |
| Glitch: signal | glitch, datamosh, databend, video feedback |
| Glitch: time | window trails, pixel wind, style mosh |

## Development

```sh
bun run dev         # the studio, served by Vite from the library's TypeScript sources
bun run typecheck   # strict TypeScript, library and studio
bun run test        # library unit tests (incl. every skin in Node), then studio visual tests
bun run build       # the studio, for static hosting
bun run build:lib   # the library, to packages/maxcot/dist
```

- **Unit tests** (Vitest): poses, springs, the conductor, scene geometry, the published entry points, and every skin rendered in Node.
- **Visual tests** (Playwright): screenshots of every skin, pose and actor, plus four studio states rendered frame by frame. They use the Chrome already on your machine. Baselines are per platform; run `bun --filter @maxcot/studio test:update` to record yours.

## Rendering a video

`?capture` turns off the studio's real-time clock so it can be stepped one frame at a
time. The recorder drives it in headless Chrome and pipes frames, plus the beat rendered
offline, into ffmpeg:

```sh
bun run record                                   # out/maxcot.mp4, 1920×1080, 30 fps
bun run record --start=17 --end=24 --out=out/clip.mp4
```

It needs Chrome or Edge (or `--chrome=/path`) and `ffmpeg` on your PATH. The social
preview is drawn by `apps/studio/poster.html`.

## License

[MIT](LICENSE)
