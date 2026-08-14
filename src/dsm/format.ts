export const NONE = 0xffff;
export const FPS = 30;

export const CONTEXT_NAMES = [
  "idle",
  "attack_default",
  "faint",
  "entrance",
  "reaction_169",
  "reaction_170",
  "reaction_171",
  "reaction_172",
  "reaction_173",
  "reaction_174",
  "struggle",
  "idle_alt",
  "faint_alt",
  "flinch",
  "reaction_179",
  "reaction_180",
  "reaction_181",
  "reaction_182",
  "entrance_alt",
  "idle_return",
] as const;

export type DsmTracks = Array<Array<number | number[]> | undefined>;

export type DsmPrimitive = {
  tex: number;
  cull: boolean;
  additive: boolean;
  texAnim: number;
  texMap?: Record<number, number>;
  fxFrames: number[];
  vertCount: number;
  indexCount: number;
  px: number[];
  py: number[];
  pz: number[];
  uv: number[];
  nx: number[];
  ny: number[];
  nz: number[];
  bone: number[];
  index: number[];
};

export type DsmTexture = {
  w: number;
  h: number;
  rgba: Uint8Array;
};

export type DsmAnimation = {
  name: string;
  frames: number;
  loopStart: number;
  aux: number | null;
  seconds: number;
  offset: number;
  tracks?: DsmTracks;
};

export type DsmAuxAnimation = {
  frames: number;
  loopStart: number;
  channels: number[][];
};

export type DsmModel = {
  species: number;
  boneCount: number;
  primCount: number;
  texCount: number;
  animCount: number;
  auxCount: number;
  rootScale: number;
  staticPose: boolean;
  height: number;
  floor: number;
  radius: number;
  moveAnim: number[];
  moveAux: number[];
  ctx: number[];
  parent: number[];
  restT: number[];
  restR: number[];
  restS: number[];
  prims: DsmPrimitive[];
  textures: DsmTexture[];
  anims: DsmAnimation[];
  auxAnims: DsmAuxAnimation[];
  bytes: Uint8Array;
};
