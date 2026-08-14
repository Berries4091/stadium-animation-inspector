import { CONTEXT_NAMES } from "./dsm/format";
import type { DsmModel } from "./dsm/format";

export function buildAnimationReport(model: DsmModel, animationIndex: number, frame: number): string {
  const animation = model.anims[animationIndex];
  if (!animation) return "No animation selected.";
  const contexts = CONTEXT_NAMES
    .filter((_, index) => model.ctx[index] === animationIndex)
    .join(", ") || "none";
  const moves = model.moveAnim
    .map((value, index) => value === animationIndex ? index + 1 : null)
    .filter((value): value is number => value !== null)
    .join(", ") || "none";
  return [
    `Species: ${model.species}`,
    `Animation: [${animationIndex}] ${animation.name}`,
    `Frame: ${frame.toFixed(2)} / ${Math.max(animation.frames - 1, 0)}`,
    `Time: ${(frame / 30).toFixed(3)}s / ${animation.seconds.toFixed(3)}s`,
    `Frames: ${animation.frames} @ 30 FPS`,
    `Loop start: ${animation.loopStart}`,
    `Context slots: ${contexts}`,
    `Move indexes: ${moves}`,
  ].join("\n");
}
