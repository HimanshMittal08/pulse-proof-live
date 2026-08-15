export type RegionName = "forehead" | "leftCheek" | "rightCheek";

export interface RgbSample {
  t: number; // ms timestamp
  r: number;
  g: number;
  b: number;
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
}

export type LightingLabel = "GOOD" | "FAIR" | "POOR";

export interface LightingQuality {
  label: LightingLabel;
  score: number; // 0-100
  brightness: number;
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
  signalQuality: number; // 0-100
  spatialConsistency: number; // 0-100
  temporalConsistency: number; // 0-100
  motionStability: number; // 0-100
  lighting: LightingQuality;
  regions: RegionAnalysis[];
  bpmSegments: (number | null)[];
}

export type VerdictLabel = "LIKELY_REAL" | "LIKELY_SYNTHETIC" | "INSUFFICIENT_EVIDENCE";

export interface Verdict {
  label: VerdictLabel;
  evidenceStrength: number; // 0-100
  reasons: string[];
  explanation: string;
}

export interface BiologicalLivenessClassifier {
  readonly name: string;
  classify(features: LivenessFeatures): Verdict;
}
