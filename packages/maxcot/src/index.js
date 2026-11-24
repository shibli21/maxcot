// maxcot: the character core. Rig, design table, scene builder and renderer.
// Skins live in 'maxcot/skins', films in 'maxcot/film', scores in 'maxcot/score'.
export { create as createCharacter, render, scene, camera } from './character.js';
export { Actor, P as POSES, SECTIONS as POSE_SECTIONS, resolve as resolvePose, CH as CHANNELS } from './rig.js';
export { DESIGN, DEFAULTS as DESIGN_DEFAULTS, CAST, cast, resolve as resolveDesign } from './design.js';
export { K as kit } from './kit.js';
import K from './kit.js';
export const setCanvasFactory = K.setCanvasFactory;
