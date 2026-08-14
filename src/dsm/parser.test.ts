import { describe, expect, it } from "vitest";
import { decodeTracks, parseDsm } from "./parser";

class Bytes {
  data: number[] = [];

  u8(value: number) { this.data.push(value & 0xff); }

  i8(value: number) { this.u8(value); }

  u16(value: number) {
    this.u8(value);
    this.u8(value >> 8);
  }

  i16(value: number) { this.u16(value < 0 ? value + 0x10000 : value); }

  u32(value: number) {
    this.u8(value);
    this.u8(value >> 8);
    this.u8(value >> 16);
    this.u8(value >> 24);
  }

  f32(value: number) {
    const bytes = new Uint8Array(new Float32Array([value]).buffer);
    for (const byte of bytes) this.u8(byte);
  }

  text(value: string) {
    this.u8(value.length);
    for (const char of value) this.u8(char.charCodeAt(0));
  }

  finish() { return new Uint8Array(this.data); }
}

function makeDsm(frames = 1, movingTranslation = false): Uint8Array {
  const out = new Bytes();
  out.data.push(...[..."DSM3"].map((char) => char.charCodeAt(0)));
  out.u16(25); // species
  out.u16(1); // bones
  out.u16(1); // primitives
  out.u16(1); // textures
  out.u16(1); // animations
  out.u16(1); // auxiliary texture streams
  out.f32(1);
  out.u8(0);
  out.f32(2);
  out.f32(0);
  out.f32(1);

  for (let index = 0; index < 165; index += 1) out.u16(index === 0 ? 0 : 0xffff);
  for (let index = 0; index < 165; index += 1) out.i16(-1);
  for (let index = 0; index < 20; index += 1) out.u16(index === 0 ? 0 : 0xffff);

  out.i16(-1); // root parent
  for (let index = 0; index < 3; index += 1) out.i16(0); // translation
  for (let index = 0; index < 3; index += 1) out.i16(0); // rotation
  for (let index = 0; index < 3; index += 1) out.u32(0x10000); // scale

  out.u16(0); // texture
  out.u8(1); // cull
  out.u8(0); // blend
  out.i16(-1); // texture animation channel
  out.u8(0); // texture map count
  out.u16(0); // effect frame count
  out.u16(3); // vertex count
  out.u16(3); // index count
  for (const [x, y, z] of [[0, 0, 0], [2, 0, 0], [0, 2, 0]]) {
    out.i16(x); out.i16(y); out.i16(z);
    out.i16(0); out.i16(0); // UV
    out.i8(0); out.i8(127); out.i8(0); // normal
    out.u8(0); // bone
  }
  out.u16(0); out.u16(1); out.u16(2);

  out.u16(1); out.u16(1); out.u32(4);
  out.data.push(255, 0, 0, 255);

  out.text("idle");
  out.u16(frames);
  out.u16(0);
  out.i16(-1);
  out.u8(1); // bone has tracks
  for (let component = 0; component < 9; component += 1) {
    const moving = movingTranslation && component === 0;
    out.u8(moving ? 1 : 0);
    if (moving) {
      out.i16(0);
      out.i16(4);
    } else if (component < 6) {
      out.i16(0);
    } else {
      out.u32(0x10000);
    }
  }

  out.u16(1); // aux frames
  out.u16(0); // aux loop start
  out.u16(0); // aux channels
  return out.finish();
}

function makePvdz(raw: Uint8Array): Uint8Array {
  const compressed: number[] = [];
  const literalLength = raw.length;
  const tokenLength = Math.min(literalLength, 15);
  compressed.push(tokenLength << 4);
  let remaining = literalLength - 15;
  if (literalLength >= 15) {
    while (remaining >= 255) {
      compressed.push(255);
      remaining -= 255;
    }
    compressed.push(remaining);
  }
  compressed.push(...raw);
  return new Uint8Array([
    ...[..."PVDZ"].map((char) => char.charCodeAt(0)),
    literalLength & 0xff,
    (literalLength >> 8) & 0xff,
    (literalLength >> 16) & 0xff,
    (literalLength >> 24) & 0xff,
    ...compressed,
  ]);
}

describe("DSM parser", () => {
  it("parses DSM3 header, tables, geometry, texture, and animation metadata", () => {
    const model = parseDsm(makeDsm());

    expect(model.species).toBe(25);
    expect(model.boneCount).toBe(1);
    expect(model.prims[0].vertCount).toBe(3);
    expect(model.textures[0].rgba).toEqual(new Uint8Array([255, 0, 0, 255]));
    expect(model.anims[0]).toMatchObject({ name: "idle", frames: 1 });
    expect(model.ctx[0]).toBe(0);
    expect(model.ctx[1]).toBe(-1);
  });

  it("accepts a PVDZ wrapper containing an LZ4 literal block", () => {
    expect(parseDsm(makePvdz(makeDsm()))).toMatchObject({ species: 25 });
  });

  it("decodes constant and per-frame track components", () => {
    const model = parseDsm(makeDsm(2, true));
    const tracks = decodeTracks(model, 0);

    expect(tracks[0]?.[0]).toEqual([0, 4]);
    expect(tracks[0]?.[1]).toBe(0);
    expect(decodeTracks(model, 0)).toBe(tracks);
  });

  it("rejects invalid magic and truncated streams with readable errors", () => {
    expect(() => parseDsm(new Uint8Array([1, 2, 3]))).toThrow(/DSM3|PVDZ/i);
    expect(() => parseDsm(new Uint8Array([..."DSM3"].map((char) => char.charCodeAt(0))))).toThrow(/truncated|offset/i);
  });
});
