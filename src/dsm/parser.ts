import {
  CONTEXT_NAMES,
  DsmAnimation,
  DsmModel,
  DsmPrimitive,
  DsmTracks,
  FPS,
  NONE,
} from "./format";
import { decodeLz4Block } from "./lz4";

export class DsmFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DsmFormatError";
  }
}

class Cursor {
  constructor(public readonly bytes: Uint8Array, public offset = 0) {}

  private ensure(size: number) {
    if (size < 0 || this.offset + size > this.bytes.length) {
      throw new DsmFormatError(`truncated DSM3 data at offset ${this.offset}`);
    }
  }

  u8() {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  i8() {
    const value = this.u8();
    return value >= 128 ? value - 256 : value;
  }

  u16() {
    this.ensure(2);
    const value = this.bytes[this.offset] | (this.bytes[this.offset + 1] << 8);
    this.offset += 2;
    return value;
  }

  i16() {
    const value = this.u16();
    return value >= 0x8000 ? value - 0x10000 : value;
  }

  u32() {
    this.ensure(4);
    const value = this.bytes[this.offset]
      | (this.bytes[this.offset + 1] << 8)
      | (this.bytes[this.offset + 2] << 16)
      | (this.bytes[this.offset + 3] * 0x1000000);
    this.offset += 4;
    return value >>> 0;
  }

  i32() {
    const value = this.u32();
    return value >= 0x80000000 ? value - 0x100000000 : value;
  }

  f32() {
    this.ensure(4);
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4);
    const value = view.getFloat32(0, true);
    this.offset += 4;
    return value;
  }

  fixed() { return this.i32() / 65536; }

  raw(length: number) {
    this.ensure(length);
    const result = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  text(length: number) {
    return String.fromCharCode(...this.raw(length));
  }
}

function hasMagic(bytes: Uint8Array, magic: string) {
  return magic.split("").every((char, index) => bytes[index] === char.charCodeAt(0));
}

function unpack(input: ArrayBuffer | Uint8Array): Uint8Array {
  const inputBytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (hasMagic(inputBytes, "DSM3")) return inputBytes;
  if (!hasMagic(inputBytes, "PVDZ")) {
    throw new DsmFormatError("file is neither a DSM3 stream nor a PVDZ pack");
  }
  if (inputBytes.length < 9) throw new DsmFormatError("truncated PVDZ header");
  const rawLength = inputBytes[4]
    | (inputBytes[5] << 8)
    | (inputBytes[6] << 16)
    | (inputBytes[7] * 0x1000000);
  const lz4Start = inputBytes.length >= 12
    && (inputBytes[8]
      | (inputBytes[9] << 8)
      | (inputBytes[10] << 16)
      | (inputBytes[11] * 0x1000000)) === (rawLength >>> 0)
    ? 12
    : 8;
  const raw = decodeLz4Block(inputBytes.subarray(lz4Start), rawLength >>> 0);
  if (!hasMagic(raw, "DSM3")) throw new DsmFormatError("PVDZ payload is not DSM3");
  return raw;
}

function readIndex(value: number) { return value === NONE ? -1 : value; }

function skipTracks(cursor: Cursor, boneCount: number, frames: number) {
  const componentBytes = [2, 2, 2, 2, 2, 2, 4, 4, 4];
  for (let bone = 0; bone < boneCount; bone += 1) {
    if (cursor.u8() === 0) continue;
    for (const bytes of componentBytes) {
      const kind = cursor.u8();
      cursor.raw(bytes * (kind === 0 ? 1 : frames));
    }
  }
}

function readPrimitive(cursor: Cursor): DsmPrimitive {
  const tex = cursor.u16();
  const cull = cursor.u8() !== 0;
  const additive = cursor.u8() !== 0;
  const texAnim = cursor.i16();
  const mapCount = cursor.u8();
  const texMap: Record<number, number> = {};
  for (let index = 0; index < mapCount; index += 1) {
    texMap[cursor.u8()] = cursor.u16();
  }
  const fxCount = cursor.u16();
  const fxFrames = Array.from({ length: fxCount }, () => cursor.u16());
  const vertCount = cursor.u16();
  const indexCount = cursor.u16();
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  const uv: number[] = [];
  const nx: number[] = [];
  const ny: number[] = [];
  const nz: number[] = [];
  const bone: number[] = [];
  for (let index = 0; index < vertCount; index += 1) {
    px.push(cursor.i16());
    py.push(cursor.i16());
    pz.push(cursor.i16());
    uv.push(cursor.i16() / 512, cursor.i16() / 512);
    nx.push(cursor.i8() / 127);
    ny.push(cursor.i8() / 127);
    nz.push(cursor.i8() / 127);
    bone.push(cursor.u8());
  }
  const indices = Array.from({ length: indexCount }, () => cursor.u16());
  return {
    tex, cull, additive, texAnim,
    texMap: mapCount > 0 ? texMap : undefined,
    fxFrames, vertCount, indexCount,
    px, py, pz, uv, nx, ny, nz, bone, index: indices,
  };
}

function readAnimation(cursor: Cursor, boneCount: number): DsmAnimation {
  const name = cursor.text(cursor.u8());
  const frames = cursor.u16();
  const loopStart = cursor.u16();
  const rawAux = cursor.i16();
  const animation: DsmAnimation = {
    name,
    frames,
    loopStart,
    aux: rawAux < 0 ? null : rawAux,
    seconds: frames / FPS,
    offset: cursor.offset,
  };
  skipTracks(cursor, boneCount, frames);
  return animation;
}

export function decodeTracks(model: DsmModel, index: number): DsmTracks {
  const animation = model.anims[index];
  if (!animation) throw new DsmFormatError(`animation index ${index} is out of range`);
  if (animation.tracks) return animation.tracks;
  const cursor = new Cursor(model.bytes, animation.offset);
  const tracks: DsmTracks = [];
  for (let bone = 0; bone < model.boneCount; bone += 1) {
    if (cursor.u8() === 0) {
      tracks.push(undefined);
      continue;
    }
    const components: Array<number | number[]> = [];
    for (let component = 0; component < 9; component += 1) {
      const kind = cursor.u8();
      const read = component >= 6 ? () => cursor.fixed() : () => cursor.i16();
      if (kind === 0) {
        components.push(read());
      } else {
        components.push(Array.from({ length: animation.frames }, read));
      }
    }
    tracks.push(components);
  }
  animation.tracks = tracks;
  return tracks;
}

export function parseDsm(input: ArrayBuffer | Uint8Array): DsmModel {
  const bytes = unpack(input);
  const cursor = new Cursor(bytes, 4);
  const species = cursor.u16();
  const boneCount = cursor.u16();
  const primCount = cursor.u16();
  const texCount = cursor.u16();
  const animCount = cursor.u16();
  const auxCount = cursor.u16();
  const rootScale = cursor.f32();
  const staticPose = cursor.u8() !== 0;
  const height = cursor.f32();
  const floor = cursor.f32();
  const radius = cursor.f32();
  const moveAnim = Array.from({ length: 165 }, () => readIndex(cursor.u16()));
  const moveAux = Array.from({ length: 165 }, () => cursor.i16());
  const ctx = Array.from({ length: CONTEXT_NAMES.length }, () => readIndex(cursor.u16()));

  const parent: number[] = [];
  const restT: number[] = [];
  const restR: number[] = [];
  const restS: number[] = [];
  for (let bone = 0; bone < boneCount; bone += 1) {
    parent.push(cursor.i16());
    for (let component = 0; component < 3; component += 1) restT.push(cursor.i16());
    for (let component = 0; component < 3; component += 1) restR.push(cursor.i16());
    for (let component = 0; component < 3; component += 1) restS.push(cursor.fixed());
  }

  const prims = Array.from({ length: primCount }, () => readPrimitive(cursor));
  const textures = Array.from({ length: texCount }, () => ({
    w: cursor.u16(),
    h: cursor.u16(),
    rgba: cursor.raw(cursor.u32()),
  }));
  const anims = Array.from({ length: animCount }, () => readAnimation(cursor, boneCount));
  const auxAnims = Array.from({ length: auxCount }, () => {
    const frames = cursor.u16();
    const loopStart = cursor.u16();
    const channelCount = cursor.u16();
    const channels = Array.from({ length: channelCount }, () =>
      Array.from({ length: cursor.u16() }, () => cursor.u16()),
    );
    return { frames, loopStart, channels };
  });

  return {
    species, boneCount, primCount, texCount, animCount, auxCount,
    rootScale, staticPose, height, floor, radius,
    moveAnim, moveAux, ctx, parent, restT, restR, restS,
    prims, textures, anims, auxAnims, bytes,
  };
}
