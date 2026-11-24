// Shared types: the contract between the rig, the scene builder and the skins.

export type Pt = [number, number];
export type Rnd = () => number;

/** The renderer only ever draws on a 2D context. OffscreenCanvas contexts are cast to this. */
export type Ctx2D = CanvasRenderingContext2D;
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
/** A reusable offscreen canvas, its context, and any state a skin wants to keep with it. */
export interface Buffer { canvas: HTMLCanvasElement; ctx: Ctx2D; [state: string]: unknown }

/** What a part should be filled with; each skin maps these to its own colours. */
export type FillKey =
  | 'body' | 'side' | 'hand' | 'eyeWhite' | 'pupil' | 'glint' | 'brow'
  | 'mouth' | 'teeth' | 'tongue' | 'shadow' | 'tear' | 'blush' | 'heart';

/** One drawable shape in a Scene. Skins decide how to paint it. */
export interface Part {
  role: string;
  pts: Pt[];
  fill?: FillKey;
  /** 0 (in shadow) to 1 (facing the light). */
  shade?: number;
  /** Outline this closed shape. */
  edge?: boolean;
  /** This is a line, not a shape. */
  line?: boolean;
  closed?: boolean;
  /** Line weight multiplier. */
  lw?: number;
  /** Parts sharing a group are outlined as one silhouette (the hands). */
  group?: string;
  groupStart?: boolean;
  /** Clip this part to that polygon (pupils inside eyes). */
  clip?: Pt[];
  /** Thin facet: also stroke its fill to hide anti-aliasing seams. */
  seam?: boolean;
  stroke?: boolean;
  alpha?: number;
  guide?: boolean;
  ink?: string;
  /** Set by the renderer when it draws the fat under-stroke of a group. */
  fat?: boolean;
  z?: number;
  normal?: number[];
  accent?: number;
  /** In a merged (multi-actor) scene: which actor this part belongs to. */
  actor?: number;
}

export interface Camera { cx: number; cy: number; unit: number }
export type Framing = 'full' | 'medium' | 'close';
export interface Box { x: number; y: number; w: number; h: number; cx: number; cy: number }
export interface HandInfo { x: number; y: number; r: number }
export interface MeshLine { plane: 'front' | 'side' | 'top'; pts: Pt[] }

/** Design dials (see DESIGN) and animation channels (see CHANNELS), by key. */
export type DesignValues = Record<string, number>;
export type Channels = Record<string, number>;
export interface Discrete { handL: string; handR: string; eyeMode: string; prop: string; [k: string]: string }

/** Everything needed to draw one moment of one actor. */
export interface Frame { P: DesignValues; C: Channels; D: Discrete; t: number; who: string }

/** A posed actor flattened to 2D, ready for a skin. */
export interface Scene {
  w: number; h: number; unit: number; t: number; seed: number;
  parts: Part[]; guides: boolean; cam: Camera; F: Frame;
  front: Pt[]; sil: Pt[]; body: Box; facets: Part[]; mesh: MeshLine[];
  handL?: HandInfo; handR?: HandInfo;
  palette?: string; key: string; style?: string;
  /** A merged scene (several actors) keeps each actor's own scene here. */
  actors?: Scene[];
}

/** Per-draw information a skin gets besides the scene. */
export interface View { w: number; h: number; t: number; palette?: string; seed: number; key: string }

export interface Ground {
  css?: string;
  draw?(ctx: Ctx2D, w: number, h: number, t: number, kit: unknown, view: View): void;
}

export type SkinGroup = 'drawn' | 'print' | 'screens' | 'signal' | 'time';
/** [tune key, label, min, max, default] */
export type SkinParam = [string, string, number, number, number];
export interface Palette { name: string; label: string; value: string[] }

/** A visual style. Draws a Scene; never sees 3D. */
export interface Skin {
  name: string;
  label: string;
  group: SkinGroup;
  about: string;
  /** How many times a second the drawing changes ("boils"). */
  fps: number;
  hold: 'skin' | { redraw: boolean };
  ground?: Ground;
  params?: SkinParam[];
  palettes?: Palette[];
  draw(S: Scene, ctx: Ctx2D, view: View): void;
}
