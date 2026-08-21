export type RegionName = "forehead" | "leftCheek" | "rightCheek";

export interface RgbSample {
  t: number; // ms timestamp
  r: number;
  g: number;
  b: number;
  /** fraction of ROI pixels accepted as skin (0-1) */
  valid: number;
}

export interface FrameSample {
  t: number;
  regions: Record<RegionName, RgbSample | null>;
  faceX: number;
  faceY: number;
  faceWidth: number;
  faceHeight: number;
  brightness: number;
  overexposed: number; // fraction of clipped-bright pixels
  underexposed: number;
  /** mean fraction of accepted skin pixels across sampled ROIs (0-1) */
  validRatio: number;
}

export type LightingLabel = "GOOD" | "FAIR" | "POOR";

export interface LightingQuality {
  label: LightingLabel;
  score: number; // 0-100
  brightness: number;
  variance: number;
  reason?: string;
}

export interface MotionQuality {
  stability: number; // 0-100
  displacement: number; // normalised per-frame movement
  scaleChange: number;
  excessive: boolean;
}

export interface RegionAnalysis {
  region: RegionName;
  bpm: number | null;
  snr: number; // dB
  peakStrength: number; // 0-1 fraction of in-band power at peak
  periodicity: number; // 0-1
  method: "POS" | "CHROM";
  waveform: Float32Array;
  spectrum: { freqs: Float32Array; power: Float32Array };
}

export interface LivenessFeatures {
  frames: number;
  durationSec: number;
  fps: number;
  bpm: number | null;
  snrDb: number;
  peakStrength: number;
  periodicity: number; // 0-1 autocorrelation strength at the pulse period
  signalQuality: number; // 0-100
  spatialConsistency: number; // 0-100
  temporalConsistency: number; // 0-100
  frequencyAgreement: number; // 0-1 across regions
  motionStability: number; // 0-100
  validPixelRatio: number; // 0-1
  lighting: LightingQuality;
  regions: RegionAnalysis[];
  /** BPM estimated in each overlapping temporal window */
  bpmSegments: (number | null)[];
  /** windows whose BPM supports the consensus estimate */
  supportingWindows: number;
  /** measured evidence that the camera content actually changes over time */
  temporalLiveness: TemporalLiveness;
  /** outcome of the active-liveness challenge stage */
  activeLiveness: ActiveLiveness;

}

export interface TemporalLiveness {
  /** 0-100 combined temporal-change score */
  score: number;
  /** std of face position over the recording, normalised by face width */
  positionVariation: number;
  /** std of face width over the recording, normalised by face width */
  scaleVariation: number;
  /** median frame-to-frame fractional ROI colour change */
  roiChange: number;
  /** std of ROI brightness over the recording, normalised */
  brightnessVariation: number;
  /** true when the input looks like a static image rather than a live subject */
  isStatic: boolean;
}

/** Size-normalised head pose and facial-articulation measures. */
export interface FaceGeometry {
  /** degrees, relative facial geometry (not screen position) */
  yaw: number;
  pitch: number;
  /** eye opening normalised by eye width */
  eyeAspect: number;
  /** mouth opening normalised by mouth width */
  mouthAspect: number;
}

export type ChallengeType = "TURN_LEFT" | "TURN_RIGHT" | "BLINK" | "OPEN_MOUTH";

export interface ChallengeResult {
  type: ChallengeType;
  passed: boolean;
  /** measured magnitude of the observed facial action */
  magnitude: number;
  detail: string;
}

/** Outcome of the active-liveness challenge stage. */
export interface ActiveLiveness {
  verified: boolean;
  challenges: ChallengeResult[];
  reason?: string;
}



export type VerdictLabel = "LIKELY_REAL" | "LIKELY_DEEPFAKE" | "INSUFFICIENT_EVIDENCE";

export interface Verdict {
  label: VerdictLabel;
  evidenceStrength: number; // 0-100
  reasons: string[];
  explanation: string;
  /** actionable guidance shown when evidence is insufficient */
  advice?: string[];
}

/**
 * Pluggable liveness engine. The current implementation is a biological
 * evidence engine driven by measured rPPG features; a trained model can be
 * substituted behind this same interface without touching the UI.
 */
export interface LivenessEngine {
  readonly name: string;
  classify(features: LivenessFeatures): Verdict;
}

/** @deprecated use LivenessEngine */
export type BiologicalLivenessClassifier = LivenessEngine;
