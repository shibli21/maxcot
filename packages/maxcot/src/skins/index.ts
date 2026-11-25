// maxcot/skins: every skin is a plain object; import only the ones you use.
export * from './drawn.js';
export * from './print.js';
export * from './screens.js';
export * from './glitch.js';
export * from './house.js';
export * from './comics.js';
export * from './cartoon.js';
export * from './pixels.js';
import { pencil, sketch, ballpoint, felttip, inkbleed, inkpunch, gloss } from './drawn.js';
import { print, riso, gigposter, stencil, manga, cubist } from './print.js';
import { hologram, wireframe, neon, oscilloscope, teletext, pixel, afterglow } from './screens.js';
import { glitch, datamosh, databend, feedback, trails, pixelwind, stylemosh } from './glitch.js';
import { maxcot, chalk, papercut, crayon } from './house.js';
import { benday, silverage, noir, webcomic } from './comics.js';
import { rubberhose, flatvector, clay, animecel } from './cartoon.js';
import { gameboy, eightbit, isometric, ascii } from './pixels.js';

import type { Skin, SkinGroup } from '../types.js';

export const GROUPS: Array<[SkinGroup, string]> = [['drawn', 'Drawn'], ['print', 'Print and paste'], ['screens', 'Screens and light'], ['signal', 'Glitch: signal'], ['time', 'Glitch: time'],
  ['house', 'House'], ['comics', 'Comics'], ['cartoon', 'Cartoon'], ['pixels', 'Pixels']];

// Every skin, in catalogue order (module namespaces would sort them alphabetically).
export const allSkins: Skin[] = [
  pencil, sketch, ballpoint, felttip, inkbleed, inkpunch, gloss,
  print, riso, gigposter, stencil, manga, cubist,
  hologram, wireframe, neon, oscilloscope, teletext, pixel, afterglow,
  glitch, datamosh, databend, feedback,
  trails, pixelwind, stylemosh,
  maxcot, chalk, papercut, crayon,
  benday, silverage, noir, webcomic,
  rubberhose, flatvector, clay, animecel,
  gameboy, eightbit, isometric, ascii
];
/** Look skins up by name, e.g. when a score or a film names its styles as strings. */
export function skinsByName(list?: Skin[]): Record<string, Skin> { const m: Record<string, Skin> = {}; (list || allSkins).forEach((s) => { m[s.name] = s; }); return m; }
