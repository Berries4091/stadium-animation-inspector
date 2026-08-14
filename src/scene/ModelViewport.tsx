import { useEffect, useRef } from "react";
import type { DsmModel } from "../dsm/format";
import { ModelScene } from "./modelScene";

export type ViewportProps = {
  model: DsmModel;
  animationIndex: number | null;
  frame: number;
  playing: boolean;
  loop: boolean;
  speed: number;
  showWireframe: boolean;
  showBones: boolean;
  onFrameChange: (frame: number) => void;
  onPlaybackEnd: () => void;
};

export default function ModelViewport({
  model,
  animationIndex,
  frame,
  playing,
  loop,
  speed,
  showWireframe,
  showBones,
  onFrameChange,
  onPlaybackEnd,
}: ViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<ModelScene | null>(null);
  const playbackRef = useRef({ model, animationIndex, frame, playing, loop, speed, onFrameChange, onPlaybackEnd });

  playbackRef.current = { model, animationIndex, frame, playing, loop, speed, onFrameChange, onPlaybackEnd };

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const scene = new ModelScene(canvasRef.current);
    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setModel(model);
  }, [model]);

  useEffect(() => {
    sceneRef.current?.setPose(animationIndex, frame, loop);
  }, [animationIndex, frame, loop]);

  useEffect(() => {
    sceneRef.current?.setWireframe(showWireframe);
  }, [showWireframe, model]);

  useEffect(() => {
    sceneRef.current?.setBonesVisible(showBones);
  }, [showBones, model]);

  useEffect(() => {
    if (!playing || animationIndex === null) return undefined;
    let previous = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const state = playbackRef.current;
      const animation = state.animationIndex === null ? null : state.model.anims[state.animationIndex];
      if (!animation) return;
      const next = state.frame + ((now - previous) / 1000) * 30 * state.speed;
      previous = now;
      const last = Math.max(animation.frames - 1, 0);
      if (next >= animation.frames) {
        if (state.loop && animation.frames > 0) {
          const loopStart = animation.loopStart > 0 && animation.loopStart < animation.frames
            ? animation.loopStart
            : 0;
          const loopLength = Math.max(animation.frames - loopStart, 1);
          state.onFrameChange(loopStart + ((next - loopStart) % loopLength));
        } else {
          state.onFrameChange(last);
          state.onPlaybackEnd();
          return;
        }
      } else {
        state.onFrameChange(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, animationIndex, speed]);

  return (
    <div className="viewport-shell">
      <canvas ref={canvasRef} aria-label="Animated Stadium model viewport" />
      <div className="viewport-label">ORBIT / SCROLL TO ZOOM</div>
    </div>
  );
}
