import { describe, expect, it } from "vitest";
import type { DsmAnimation, DsmModel, DsmTracks } from "../dsm/format";
import { samplePose, sampleTextureIndices } from "./pose";

function components(tx: number | number[], rx: number | number[] = 0, scale = 1): Array<number | number[]> {
  return [tx, 0, 0, rx, 0, 0, scale, scale, scale];
}

function modelWithTracks(
  tracks: DsmTracks[],
  options: Partial<DsmAnimation> = {},
): DsmModel {
  return {
    species: 25,
    boneCount: tracks[0]?.length ?? 1,
    primCount: 0,
    texCount: 0,
    animCount: 1,
    auxCount: 0,
    rootScale: 1,
    staticPose: false,
    height: 2,
    floor: 0,
    radius: 1,
    moveAnim: [],
    moveAux: [],
    ctx: [],
    parent: [-1],
    restT: [0, 0, 0],
    restR: [0, 0, 0],
    restS: [1, 1, 1],
    prims: [],
    textures: [],
    anims: [{
      name: "test",
      frames: 1,
      loopStart: 0,
      aux: null,
      seconds: 1 / 30,
      offset: 0,
      tracks: tracks[0],
      ...options,
    }],
    auxAnims: [],
    bytes: new Uint8Array(),
  };
}

function makeTwoBoneModel(): DsmModel {
  const model = modelWithTracks([[
    components(0, 0, 2),
    components(4),
  ]]);
  model.boneCount = 2;
  model.parent = [-1, 0];
  model.restT = [0, 0, 0, 0, 0, 0];
  model.restR = [0, 0, 0, 0, 0, 0];
  model.restS = [1, 1, 1, 1, 1, 1];
  return model;
}

function makeLoopModel(): DsmModel {
  const tx = [0, 1, 2, 3, 4];
  return modelWithTracks([[components(tx)]] , { frames: 5, loopStart: 2, seconds: 5 / 30 });
}

function makeHoldModel(): DsmModel {
  const tx = [0, 1, 2, 3, 4];
  return modelWithTracks([[components(tx)]], { frames: 5, loopStart: 0, seconds: 5 / 30 });
}

describe("runtime-compatible pose sampling", () => {
  it("keeps a child's translation under the parent's accumulated scale", () => {
    const pose = samplePose(makeTwoBoneModel(), 0, 0, false);
    expect(pose.draw[12 + 3]).toBeCloseTo(8);
  });

  it("wraps a looping animation at loopStart and holds non-loop clips", () => {
    expect(samplePose(makeLoopModel(), 0, 11, true).frameAt).toBe(2);
    expect(samplePose(makeHoldModel(), 0, 12, false).frameAt).toBe(4);
  });

  it("uses the short signed rotation path between frames", () => {
    const model = modelWithTracks([[
      components(0, [32700, -32700]),
    ]], { frames: 2, seconds: 2 / 30 });
    const pose = samplePose(model, 0, 0.5, false);
    expect(pose.pivot[5]).toBeCloseTo(-1, 1);
  });

  it("clamps auxiliary texture streams after their final frame", () => {
    const model = modelWithTracks([[components(0)]], { aux: 0 });
    model.prims = [{
      tex: 0,
      cull: true,
      additive: false,
      texAnim: 0,
      texMap: { 0: 0, 1: 1 },
      fxFrames: [],
      vertCount: 0,
      indexCount: 0,
      px: [], py: [], pz: [], uv: [], nx: [], ny: [], nz: [], bone: [], index: [],
    }];
    model.auxAnims = [{ frames: 2, loopStart: 0, channels: [[0, 1]] }];
    expect(sampleTextureIndices(model, model.anims[0], 0)).toEqual([0]);
    expect(sampleTextureIndices(model, model.anims[0], 7)).toEqual([1]);
  });
});
