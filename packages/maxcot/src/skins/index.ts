// maxcot/skins: every skin is a plain object; import only the ones you use.
export * from './drawn.js';
export * from './print.js';
export * from './screens.js';
export * from './glitch.js';
import { pencil, sketch, ballpoint, felttip, inkbleed, inkpunch, gloss } from './drawn.js';
import { print, riso, gigposter, stencil, manga, cubist } from './print.js';
import { hologram, wireframe, neon, oscilloscope, teletext, pixel } from './screens.js';
import { glitch, datamosh, databend, feedback, trails, pixelwind, stylemosh } from './glitch.js';

import type { Skin, SkinGroup } from '../types.js';

export const GROUPS: Array<[SkinGroup, string]> = [['drawn', 'Drawn'], ['print', 'Print and paste'], ['screens', 'Screens and light'], ['signal', 'Glitch: signal'], ['time', 'Glitch: time']];

// Every skin, in catalogue order (module namespaces would sort them alphabetically).
export const allSkins: Skin[] = [
  pencil, sketch, ballpoint, felttip, inkbleed, inkpunch, gloss,
  print, riso, gigposter, stencil, manga, cubist,
  hologram, wireframe, neon, oscilloscope, teletext, pixel,
  glitch, datamosh, databend, feedback,
  trails, pixelwind, stylemosh
];
/** Look skins up by name, e.g. when a score or a film names its styles as strings. */
export function skinsByName(list?: Skin[]): Record<string, Skin> { const m: Record<string, Skin> = {}; (list || allSkins).forEach((s) => { m[s.name] = s; }); return m; }
