import type { FrameSample, MotionQuality } from "@/types/biometrics";
import { clamp, mean } from "./signalProcessing";

/**
 * Face motion measured from consecutive bounding boxes, normalised by
 * face size so it is resolution-independent.
 */
export function computeMotion(frames: FrameSample[]): MotionQuality {
  if (frames.length < 3) {
    return { stability: 0, displacement: 0, scaleChange: 0, excessive: false };
  }
  const disp: number[] = [];
  const scale: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const size = Math.max(1, (a.faceWidth + b.faceWidth) / 2);
    const dx = b.faceX - a.faceX;
    const dy = b.faceY - a.faceY;
    disp.push(Math.hypot(dx, dy) / size);
    scale.push(Math.abs(b.faceWidth - a.faceWidth) / size);
  }
  const d = mean(disp);
  const s = mean(scale);
  // 0.5% of face width per frame is calm, 5% is heavy movement
  const stability = clamp(100 - (d / 0.05) * 100 - (s / 0.05) * 60);
  return { stability, displacement: d, scaleChange: s, excessive: d > 0.045 || s > 0.05 };
}

/** Instantaneous motion between the two most recent frames. */
export function instantaneousMotion(a: FrameSample, b: FrameSample): number {
  const size = Math.max(1, (a.faceWidth + b.faceWidth) / 2);
  return Math.hypot(b.faceX - a.faceX, b.faceY - a.faceY) / size;
}
