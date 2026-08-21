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
 * Recording/input quality (0-100), independent of biology. Answers only:
 * "could this recording be analysed at all?"
 */
export function inputQualityScore(f: LivenessFeatures): number {
  const fpsScore = clamp(((f.fps - 6) / 18) * 100);
  const durScore = clamp(((f.durationSec - 4) / 8) * 100);
  const pixScore = clamp((f.validPixelRatio / 0.5) * 100);
  return clamp(
    0.3 * f.lighting.score +
      0.25 * f.motionStability +
      0.2 * fpsScore +
      0.15 * durScore +
      0.1 * pixScore,
  );
}

export interface SyntheticEvidence {
  /** 0-100 weighted strength of positive manipulation indicators */
  score: number;
  /** human-readable measured indicators */
  indicators: string[];
}

/**
 * Positive, measured indicators of synthetic / replayed media. Every entry is
 * derived from the captured signal — there is no trained deepfake model here,
 * and no indicator fires purely because a recording was hard to analyse.
 */
export function syntheticEvidenceScore(f: LivenessFeatures): SyntheticEvidence {
  const indicators: string[] = [];
  let score = 0;
  const add = (weight: number, detail: string) => {
    score += weight;
    indicators.push(detail);
  };

  const tl = f.temporalLiveness;

  // Pulse-band energy exists but never repeats: typical of rendered texture noise.
  if (f.periodicity < 0.12 && f.peakStrength >= 0.2)
    add(18, `Pulse-band energy is present but never repeats (periodicity ${f.periodicity.toFixed(2)}).`);
  if (f.temporalConsistency < 25)
    add(18, `Frame-to-frame pulse rate is unstable (temporal consistency ${f.temporalConsistency.toFixed(0)}/100).`);
  if (f.spatialConsistency < 25)
    add(16, `Facial regions are inconsistent with one another (spatial consistency ${f.spatialConsistency.toFixed(0)}/100).`);
  if (f.regions.length > 1 && f.frequencyAgreement < 0.2)
    add(16, `Facial regions disagree on pulse frequency (${(f.frequencyAgreement * 100).toFixed(0)}%).`);
  if (f.supportingWindows === 0 && f.bpmSegments.length >= 3)
    add(14, "No analysis window supported a stable pulse rate.");
  // Face moves, but the skin surface does not respond: pasted / rendered face.
  if (tl.positionVariation > 0.004 && tl.roiChange < 0.0005)
    add(18, "Face moves while skin-region colour stays unnaturally constant (region artifact).");
  // Strong global illumination flicker without head motion: screen replay.
  if (tl.brightnessVariation > 0.06 && f.motionStability > 80)
    add(14, `Illumination flickers independently of the subject (${(tl.brightnessVariation * 100).toFixed(1)}%), consistent with a replayed screen.`);

  return { score: clamp(score), indicators };
}

/**
 * Biological evidence engine. Input quality, biological evidence and synthetic
 * evidence are assessed independently, then combined. Weak rPPG is never
 * treated as evidence of synthesis.
 */
export class BiologicalEvidenceEngine implements LivenessEngine {
  readonly name = "biological-evidence-v3";

  classify(f: LivenessFeatures): Verdict {
    const t = RPPG_CONFIG.thresholds;
    const evidence = biologicalEvidenceScore(f);
    const inputQuality = inputQualityScore(f);
    const reasons: string[] = [];
    const advice: string[] = [];

    // --- Stage 1: can this recording be analysed at all? ---
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

    if (blocking.length > 0 || inputQuality < 35) {
      if (blocking.length === 0)
        blocking.push(`Overall recording quality was low (${inputQuality.toFixed(0)}/100).`);
      return {
        label: "INSUFFICIENT_EVIDENCE",
        evidenceStrength: Math.round(evidence),
        reasons: blocking,
        explanation:
          "The recording did not provide enough reliable evidence for a confident assessment.",
        advice,
      };
    }

    // --- Stage 1b: active liveness (challenge-response). ---
    // A detected face, changing pixels or even a pulse-like signal do not
    // prove live presence. Only a requested, measured facial action does.
    const al = f.activeLiveness;
    if (!al.verified) {
      return {
        label: "INSUFFICIENT_EVIDENCE",
        evidenceStrength: Math.round(clamp(evidence * 0.4)),
        reasons: [
          "Live presence could not be verified.",
          al.reason ?? "The requested facial action was not observed.",
          ...al.challenges.map((c) => c.detail),
          "This does not indicate AI-generated or manipulated media — only that a live subject was not confirmed.",
        ],
        explanation:
          "Live presence could not be verified: the requested facial action was not observed in the tracked face geometry, so no live biological assessment could be completed.",
        advice: [
          "Follow the on-screen instruction (head turn, blink or mouth movement) during the scan.",
          "Point the camera at a live person rather than a photo, screen or paused video.",
        ],
      };
    }

    // --- Stage 1c: temporal liveness gate. ---
    // A live subject continuously changes the camera content (micro-movement,
    // expression, illumination drift, physiological colour modulation). A
    // static photo, thumbnail or paused frame does not. Without measured
    // temporal change, no LIKELY_REAL verdict may be issued.
    const tl = f.temporalLiveness;
    if (tl.isStatic) {
      return {
        label: "INSUFFICIENT_EVIDENCE",
        evidenceStrength: Math.round(clamp(evidence * 0.5)),
        reasons: [
          "Input appears static/non-live; a live biological assessment could not be performed.",
          `Temporal change score ${tl.score.toFixed(0)}/100 (head motion ${(tl.positionVariation * 100).toFixed(3)}%, ROI change ${(tl.roiChange * 100).toFixed(3)}%, illumination drift ${(tl.brightnessVariation * 100).toFixed(2)}%).`,
          "This does not indicate an AI-generated image — only that no live, temporally changing subject was verified.",
        ],
        explanation:
          "Insufficient temporal evidence of a live camera subject. The frames did not change in the way a live person in front of a camera always does.",
        advice: [
          "Point the camera at a live person rather than a photo or screen.",
        ],
      };
    }


    // --- Stage 2: biological evidence (measured, graded, not all-or-nothing). ---
    const plausible =
      f.bpm != null && f.bpm >= t.plausibleBpm.min && f.bpm <= t.plausibleBpm.max;
    const spectralOk =
      f.snrDb >= t.detectableSnrDb || f.peakStrength >= t.detectablePeakStrength;
    const repeats = f.periodicity >= 0.12 || f.temporalConsistency >= 35;
    const measurable = plausible && (spectralOk || repeats);

    const indicators = syntheticIndicators(f);

    // Moderate biological evidence is enough — it does not need to be perfect.
    if (measurable && tl.score >= 30 && (evidence >= 38 || f.supportingWindows >= t.supportingWindows)) {
      reasons.push(`Pulse-related component at ${f.bpm!.toFixed(0)} BPM.`);
      reasons.push(
        `In-band SNR ${f.snrDb.toFixed(1)} dB, signal quality ${f.signalQuality.toFixed(0)}/100.`,
      );
      reasons.push(
        `${f.supportingWindows} of ${f.bpmSegments.length} analysis windows support this rate.`,
      );
      reasons.push(`Recording quality ${inputQuality.toFixed(0)}/100.`);
      reasons.push(`Temporal liveness ${tl.score.toFixed(0)}/100 — the camera content changes over time as a live subject does.`);
      if (f.regions.length > 1) {
        reasons.push(
          `Frequency agreement across ${f.regions.length} facial regions: ${(f.frequencyAgreement * 100).toFixed(0)}%.`,
        );
      }
      return {
        label: "LIKELY_REAL",
        evidenceStrength: Math.round(clamp(0.75 * evidence + 0.25 * inputQuality, 35, 100)),
        reasons,
        explanation:
          "Consistent biological evidence was detected and no strong synthetic indicators were observed.",
      };
    }

    // --- Stage 3: synthetic evidence, only under a high-quality recording. ---
    if (inputQuality >= 70 && f.signalQuality >= 40 && evidence < 40 && indicators.length >= 3) {
      return {
        label: "LIKELY_SYNTHETIC",
        evidenceStrength: Math.round(clamp(0.5 * (100 - evidence) + 0.5 * inputQuality, 40, 100)),
        reasons: [
          `Recording quality was high (${inputQuality.toFixed(0)}/100), so analysis was reliable.`,
          ...indicators,
        ],
        explanation:
          "Multiple indicators were observed that are inconsistent with a typical live camera capture.",
      };
    }

    // --- Stage 4: analysable recording, but evidence inconclusive either way. ---
    if (!plausible) {
      reasons.push("No physiologically plausible pulse rate could be isolated.");
      advice.push("Look directly at the camera and keep your face inside the frame.");
    } else if (!spectralOk || f.signalQuality < t.detectableQuality) {
      reasons.push(
        `Pulse-related signal was too weak (SNR ${f.snrDb.toFixed(1)} dB, quality ${f.signalQuality.toFixed(0)}/100).`,
      );
      advice.push("Use even, front-facing lighting and remain naturally still.");
    }
    if (f.supportingWindows < t.supportingWindows && plausible) {
      reasons.push("Analysis windows did not agree on a stable pulse rate.");
    }
    reasons.push(`Recording quality ${inputQuality.toFixed(0)}/100; biological evidence ${evidence.toFixed(0)}/100.`);

    return {
      label: "INSUFFICIENT_EVIDENCE",
      evidenceStrength: Math.round(evidence),
      reasons,
      explanation:
        "The recording did not provide enough reliable evidence for a confident assessment. This does not indicate a synthetic feed.",
      advice,
    };
  }
}

/** @deprecated retained for compatibility; use BiologicalEvidenceEngine. */
export const RuleBasedLivenessClassifier = BiologicalEvidenceEngine;

export const defaultClassifier: LivenessEngine = new BiologicalEvidenceEngine();
export const defaultEngine = defaultClassifier;
