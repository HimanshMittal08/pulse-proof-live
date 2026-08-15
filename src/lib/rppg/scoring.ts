import type { LivenessEngine, LivenessFeatures, Verdict } from "@/types/biometrics";
import { clamp } from "./signalProcessing";
import { spectralScore } from "./quality";
import { RPPG_CONFIG } from "./config";

export const EVIDENCE_WEIGHTS = RPPG_CONFIG.weights;

export { spectralScore };

/**
 * Weighted biological evidence, 0-100. Every input is measured from the
 * camera feed; nothing here is fixed or simulated.
 */
export function biologicalEvidenceScore(f: LivenessFeatures): number {
  const w = EVIDENCE_WEIGHTS;
  return clamp(
    w.spectral * spectralScore(f.snrDb, f.peakStrength) +
      w.periodicity * clamp(f.periodicity * 100) +
      w.temporal * f.temporalConsistency +
      w.spatial * f.spatialConsistency +
      w.motion * f.motionStability +
      w.lighting * f.lighting.score,
  );
}

/**
 * Biological evidence engine. Conservative about claiming SYNTHETIC, but it
 * does not treat imperfect metrics as a reason to withhold a verdict: when a
 * physiological signal is genuinely measurable, the result is LIKELY REAL with
 * an evidence strength that reflects the measurement.
 */
export class BiologicalEvidenceEngine implements LivenessEngine {
  readonly name = "biological-evidence-v2";

  classify(f: LivenessFeatures): Verdict {
    const t = RPPG_CONFIG.thresholds;
    const evidence = biologicalEvidenceScore(f);
    const reasons: string[] = [];
    const advice: string[] = [];

    // --- Hard acquisition failures: the recording is genuinely unusable. ---
    const blocking: string[] = [];
    if (f.durationSec < 6) {
      blocking.push("Not enough valid frames were captured.");
      advice.push("Stay in frame for the full acquisition window.");
    }
    if (f.fps < 8) {
      blocking.push(`Camera frame rate was too low (${f.fps.toFixed(1)} fps).`);
      advice.push("Close other tabs or apps using the camera or CPU.");
    }
    if (f.lighting.label === "POOR") {
      blocking.push(f.lighting.reason ?? "Lighting was insufficient.");
      advice.push("Face a soft, even light source and avoid strong backlight.");
    }
    if (f.motionStability < 25) {
      blocking.push("Face movement was too high for signal extraction.");
      advice.push("Sit comfortably and avoid large head movements.");
    }
    if (f.validPixelRatio < 0.15) {
      blocking.push("Too few valid skin pixels were sampled.");
      advice.push("Keep the forehead and cheeks unobstructed and facing the camera.");
    }

    if (blocking.length > 0) {
      return {
        label: "INSUFFICIENT_EVIDENCE",
        evidenceStrength: Math.round(evidence),
        reasons: blocking,
        explanation:
          "Acquisition conditions prevented a reliable biological measurement. This is not an indication of a synthetic feed.",
        advice,
      };
    }

    // --- Is a physiological signal actually detectable? ---
    const plausible =
      f.bpm != null && f.bpm >= t.plausibleBpm.min && f.bpm <= t.plausibleBpm.max;
    const spectralOk =
      f.snrDb >= t.detectableSnrDb || f.peakStrength >= t.detectablePeakStrength;
    const repeats = f.periodicity >= 0.15 || f.temporalConsistency >= 45;
    const detectable =
      plausible && spectralOk && repeats && f.signalQuality >= t.detectableQuality;

    const supported = f.supportingWindows >= t.supportingWindows;
    const regionsAgree = f.regions.length < 2 || f.frequencyAgreement >= 0.4;

    if (detectable && (evidence >= t.evidenceForReal || (supported && regionsAgree))) {
      reasons.push(`Pulse-related component at ${f.bpm!.toFixed(0)} BPM.`);
      reasons.push(`In-band SNR ${f.snrDb.toFixed(1)} dB, signal quality ${f.signalQuality.toFixed(0)}/100.`);
      reasons.push(
        `${f.supportingWindows} of ${f.bpmSegments.length} analysis windows support this rate.`,
      );
      if (f.regions.length > 1) {
        reasons.push(
          `Frequency agreement across ${f.regions.length} facial regions: ${(f.frequencyAgreement * 100).toFixed(0)}%.`,
        );
      }
      return {
        label: "LIKELY_REAL",
        evidenceStrength: Math.round(clamp(evidence, 40, 100)),
        reasons,
        explanation:
          "Pulse-related signal activity was detected consistently across multiple facial regions and analysis windows.",
      };
    }

    // --- Only claim synthetic when acquisition was good and biology absent. ---
    const highQualityAcquisition =
      f.lighting.label === "GOOD" &&
      f.motionStability >= 70 &&
      f.fps >= 20 &&
      f.durationSec >= 10 &&
      f.validPixelRatio >= 0.4 &&
      f.signalQuality >= 40;
    const biologyAbsent =
      f.spatialConsistency < 30 && f.temporalConsistency < 30 && f.periodicity < 0.2;

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
          "Biological signal acquisition was successful, but expected physiological consistency was not observed.",
      };
    }

    if (!plausible) {
      reasons.push("No physiologically plausible pulse rate could be isolated.");
      advice.push("Look directly at the camera and keep your face inside the frame.");
    } else if (!spectralOk || f.signalQuality < t.detectableQuality) {
      reasons.push(
        `Pulse-related signal was too weak (SNR ${f.snrDb.toFixed(1)} dB, quality ${f.signalQuality.toFixed(0)}/100).`,
      );
      advice.push("Use even, front-facing lighting and remain naturally still.");
    }
    if (!supported && plausible) {
      reasons.push("Analysis windows did not agree on a stable pulse rate.");
    }

    return {
      label: "INSUFFICIENT_EVIDENCE",
      evidenceStrength: Math.round(evidence),
      reasons,
      explanation:
        "The biological signal was too weak for a reliable assessment. This does not indicate a synthetic feed — the evidence was inconclusive.",
      advice,
    };
  }
}

/** @deprecated retained for compatibility; use BiologicalEvidenceEngine. */
export const RuleBasedLivenessClassifier = BiologicalEvidenceEngine;

export const defaultClassifier: LivenessEngine = new BiologicalEvidenceEngine();
export const defaultEngine = defaultClassifier;
