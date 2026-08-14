import { decodeTracks } from "../dsm/parser";
import type { DsmAnimation, DsmModel } from "../dsm/format";

const ANGLE = Math.PI / 32768;
const BREAK_ANGLE = 16384;
const BREAK_MOVE = 0.5;

export type Pose = {
  pivot: Float32Array;
  draw: Float32Array;
  frameAt: number;
};

function sampleAt(component: number | number[], index: number): number {
  return typeof component === "number" ? component : component[index] ?? component[component.length - 1] ?? 0;
}

function angleDelta(component: number | number[], from: number, to: number): number {
  if (typeof component === "number") return 0;
  let delta = (component[to] ?? component[from] ?? 0) - (component[from] ?? 0);
  if (delta > 32768) delta -= 65536;
  else if (delta < -32768) delta += 65536;
  return delta;
}

function linearDelta(component: number | number[], from: number, to: number): number {
  if (typeof component === "number") return 0;
  return (component[to] ?? component[from] ?? 0) - (component[from] ?? 0);
}

function framePair(model: DsmModel, animationIndex: number | null, frame: number, wrap: boolean) {
  const animation = animationIndex === null ? null : model.anims[animationIndex];
  const frames = animation?.frames ?? 1;
  let f = Number.isFinite(frame) ? Math.max(0, frame) : 0;
  let base = Math.floor(f);
  let blend = f - base;
  let loopStart = animation?.loopStart ?? 0;
  if (!(loopStart > 0 && loopStart < frames)) loopStart = 0;

  if (base >= frames) {
    if (wrap && frames > loopStart) {
      base = loopStart + ((base - loopStart) % (frames - loopStart));
    } else {
      base = Math.max(0, frames - 1);
      blend = 0;
    }
  }

  const first = Math.min(Math.max(base, 0), Math.max(frames - 1, 0));
  let next = first;
  if (frames > 1 && first < frames - 1) next = first + 1;
  else if (frames > 1 && wrap) next = loopStart;
  else blend = 0;
  return { animation, frames, first, next, blend };
}

function matrixForBone(
  pivot: Float32Array,
  draw: Float32Array,
  index: number,
  parent: number,
  tx: number,
  ty: number,
  tz: number,
  rx: number,
  ry: number,
  rz: number,
  sx: number,
  sy: number,
  sz: number,
  accX: number[],
  accY: number[],
  accZ: number[],
) {
  let parentScaleX = 1;
  let parentScaleY = 1;
  let parentScaleZ = 1;
  if (parent >= 0) {
    parentScaleX = accX[parent];
    parentScaleY = accY[parent];
    parentScaleZ = accZ[parent];
  }
  tx *= parentScaleX;
  ty *= parentScaleY;
  tz *= parentScaleZ;

  const ax = rx * ANGLE;
  const ay = ry * ANGLE;
  const az = rz * ANGLE;
  const sinX = Math.sin(ax);
  const cosX = Math.cos(ax);
  const sinY = Math.sin(ay);
  const cosY = Math.cos(ay);
  const sinZ = Math.sin(az);
  const cosZ = Math.cos(az);
  const m11 = cosY * cosZ;
  const m12 = sinX * sinY * cosZ - cosX * sinZ;
  const m13 = cosX * sinY * cosZ + sinX * sinZ;
  const m21 = cosY * sinZ;
  const m22 = sinX * sinY * sinZ + cosX * cosZ;
  const m23 = cosX * sinY * sinZ - sinX * cosZ;
  const m31 = -sinY;
  const m32 = sinX * cosY;
  const m33 = cosX * cosY;
  const offset = index * 12;

  if (parent >= 0) {
    const parentOffset = parent * 12;
    const a1 = pivot[parentOffset];
    const a2 = pivot[parentOffset + 1];
    const a3 = pivot[parentOffset + 2];
    const a4 = pivot[parentOffset + 3];
    const b1 = pivot[parentOffset + 4];
    const b2 = pivot[parentOffset + 5];
    const b3 = pivot[parentOffset + 6];
    const b4 = pivot[parentOffset + 7];
    const c1 = pivot[parentOffset + 8];
    const c2 = pivot[parentOffset + 9];
    const c3 = pivot[parentOffset + 10];
    const c4 = pivot[parentOffset + 11];
    pivot[offset] = a1 * m11 + a2 * m21 + a3 * m31;
    pivot[offset + 1] = a1 * m12 + a2 * m22 + a3 * m32;
    pivot[offset + 2] = a1 * m13 + a2 * m23 + a3 * m33;
    pivot[offset + 3] = a1 * tx + a2 * ty + a3 * tz + a4;
    pivot[offset + 4] = b1 * m11 + b2 * m21 + b3 * m31;
    pivot[offset + 5] = b1 * m12 + b2 * m22 + b3 * m32;
    pivot[offset + 6] = b1 * m13 + b2 * m23 + b3 * m33;
    pivot[offset + 7] = b1 * tx + b2 * ty + b3 * tz + b4;
    pivot[offset + 8] = c1 * m11 + c2 * m21 + c3 * m31;
    pivot[offset + 9] = c1 * m12 + c2 * m22 + c3 * m32;
    pivot[offset + 10] = c1 * m13 + c2 * m23 + c3 * m33;
    pivot[offset + 11] = c1 * tx + c2 * ty + c3 * tz + c4;
  } else {
    pivot[offset] = m11;
    pivot[offset + 1] = m12;
    pivot[offset + 2] = m13;
    pivot[offset + 3] = tx;
    pivot[offset + 4] = m21;
    pivot[offset + 5] = m22;
    pivot[offset + 6] = m23;
    pivot[offset + 7] = ty;
    pivot[offset + 8] = m31;
    pivot[offset + 9] = m32;
    pivot[offset + 10] = m33;
    pivot[offset + 11] = tz;
  }

  const ownScaleX = parentScaleX * sx;
  const ownScaleY = parentScaleY * sy;
  const ownScaleZ = parentScaleZ * sz;
  accX[index] = ownScaleX;
  accY[index] = ownScaleY;
  accZ[index] = ownScaleZ;
  draw[offset] = pivot[offset] * ownScaleX;
  draw[offset + 1] = pivot[offset + 1] * ownScaleY;
  draw[offset + 2] = pivot[offset + 2] * ownScaleZ;
  draw[offset + 3] = pivot[offset + 3];
  draw[offset + 4] = pivot[offset + 4] * ownScaleX;
  draw[offset + 5] = pivot[offset + 5] * ownScaleY;
  draw[offset + 6] = pivot[offset + 6] * ownScaleZ;
  draw[offset + 7] = pivot[offset + 7];
  draw[offset + 8] = pivot[offset + 8] * ownScaleX;
  draw[offset + 9] = pivot[offset + 9] * ownScaleY;
  draw[offset + 10] = pivot[offset + 10] * ownScaleZ;
  draw[offset + 11] = pivot[offset + 11];
}

export function samplePose(
  model: DsmModel,
  animationIndex: number | null,
  frame: number,
  wrap: boolean,
): Pose {
  const { animation, first, next, blend } = framePair(model, animationIndex, frame, wrap);
  const tracks = animationIndex === null ? null : decodeTracks(model, animationIndex);
  const pivot = new Float32Array(model.boneCount * 12);
  const draw = new Float32Array(model.boneCount * 12);
  const accX: number[] = [];
  const accY: number[] = [];
  const accZ: number[] = [];
  const moveBreak = model.height > 0 ? (model.height / Math.max(model.rootScale, 1e-6)) * BREAK_MOVE : null;

  for (let bone = 0; bone < model.boneCount; bone += 1) {
    const offset = bone * 3;
    const components = tracks?.[bone];
    let tx: number;
    let ty: number;
    let tz: number;
    let rx: number;
    let ry: number;
    let rz: number;
    let sx: number;
    let sy: number;
    let sz: number;

    if (components) {
      tx = sampleAt(components[0], first);
      ty = sampleAt(components[1], first);
      tz = sampleAt(components[2], first);
      rx = sampleAt(components[3], first);
      ry = sampleAt(components[4], first);
      rz = sampleAt(components[5], first);
      sx = sampleAt(components[6], first);
      sy = sampleAt(components[7], first);
      sz = sampleAt(components[8], first);
      if (blend > 0) {
        const dx = Math.abs(angleDelta(components[3], first, next));
        const dy = Math.abs(angleDelta(components[4], first, next));
        const dz = Math.abs(angleDelta(components[5], first, next));
        if (dx <= BREAK_ANGLE && dy <= BREAK_ANGLE && dz <= BREAK_ANGLE) {
          rx += angleDelta(components[3], first, next) * blend;
          ry += angleDelta(components[4], first, next) * blend;
          rz += angleDelta(components[5], first, next) * blend;
        }
        const moveX = linearDelta(components[0], first, next);
        const moveY = linearDelta(components[1], first, next);
        const moveZ = linearDelta(components[2], first, next);
        const far = moveBreak !== null && (
          Math.abs(moveX) > moveBreak || Math.abs(moveY) > moveBreak || Math.abs(moveZ) > moveBreak
        );
        if (!far) {
          tx += moveX * blend;
          ty += moveY * blend;
          tz += moveZ * blend;
        }
        sx += linearDelta(components[6], first, next) * blend;
        sy += linearDelta(components[7], first, next) * blend;
        sz += linearDelta(components[8], first, next) * blend;
      }
    } else {
      tx = model.restT[offset];
      ty = model.restT[offset + 1];
      tz = model.restT[offset + 2];
      rx = model.restR[offset];
      ry = model.restR[offset + 1];
      rz = model.restR[offset + 2];
      sx = model.restS[offset];
      sy = model.restS[offset + 1];
      sz = model.restS[offset + 2];
    }

    matrixForBone(
      pivot,
      draw,
      bone,
      model.parent[bone],
      tx, ty, tz,
      rx, ry, rz,
      sx, sy, sz,
      accX, accY, accZ,
    );
  }

  return { pivot, draw, frameAt: first };
}

export function sampleTextureIndices(
  model: DsmModel,
  animation: DsmAnimation | null,
  frameAt: number,
): number[] {
  const aux = animation?.aux === null || animation?.aux === undefined
    ? null
    : model.auxAnims[animation.aux];
  return model.prims.map((primitive) => {
    let texture = primitive.tex;
    if (aux && primitive.texAnim >= 0 && primitive.texMap) {
      const stream = aux.channels[primitive.texAnim];
      if (stream && stream.length > 0) {
        const at = Math.min(Math.max(frameAt, 0), stream.length - 1);
        const mapped = primitive.texMap[stream[at]];
        if (mapped !== undefined) texture = mapped;
      }
    }
    return texture;
  });
}
