# maxcot-3d

Real 3D for [maxcot](../maxcot) with [three.js](https://threejs.org). Actors become lit, rounded
blocks with mitts for hands, and the engine draws their faces live onto the front of the block,
so every pose, blink, lip-sync line and puppet move shows up in 3D exactly as it does in 2D.

`three` and `maxcot` are peer dependencies: bring your own.

```sh
bun add maxcot maxcot-3d three
```

```ts
import { Actor } from 'maxcot';
import { createStage3D } from 'maxcot-3d';

const stage = createStage3D({ canvas, look: 'clay', set: 'room' });
stage.resize(canvas.width, canvas.height);
const max = new Actor({ who: 'max' }), gran = new Actor({ who: 'grandma' });
stage.sync([{ id: 'max', actor: max, x: -0.5, z: 0 }, { id: 'gran', actor: gran, x: 0.5, z: 0 }]);
stage.shot('close', 'max');

max.pose('wave');
let last = performance.now();
requestAnimationFrame(function tick(now) {
  const dt = (now - last) / 1000; last = now;
  max.update(dt); gran.update(dt);
  stage.draw(now / 1000, dt);
  requestAnimationFrame(tick);
});
```

| | |
|---|---|
| **Looks** | `toon` (cel-shaded, inked outline), `clay` (matte, thumbed), `toy` (glossy vinyl, clear coat), `hologram` (additive light, wire cage) |
| **Sets** | `studio` (a curved white cyclorama), `room` (floor, window, lamp, plant), `street` (night, lit windows, lamp posts) |
| **Shots** | `wide`, `full`, `medium`, `close`, aimed at one actor or several |

`Stage3D` follows the same cast the 2D `Stage` plays: pass it `{ id, actor, x, z }` members
(`stage.members` from a 2D stage works as is). Without a canvas it keeps only the scene graph,
for tests or for rendering it yourself.

## License

MIT
