# maxcot

A character animation engine drawn entirely in code: one rig, 8 actors, 26 visual
skins, a film player and a bars-and-beats sequencer. No images, no sprites. Every
line, hatch and halftone dot is generated on a 2D canvas, in the browser or in Node.

```sh
npm install maxcot      # or: bun add maxcot
```

Strict TypeScript, ES modules, zero runtime dependencies. Four entry points:

| Import | What it gives you |
|---|---|
| `maxcot` | `createCharacter`, `createStage`, `Actor`, `render`, `scene`, poses, the design table, the cast |
| `maxcot/skins` | the 26 skins as plain objects, plus `allSkins` and `skinsByName` |
| `maxcot/film` | `Player` (shots, beats, who/style tracks, cameras), a DOM timeline `Editor`, `card` |
| `maxcot/score` | `createConductor`: sequence anything in bars and beats, with exact seeking |

## A character on a canvas

```ts
import { createCharacter } from 'maxcot';
import { pencil, hologram } from 'maxcot/skins';

const max = createCharacter(document.querySelector('canvas')!, { skin: pencil, pose: 'wave' });

max.pose('feel-excited');            // springs there; no in-betweens to author
max.setSkin(hologram, 'cyan');       // same rig, new look
max.cast('oldman');                  // morphs into another actor
max.set({ 'body.w': 1.3 });          // or turn any design dial
```

`createCharacter` runs its own `requestAnimationFrame` loop. To drive it yourself (a
game loop, or deterministic frames for video), pass `autoplay: false` and call
`max.step(dt)`.

Only the skins you import end up in your bundle.

## A cast on one stage

```ts
import { createStage } from 'maxcot';
import { felttip } from 'maxcot/skins';

const stage = createStage(canvas, { skin: felttip, cast: [
  { id: 'max' },
  { id: 'kid', who: 'child', pose: 'feel-happy' },
  { id: 'boss', who: 'boss', z: 1.2 }            // further back
] });

stage.look('kid', 'max').look('max', 'kid');     // they turn to each other
stage.pose('boss', 'feel-furious');
stage.shot('close', 'kid');                       // the camera eases in on the kid
stage.shot('wide');                               // and back out to everyone
```

Actors stand on a floor (`x` across, `z` into the picture) and share one camera:
`'wide'` frames the whole cast (or a group: `shot('wide', ['max', 'kid'])`), and `'full'`,
`'medium'` and `'close'` frame one actor. Every actor's scene is merged before painting,
so a skin draws the cast in one pass and whole-frame effects treat it as one picture.
A cast of one looks exactly like `createCharacter`. `stage.pick(x, y)` tells you who is
under a point.

## Poses, actors and dials

- **Poses** are layered: a pose on the `hands` layer leaves the face alone, and an `eyes` pose leaves the hands alone. There are 95, listed in `POSE_SECTIONS` (attitudes, feelings, eyes, mouth, hands, body), e.g. `thinking`, `feel-crying`, `eyes-suspicious`, `mouth-smirk`, `count3`, `thumbsup`.
- **Actors** (`CAST`) are just overrides of the design table: `max`, `child`, `girl`, `boss`, `clerk`, `teen`, `professor`, `oldman`. Add your own with `cast(key, label, about, values)`.
- **Manner**: each actor also moves like itself. `weight` sets its springs (the boss is heavy and settles slowly, the child is light and springy), `idle` is a habit (`still`, `fidget`, `bouncy`, `sway`), `gaze` is where its eyes wander (`steady`, `away`, `darting`, `us`), and `rest` is the pose it falls back to. Recasting swaps the manner too; change it with `actor.setManner({ weight: 0.9, idle: 'sway' })`.
- **Dials** (`DESIGN`): one row per dial, `[key, group, label, help, min, max, default]`. Body size, taper, corners, eye shape, lids, brows, mouth, hands, view angle and more.

## Sequencing with a score

```ts
import { createConductor } from 'maxcot/score';
import { skinsByName } from 'maxcot/skins';

const skins = skinsByName();
const score = createConductor({
  bpm: 100,
  events: [
    { at: [1, 1], pose: 'wave' },
    { at: [2, 1], style: 'riso' },
    { at: [2, 3], pose: 'feel-laughing' }
  ],
  onCommand(cmd, value) {
    if (cmd === 'pose') max.pose(String(value));
    if (cmd === 'style') max.setSkin(skins[String(value)]!);
  }
});

score.play();
// every frame: score.tick(dt). And score.seek(seconds) jumps anywhere, exactly:
// it calls onReset, then replays every earlier event with ctx.instant = true.
```

Pass `clock` (anything with `start`, `stop`, `now` and `running`) to follow an audio clock.

Scores can also be text. `parseScore` reads a JSON-like syntax with comments, unquoted
keys, single quotes and trailing commas. It never evaluates anything, and errors point at a
line and column:

```ts
import { parseScore } from 'maxcot/score';

const r = parseScore(text);
if (r.ok) score.load(r.score.events, { bpm: r.score.bpm });   // keeps the playhead
else console.log(`line ${r.error.line}: ${r.error.message}`);
```

## Films

```ts
import { Player } from 'maxcot/film';
import { skinsByName } from 'maxcot/skins';

const player = new Player(film, { skins: skinsByName() });
player.playing = true;
// every frame: player.update(dt); player.render(ctx, width, height);
```

A `Film` has shots (with poses and looks on beats), a "who plays it" track, a style
track with optional wipes, alternative cameras (full, medium, close, hand-held, push)
and an end card. `new Editor(element, player)` gives you a timeline to retime and
recast it.

## In Node (or a worker)

Hand the engine a canvas factory and it renders anywhere a 2D canvas exists:

```ts
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { Actor, render, setCanvasFactory, type Ctx2D } from 'maxcot';
import { riso } from 'maxcot/skins';

setCanvasFactory((w, h) => createCanvas(w, h));
const canvas = createCanvas(800, 600);
const boss = new Actor({ who: 'boss' }).pose('deal').snap();
render(canvas.getContext('2d') as unknown as Ctx2D, 800, 600, boss.frame(1), { skin: riso });
writeFileSync('boss.png', canvas.toBuffer('image/png'));
```

All 26 skins are tested this way with `@napi-rs/canvas`. In a Web Worker, OffscreenCanvas is used automatically.

## Writing a skin

A skin never sees 3D. The engine flattens the posed actor into `S.parts`, polygons and
lines tagged with a `role`, `fill`, `shade`, `group` and `clip`, and the skin decides how
to paint them. Most skins are a short recipe on the shared toon renderer:

```ts
import { kit as K, type Skin } from 'maxcot';

export const blueprint: Skin = {
  name: 'blueprint', label: 'Blueprint', group: 'drawn', about: 'White lines on blueprint paper.',
  fps: 12, hold: 'skin',
  ground: { css: '#1d4e89' },
  draw(S, ctx) {
    K.toon(S, ctx, {
      ink: '#e8f1ff', lw: 0.006,
      fill: (p) => (p.fill === 'pupil' || p.fill === 'brow' ? '#e8f1ff' : null)
    });
  }
};
```

`ToonStyle` also takes `line` (draw your own strokes), `texture` (hatching, halftones),
`pre`, `skip` and `noLines`. The `kit` has the building blocks the built-in skins use:
`sketch`, `hatch`, `halftone`, `brush`, `wobble`, `paper`, seeded `rng` and `noise`.

## License

MIT
