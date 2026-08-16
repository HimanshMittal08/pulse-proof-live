import type { FrameSample, RegionName, TemporalLiveness } from "@/types/biometrics";
import { clamp, median } from "./signalProcessing";

const REGION_NAMES: RegionName[] = ["forehead", "leftCheek", "rightCheek"];

/** Map a measured quantity onto 0-100 using a logarithmic dynamic range. */
function logScore(v: number, lo: number, hi: number): number {
  if (!isFinite(v) || v <= 0) return 0;
  if (v <= lo) return 0;
  if (v >= hi) return 100;
  return (Math.log(v / lo) / Math.log(hi / lo)) * 100;
}

function std(values: number[]): number {
  if (values.length < 2) return 0;
  const m = values.reduce((s, v) => s + v, 0) / values.length;
  const varr =
    values.reduce((s, v) => s + (v - m) * (v - m), 0) / (values.length - 1);
  return Math.sqrt(varr);
}

/**
 * Temporal liveness: does the *content* of the camera feed actually change
 * over time? A live subject produces continuous micro-movement, expression
 * changes, illumination drift and physiological colour modulation. A static
 * photograph, thumbnail or paused video frame produces almost none of this —
 * only negligible sensor noise, which is averaged away inside each ROI.
 *
 * Every value below is measured from the captured frames; nothing is assumed.
 */
export function computeTemporalLiveness(frames: FrameSample[]): TemporalLiveness {
  if (frames.length < 10) {
    return {
      score: 0,
      positionVariation: 0,
      scaleVariation: 0,
      roiChange: 0,
      brightnessVariation: 0,
      isStatic: true,
    };
  }

  const meanFaceW =
    frames.reduce((s, f) => s + f.faceWidth, 0) / frames.length || 1e-6;

  // Long-term head position / scale variation, normalised by face size.
  const positionVariation =
    (std(frames.map((f) => f.faceX)) + std(frames.map((f) => f.faceY))) /
    (2 * meanFaceW);
  const scaleVariation = std(frames.map((f) => f.faceWidth)) / meanFaceW;

  // Frame-to-frame fractional change of ROI colour (median across frames and
  // regions, so blinks or glitches cannot inflate it).
  const perRegion: number[] = [];
  for (const name of REGION_NAMES) {
    const deltas: number[] = [];
    let prev: { r: number; g: number; b: number } | null = null;
    for (const f of frames) {
      const s = f.regions[name];
      if (!s) {
        prev = null;
        continue;
      }
      if (prev) {
        const base = Math.max(1, (prev.r + prev.g + prev.b) / 3);
        const d =
          (Math.abs(s.r - prev.r) + Math.abs(s.g - prev.g) + Math.abs(s.b - prev.b)) /
          (3 * base);
        deltas.push(d);
      }
      prev = { r: s.r, g: s.g, b: s.b };
    }
    if (deltas.length > 5) perRegion.push(median(deltas));
  }
  const roiChange = perRegion.length ? median(perRegion) : 0;

  // Global illumination drift over the recording.
  const meanBrightness =
    frames.reduce((s, f) => s + f.brightness, 0) / frames.length || 1e-6;
  const brightnessVariation = std(frames.map((f) => f.brightness)) / meanBrightness;

  const motionScore = Math.max(
    logScore(positionVariation, 8e-4, 1.5e-2),
    logScore(scaleVariation, 5e-4, 1e-2),
  );
  const roiScore = logScore(roiChange, 2e-4, 4e-3);
  const brightScore = logScore(brightnessVariation, 1e-3, 1.5e-2);

  const score = clamp(0.4 * motionScore + 0.35 * roiScore + 0.25 * brightScore);

  return {
    score,
    positionVariation,
    scaleVariation,
    roiChange,
    brightnessVariation,
    isStatic: score < 30,
  };
}
