// maxcot: the character core. Rig, design table, scene builder and renderer.
// Skins live in 'maxcot/skins', films in 'maxcot/film', scores in 'maxcot/score'.
import K from './kit.js';

export { Character, create as createCharacter, render, paint, mergeScenes, scene, camera } from './character.js';
export { Stage, createStage } from './stage.js';
export type { StageMember, StageCastSpec, StageFraming, StageOptions, StageShot } from './stage.js';
export type { CharacterOptions, RenderOptions, SceneView } from './character.js';
export { Actor, P as POSES, SECTIONS as POSE_SECTIONS, resolve as resolvePose, CH as CHANNELS } from './rig.js';
export type { ActorOptions, PoseDef, PoseSection, PoseValues, ResolvedPose } from './rig.js';
export { DESIGN, DEFAULTS as DESIGN_DEFAULTS, CAST, cast, resolve as resolveDesign, mannerOf, DEFAULT_MANNER } from './design.js';
export type { CastMember, DesignRow, Manner, IdleHabit, GazeHabit } from './design.js';
export { K as kit } from './kit.js';
export type { Kit, ToonStyle, LineFn, SketchOptions, HatchOptions, HalftoneOptions, Palette as FillPalette } from './kit.js';
export type * from './types.js';

/** Supply canvases yourself: OffscreenCanvas in a worker, skia-canvas or @napi-rs/canvas in Node. */
export const setCanvasFactory = K.setCanvasFactory;
