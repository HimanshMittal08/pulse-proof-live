/**
 * Tunable parameters for the PulseProof biological-evidence engine.
 * Every value here is a configuration choice, never a measurement.
 */
export const RPPG_CONFIG = {
  /** Physiological band used for filtering and peak search. */
  band: { minHz: 0.7, maxHz: 3.5 },

  acquisition: {
    /** Face + lighting calibration before samples count towards analysis. */
    calibrationSec: 2,
    /** Earliest point at which a full assessment may be produced. */
    minSec: 12,
    /** Hard stop for acquisition. */
    maxSec: 15,
    /** Face must be missing this long before the buffer is discarded. */
    faceLossResetSec: 1.5,
    /** Minimum face width as a fraction of the frame. */
    minFaceWidth: 0.12,
    maxFaceWidth: 0.92,
  },

  /** Active-liveness challenge tolerances (deliberately forgiving). */
  challenge: {
    /** frames of stable face used to establish the per-user baseline */
    baselineFrames: 10,
    /** relative yaw change (degrees) accepted as a genuine head turn */
    yawDeltaDeg: 6,
    /** eye opening must drop to this fraction of baseline to count as closed */
    blinkCloseRatio: 0.72,
    /** and recover to this fraction to complete the blink */
    blinkOpenRatio: 0.82,
    /** mouth-aspect increase accepted as an open mouth */
    mouthOpenDelta: 0.07,
    /** per-challenge time budget */
    timeoutSec: 10,
    /** total attempts allowed (one retry with a new, clearer instruction) */
    maxAttempts: 2,
  },

  /** Overlapping temporal analysis windows. */
  window: { lengthSec: 6, strideSec: 3 },


  /** Skin-pixel acceptance (0-255 channels). */
  skin: {
    minLuma: 40,
    maxLuma: 235,
    /** R must exceed B by this fraction of R for typical skin. */
    minRedOverBlue: 1.02,
    minRedOverGreen: 1.0,
    maxRedOverGreen: 2.0,
    /** ROI is unusable below this fraction of accepted pixels. */
    minValidFraction: 0.25,
  },

  /** Weighted evidence combination (starting values, not constants of nature). */
  weights: {
    spectral: 0.25,
    periodicity: 0.2,
    temporal: 0.2,
    spatial: 0.15,
    motion: 0.1,
    lighting: 0.1,
  },

  /** BPM difference (in BPM) at which agreement decays to zero. */
  agreementToleranceBpm: 14,

  thresholds: {
    plausibleBpm: { min: 40, max: 200 },
    /** Signal is treated as detectable at or above these. */
    detectableSnrDb: -1.5,
    detectablePeakStrength: 0.2,
    detectableQuality: 28,
    /** Evidence required for LIKELY REAL when a pulse is detectable. */
    evidenceForReal: 45,
    /** Windows that must support the consensus pulse. */
    supportingWindows: 2,
    /**
     * Gates for a LIKELY_DEEPFAKE verdict. All must be met: the recording must
     * be reliable AND multiple positive manipulation indicators must fire.
     */
    synthetic: {
      minInputQuality: 70,
      minSignalQuality: 40,
      maxBiologicalEvidence: 40,
      minIndicators: 3,
      minScore: 45,
    },
  },
} as const;

export type RppgConfig = typeof RPPG_CONFIG;
