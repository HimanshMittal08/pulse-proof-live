import type {
  BiologicalLivenessClassifier,
  LivenessFeatures,
  Verdict,
} from "@/types/biometrics";
import { clamp } from "./signalProcessing";

export const EVIDENCE_WEIGHTS = {
  signalQuality: 0.25,
  spatialConsistency: 0.2,
  temporalConsistency: 0.2,
  spectral: 0.2,
  motionStability: 0.1,
  lighting: 0.05,
} as const;

/** Spectral sub-score from SNR and peak concentration (both measured). */
export function spectralScore(snrDb: number, peakStrength: number): number {
  const snr = clamp(((snrDb + 5) / 15) * 100);
  const peak = clamp(((peakStrength - 0.15) / 0.5) * 100);
  return clamp(0.6 * snr + 0.4 * peak);
}

export function biologicalEvidenceScore(f: LivenessFeatures): number {
  const w = EVIDENCE_WEIGHTS;
  return clamp(
    w.signalQuality * f.signalQuality +
      w.spatialConsistency * f.spatialConsistency +
      w.temporalConsistency * f.temporalConsistency +
      w.spectral * spectralScore(f.snrDb, f.peakStrength) +
      w.motionStability * f.motionStability +
      w.lighting * f.lighting.score,
  );
}

/**
 * Baseline rule-based engine. Conservative by design: weak acquisition maps to
 * INSUFFICIENT_EVIDENCE, never to LIKELY_SYNTHETIC.
 * Swap this implementation for a trained model behind the same interface.
 */
export class RuleBasedLivenessClassifier implements BiologicalLivenessClassifier {
  readonly name = "rule-based-v1";

  classify(f: LivenessFeatures): Verdict {
    const evidence = biologicalEvidenceScore(f);
    const reasons: string[] = [];

    const acquisitionOk =
      f.durationSec >= 8 && f.fps >= 10 && f.lighting.label !== "POOR" && f.motionStability >= 50;

    if (f.durationSec < 8) reasons.push("Acquisition window was too short.");
    if (f.fps < 10) reasons.push(`Camera frame rate too low (${f.fps.toFixed(1)} fps).`);
    if (f.lighting.label === "POOR")
      reasons.push(f.lighting.reason ?? "Insufficient lighting for biological signal analysis.");
    if (f.motionStability < 50) reasons.push("Excessive face movement during acquisition.");

    if (!acquisitionOk) {
      return {
        label: "INSUFFICIENT_EVIDENCE",
        evidenceStrength: Math.round(evidence),
        reasons,
        explanation:
          "Acquisition conditions did not meet the minimum requirements for a reliable biological assessment.",
      };
    }

    const strongPulse =
      f.bpm != null && f.signalQuality >= 55 && f.snrDb >= 1.5 && f.peakStrength >= 0.3;
    const consistent = f.spatialConsistency >= 55 && f.temporalConsistency >= 55;

    if (strongPulse && consistent && evidence >= 62) {
      return {
        label: "LIKELY_REAL",
        evidenceStrength: Math.round(evidence),
        reasons: [
          `Pulse-related component at ${f.bpm!.toFixed(0)} BPM.`,
          `In-band SNR ${f.snrDb.toFixed(1)} dB.`,
          `Spatial consistency ${f.spatialConsistency.toFixed(0)}/100.`,
        ],
        explanation:
          "Consistent pulse-related signal components were detected across multiple facial regions with acceptable temporal stability.",
      };
    }

    // Only claim synthetic when acquisition was genuinely good but biology is absent.
    const highQualityAcquisition =
      f.lighting.label === "GOOD" &&
      f.motionStability >= 75 &&
      f.fps >= 20 &&
      f.durationSec >= 10 &&
      f.signalQuality >= 45;
    const biologyAbsent =
      f.spatialConsistency < 30 && (f.temporalConsistency < 30 || f.bpm == null);

    if (highQualityAcquisition && biologyAbsent) {
      return {
        label: "LIKELY_SYNTHETIC",
        evidenceStrength: Math.round(clamp(100 - evidence)),
        reasons: [
          "Acquisition quality was high (stable face, good lighting, sufficient frame rate).",
          `Spatial consistency only ${f.spatialConsistency.toFixed(0)}/100.`,
          `Temporal consistency only ${f.temporalConsistency.toFixed(0)}/100.`,
        ],
        explanation:
          "High-quality facial signal acquisition was successful, but expected biological consistency was not observed across the analyzed regions.",
      };
    }

    if (!strongPulse) reasons.push("Pulse-related signal was too weak or too noisy.");
    if (!consistent) reasons.push("Region and segment measurements did not agree sufficiently.");

    return {
      label: "INSUFFICIENT_EVIDENCE",
      evidenceStrength: Math.round(evidence),
      reasons,
      explanation:
        "Biological signal quality was too weak for a reliable assessment. This does not indicate a synthetic feed — it means the evidence was inconclusive.",
    };
  }
}

export const defaultClassifier: BiologicalLivenessClassifier =
  new RuleBasedLivenessClassifier();
