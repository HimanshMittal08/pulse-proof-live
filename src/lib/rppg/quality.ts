import type { LightingQuality } from "@/types/biometrics";
import { clamp, mean, std } from "./signalProcessing";

/**
 * Adaptive lighting assessment from measured facial-ROI luminance statistics.
 * brightness is 0-255, over/under are clipped-pixel fractions (0-1).
 * Normal indoor lighting is accepted; only genuinely unusable exposure is POOR.
 */
export function computeLighting(
  brightnessSamples: number[],
  overexposed: number[],
  underexposed: number[],
): LightingQuality {
  if (brightnessSamples.length === 0) {
    return {
      label: "POOR",
      score: 0,
      brightness: 0,
      variance: 0,
      reason: "No facial samples collected.",
    };
  }
  const b = mean(brightnessSamples);
  const variability = std(brightnessSamples);
  const over = mean(overexposed);
  const under = mean(underexposed);

  // Usable luminance band is wide: dim indoor light still carries a pulse.
  let score = 100;
  if (b < 70) score -= ((70 - b) / 70) * 95;
  if (b > 205) score -= ((b - 205) / 50) * 90;
  score -= over * 90;
  score -= under * 90;
  score -= clamp((variability - 14) * 1.8, 0, 30);
  score = clamp(score);

  let reason: string | undefined;
  if (b < 45) reason = "Scene is too dark for reliable skin-colour sampling.";
  else if (over > 0.35) reason = "Facial highlights are clipped (overexposed).";
  else if (variability > 30) reason = "Lighting fluctuates strongly during acquisition.";

  const label = score >= 65 ? "GOOD" : score >= 30 ? "FAIR" : "POOR";
  return { label, score, brightness: b, variance: variability, ...(reason ? { reason } : {}) };
}

/** Spectral sub-score: how strong and concentrated the pulse peak is. */
export function spectralScore(snrDb: number, peakStrength: number): number {
  // -6 dB -> 0, +8 dB -> 100
  const snrScore = clamp(((snrDb + 6) / 14) * 100);
  // 0.12 -> 0, 0.55 -> 100
  const peakScore = clamp(((peakStrength - 0.12) / 0.43) * 100);
  return clamp(0.6 * snrScore + 0.4 * peakScore);
}

/**
 * Biological signal quality (0-100) from measurable spectral features.
 * snrDb: in-band SNR of the pulse peak, peakStrength: fraction of in-band
 * power at the peak + harmonic, stability: 0-1 agreement across windows.
 */
export function computeSignalQuality(
  snrDb: number,
  peakStrength: number,
  stability: number,
): number {
  const snrScore = clamp(((snrDb + 6) / 14) * 100);
  const peakScore = clamp(((peakStrength - 0.12) / 0.43) * 100);
  const stabScore = clamp(stability * 100);
  return clamp(0.45 * snrScore + 0.3 * peakScore + 0.25 * stabScore);
}
