import type { LightingQuality } from "@/types/biometrics";
import { clamp, mean, std } from "./signalProcessing";

/**
 * Lighting quality from measured facial-ROI luminance statistics.
 * brightness is 0-255, over/under are clipped-pixel fractions (0-1).
 */
export function computeLighting(
  brightnessSamples: number[],
  overexposed: number[],
  underexposed: number[],
): LightingQuality {
  if (brightnessSamples.length === 0) {
    return { label: "POOR", score: 0, brightness: 0, reason: "No facial samples collected." };
  }
  const b = mean(brightnessSamples);
  const variability = std(brightnessSamples);
  const over = mean(overexposed);
  const under = mean(underexposed);

  // Ideal mean luminance band ~ 90-190
  let score = 100;
  if (b < 90) score -= ((90 - b) / 90) * 90;
  if (b > 190) score -= ((b - 190) / 65) * 90;
  score -= over * 120;
  score -= under * 120;
  score -= clamp((variability - 8) * 2.5, 0, 40);
  score = clamp(score);

  let reason: string | undefined;
  if (b < 60) reason = "Scene is too dark for reliable skin-colour sampling.";
  else if (over > 0.25) reason = "Facial highlights are clipped (overexposed).";
  else if (variability > 25) reason = "Lighting fluctuates strongly during acquisition.";

  const label = score >= 70 ? "GOOD" : score >= 45 ? "FAIR" : "POOR";
  return { label, score, brightness: b, ...(reason ? { reason } : {}) };
}

/**
 * Signal quality (0-100) from measurable spectral features.
 * snrDb: in-band SNR of the pulse peak, peakStrength: fraction of in-band
 * power concentrated at the peak + harmonic, stability: 0-1 agreement of the
 * peak across acquisition segments.
 */
export function computeSignalQuality(
  snrDb: number,
  peakStrength: number,
  stability: number,
): number {
  // -5 dB -> 0, +10 dB -> 100
  const snrScore = clamp(((snrDb + 5) / 15) * 100);
  // 0.15 -> 0, 0.65 -> 100
  const peakScore = clamp(((peakStrength - 0.15) / 0.5) * 100);
  const stabScore = clamp(stability * 100);
  return clamp(0.45 * snrScore + 0.35 * peakScore + 0.2 * stabScore);
}
