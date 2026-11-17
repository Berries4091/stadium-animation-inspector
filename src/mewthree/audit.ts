import { CONTEXT_NAMES } from "../dsm/format";
import type { DsmModel } from "../dsm/format";

/** Inventory parsed Stadium model assets before any Mewthree reconstruction. */
export function auditStadiumModel(model: DsmModel) {
  const warnings: string[] = [];
  if (model.boneCount !== model.parent.length) warnings.push("Skeleton parent count differs from bone count");
  if (model.prims.length !== model.primCount) warnings.push("Primitive count mismatch");
  if (model.textures.length !== model.texCount) warnings.push("Texture count mismatch");
  if (model.anims.length !== model.animCount) warnings.push("Animation count mismatch");
  model.parent.forEach((parent, bone) => {
    if (parent >= model.boneCount || parent < -1) warnings.push(`Bone ${bone}: invalid parent ${parent}`);
    if (parent === bone) warnings.push(`Bone ${bone}: self-parenting`);
  });
  const contextMappings = CONTEXT_NAMES.map((name, slot) => ({
    name,
    animationIndex: model.ctx[slot] ?? -1,
  }));
  for (const entry of contextMappings) {
    if (entry.animationIndex >= model.anims.length) warnings.push(`Context ${entry.name}: missing animation ${entry.animationIndex}`);
  }
  return {
    species: model.species,
    bones: model.boneCount,
    primitives: model.primCount,
    textures: model.texCount,
    animations: model.anims.map((clip, index) => ({
      index, name: clip.name, frames: clip.frames, seconds: clip.seconds, loopStart: clip.loopStart,
      hasTracks: Array.isArray(clip.tracks),
    })),
    contextMappings,
    moveAnimationMappings: model.moveAnim.map((animationIndex, index) => ({
      moveIndex: index + 1, animationIndex,
    })).filter(entry => entry.animationIndex >= 0 && entry.animationIndex < model.anims.length),
    warnings,
  };
}

export function exportStadiumAuditJson(model: DsmModel): string {
  return JSON.stringify(auditStadiumModel(model), null, 2);
}
