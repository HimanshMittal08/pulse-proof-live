import { describe, expect, it } from "vitest";
import {
  bandpass,
  dominantFrequency,
  detrend,
  maxLaggedCorrelation,
  pearson,
  powerSpectrum,
  resampleUniform,
  welchPsd,
} from "../signalProcessing";
import { pos } from "../pos";
import { chrom } from "../chrom";
import { computeLighting, computeSignalQuality } from "../quality";
import { computeMotion } from "../motion";
import { biologicalEvidenceScore, RuleBasedLivenessClassifier, syntheticEvidenceScore } from "../scoring";
import { bpmAgreement } from "../analyze";
import type { FrameSample, LivenessFeatures } from "@/types/biometrics";

const FS = 30;

function sine(freq: number, seconds: number, fs = FS, amp = 1, phase = 0): Float32Array {
  const n = Math.round(seconds * fs);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(2 * Math.PI * freq * (i / fs) + phase);
  return out;
}

describe("resampling and detrending", () => {
  it("resamples an irregular series onto a uniform grid", () => {
    const t = [0, 100, 250, 400, 500];
    const v = [0, 1, 2.5, 4, 5];
    const out = resampleUniform(t, v, 10);
    expect(out.length).toBe(6);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[5]).toBeCloseTo(5, 3);
    expect(out[2]).toBeCloseTo(2, 1);
  });

  it("removes a linear trend while preserving oscillation", () => {
    const s = sine(1.2, 8);
    const trended = new Float32Array(s.length);
    for (let i = 0; i < s.length; i++) trended[i] = s[i] + i * 0.05;
    const d = detrend(trended, FS * 2);
    const peak = dominantFrequency(welchPsd(d, FS));
    expect(peak?.freq).toBeCloseTo(1.2, 1);
  });
});

describe("bandpass filtering", () => {
  it("keeps in-band content and rejects out-of-band content", () => {
    const inBand = sine(1.2, 10);
    const outBand = sine(8, 10, FS, 3);
    const mixed = new Float32Array(inBand.length);
    for (let i = 0; i < mixed.length; i++) mixed[i] = inBand[i] + outBand[i];
    const filtered = bandpass(mixed, FS, 0.7, 4);
    const peak = dominantFrequency(welchPsd(filtered, FS), 0.7, 14);
    expect(peak?.freq).toBeCloseTo(1.2, 1);
    // the 8 Hz component should be strongly attenuated
    const spec = powerSpectrum(filtered, FS);
    let p8 = 0;
    for (let i = 0; i < spec.freqs.length; i++) {
      if (Math.abs(spec.freqs[i] - 8) < 0.2) p8 = Math.max(p8, spec.power[i]);
    }
    expect(p8).toBeLessThan((peak?.power ?? 0) * 0.01);
  });
});

describe("spectral estimation and BPM", () => {
  it("recovers BPM from a known frequency", () => {
    const peak = dominantFrequency(welchPsd(sine(1.25, 12), FS));
    expect(peak).not.toBeNull();
    expect(Math.abs(peak!.bpm - 75)).toBeLessThan(1.5);
  });

  it("rejects frequencies outside the physiological band", () => {
    const peak = dominantFrequency(welchPsd(sine(0.2, 20), FS));
    // 0.2 Hz is below 0.7 Hz, so no valid in-band peak should dominate
    expect(peak === null || peak.bpm >= 42).toBe(true);
  });

  it("reports higher peak strength for clean than for noisy signals", () => {
    const clean = sine(1.2, 12);
    const noisy = new Float32Array(clean.length);
    let seed = 42;
    for (let i = 0; i < clean.length; i++) {
      // deterministic LCG pseudo-noise (seeded, reproducible)
      seed = (seed * 1103515245 + 12345) % 2147483648;
      noisy[i] = clean[i] * 0.05 + (seed / 2147483648 - 0.5) * 4;
    }
    const a = dominantFrequency(welchPsd(clean, FS))!;
    const b = dominantFrequency(welchPsd(noisy, FS))!;
    expect(a.peakStrength).toBeGreaterThan(b.peakStrength);
    expect(a.snrDb).toBeGreaterThan(b.snrDb);
  });
});

describe("correlation and consistency", () => {
  it("computes pearson correlation", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
  });

  it("finds high correlation between phase-shifted copies", () => {
    const a = sine(1.2, 10);
    const b = sine(1.2, 10, FS, 1, Math.PI / 5);
    expect(maxLaggedCorrelation(a, b, Math.round(FS * 0.25))).toBeGreaterThan(0.95);
  });

  it("scores BPM agreement between segments", () => {
    expect(bpmAgreement([70, 72, 71, 73])).toBeGreaterThan(0.7);
    expect(bpmAgreement([60, 110, 85, 150])).toBeLessThan(0.3);
    expect(bpmAgreement([null, null])).toBe(0);
  });
});

describe("rPPG extraction", () => {
  it("POS recovers a pulse embedded in synthetic RGB traces", () => {
    const n = FS * 12;
    const r = new Float32Array(n);
    const g = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = Math.sin(2 * Math.PI * 1.2 * (i / FS));
      r[i] = 130 + 0.3 * p;
      g[i] = 110 + 1.0 * p;
      b[i] = 100 + 0.5 * p;
    }
    const sig = pos(r, g, b, FS);
    const peak = dominantFrequency(welchPsd(bandpass(sig, FS, 0.7, 4), FS));
    expect(peak!.bpm).toBeCloseTo(72, -0.4);
  });

  it("CHROM recovers the same pulse frequency", () => {
    const n = FS * 12;
    const r = new Float32Array(n);
    const g = new Float32Array(n);
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = Math.sin(2 * Math.PI * 1.5 * (i / FS));
      r[i] = 140 + 0.4 * p;
      g[i] = 120 + 1.2 * p;
      b[i] = 105 + 0.6 * p;
    }
    const peak = dominantFrequency(welchPsd(chrom(r, g, b, FS), FS));
    expect(peak!.bpm).toBeCloseTo(90, -0.5);
  });
});

describe("quality, motion and scoring", () => {
  it("rates lighting from measured luminance", () => {
    const good = computeLighting(Array(60).fill(140), Array(60).fill(0), Array(60).fill(0));
    const dark = computeLighting(Array(60).fill(25), Array(60).fill(0), Array(60).fill(0.5));
    expect(good.label).toBe("GOOD");
    expect(dark.label).toBe("POOR");
    expect(good.score).toBeGreaterThan(dark.score);
  });

  it("signal quality increases monotonically with SNR", () => {
    expect(computeSignalQuality(8, 0.6, 0.9)).toBeGreaterThan(computeSignalQuality(0, 0.2, 0.3));
    expect(computeSignalQuality(-20, 0, 0)).toBe(0);
  });

  it("measures motion stability from bounding boxes", () => {
    const mk = (i: number, jitter: number): FrameSample => ({
      t: i * 33,
      regions: { forehead: null, leftCheek: null, rightCheek: null },
      faceX: 0.5 + jitter * (i % 2 ? 1 : -1),
      faceY: 0.5,
      faceWidth: 0.3,
      faceHeight: 0.4,
      brightness: 120,
      overexposed: 0,
      underexposed: 0,
      validRatio: 0.8,
    });
    const still = Array.from({ length: 30 }, (_, i) => mk(i, 0.0005));
    const shaky = Array.from({ length: 30 }, (_, i) => mk(i, 0.05));
    expect(computeMotion(still).stability).toBeGreaterThan(90);
    expect(computeMotion(shaky).excessive).toBe(true);
    expect(computeMotion(shaky).stability).toBeLessThan(30);
  });
});

const liveTemporal = {
  score: 70,
  positionVariation: 0.006,
  scaleVariation: 0.004,
  roiChange: 0.002,
  brightnessVariation: 0.008,
  isStatic: false,
};

const baseFeatures: LivenessFeatures = {
  activeLiveness: { verified: true, challenges: [] },
  temporalLiveness: liveTemporal,
  frames: 360,
  durationSec: 12,
  fps: 30,
  bpm: 72,
  snrDb: 6,
  peakStrength: 0.5,
  signalQuality: 78,
  spatialConsistency: 80,
  temporalConsistency: 75,
  motionStability: 88,
  lighting: { label: "GOOD", score: 85, brightness: 140, variance: 5 },
  regions: [],
  periodicity: 0.6,
  frequencyAgreement: 0.85,
  validPixelRatio: 0.8,
  supportingWindows: 3,
  bpmSegments: [71, 72, 73, 72],
};

describe("verdict engine", () => {
  const clf = new RuleBasedLivenessClassifier();

  it("returns LIKELY_REAL for strong, consistent evidence", () => {
    expect(clf.classify(baseFeatures).label).toBe("LIKELY_REAL");
  });

  it("never returns synthetic for poor lighting", () => {
    const v = clf.classify({
      ...baseFeatures,
      lighting: { label: "POOR", score: 20, brightness: 30, variance: 5 },
    });
    expect(v.label).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("returns insufficient evidence when the pulse is weak", () => {
    const v = clf.classify({
      ...baseFeatures,
      bpm: null,
      snrDb: -3,
      peakStrength: 0.1,
      signalQuality: 20,
      spatialConsistency: 15,
      temporalConsistency: 10,
    });
    expect(v.label).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("returns LIKELY_DEEPFAKE under high-quality acquisition with positive synthetic indicators", () => {
    const v = clf.classify({
      ...baseFeatures,
      bpm: null,
      snrDb: 1,
      peakStrength: 0.25,
      signalQuality: 50,
      spatialConsistency: 12,
      temporalConsistency: 10,
      periodicity: 0.05,
      frequencyAgreement: 0.1,
      motionStability: 92,
    });
    expect(v.label).toBe("LIKELY_DEEPFAKE");
  });

  it("evidence score is a deterministic weighted combination", () => {
    const a = biologicalEvidenceScore(baseFeatures);
    const b = biologicalEvidenceScore(baseFeatures);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(biologicalEvidenceScore({ ...baseFeatures, periodicity: 0.05, temporalConsistency: 10 }));
  });
});

describe("temporal liveness gate", () => {
  it("blocks LIKELY_REAL for a static image even with clean-looking signals", () => {
    const v = new RuleBasedLivenessClassifier().classify({
      ...baseFeatures,
      temporalLiveness: {
        score: 4,
        positionVariation: 0.0002,
        scaleVariation: 0.0001,
        roiChange: 0.00005,
        brightnessVariation: 0.0004,
        isStatic: true,
      },
    });
    expect(v.label).toBe("INSUFFICIENT_EVIDENCE");
    expect(v.reasons.join(" ")).toMatch(/static\/non-live/);
  });

  it("still allows LIKELY_REAL for a live subject", () => {
    expect(new RuleBasedLivenessClassifier().classify(baseFeatures).label).toBe("LIKELY_REAL");
  });
});

describe("three-way fusion", () => {
  const clf = new RuleBasedLivenessClassifier();

  it("failed liveness challenge is never a deepfake verdict", () => {
    const v = clf.classify({
      ...baseFeatures,
      activeLiveness: {
        verified: false,
        challenges: [],
        reason: "The requested facial action was not observed.",
      },
      // suspicious-looking signals must not upgrade this to LIKELY_DEEPFAKE
      periodicity: 0.02,
      temporalConsistency: 5,
      spatialConsistency: 5,
      supportingWindows: 0,
    });
    expect(v.label).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("static photo with a failed challenge is insufficient evidence", () => {
    const v = clf.classify({
      ...baseFeatures,
      activeLiveness: { verified: false, challenges: [], reason: "No facial action observed." },
      temporalLiveness: {
        score: 3,
        positionVariation: 0.0001,
        scaleVariation: 0.0001,
        roiChange: 0.00002,
        brightnessVariation: 0.0002,
        isStatic: true,
      },
    });
    expect(v.label).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("verified liveness with low recording quality is insufficient evidence", () => {
    const v = clf.classify({
      ...baseFeatures,
      fps: 6,
      durationSec: 5,
      lighting: { label: "FAIR", score: 40, brightness: 70, variance: 8 },
      motionStability: 40,
      signalQuality: 20,
    });
    expect(v.label).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("verified liveness with mixed/ambiguous evidence stays insufficient", () => {
    const v = clf.classify({
      ...baseFeatures,
      bpm: null,
      snrDb: 0,
      peakStrength: 0.22,
      periodicity: 0.3,
      temporalConsistency: 45,
      spatialConsistency: 40,
      supportingWindows: 1,
    });
    expect(v.label).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("verified liveness plus multiple positive synthetic indicators is a deepfake verdict", () => {
    const v = clf.classify({
      ...baseFeatures,
      bpm: null,
      snrDb: 1,
      peakStrength: 0.28,
      signalQuality: 55,
      periodicity: 0.04,
      temporalConsistency: 8,
      spatialConsistency: 10,
      frequencyAgreement: 0.05,
      supportingWindows: 0,
      motionStability: 92,
      temporalLiveness: { ...liveTemporal, roiChange: 0.0001, positionVariation: 0.01 },
    });
    expect(v.label).toBe("LIKELY_DEEPFAKE");
    expect(v.explanation).toMatch(/synthetic-media indicators/i);
  });

  it("synthetic evidence is deterministic", () => {
    expect(syntheticEvidenceScore(baseFeatures).score).toBe(
      syntheticEvidenceScore(baseFeatures).score,
    );
    expect(syntheticEvidenceScore(baseFeatures).indicators.length).toBe(0);
  });
});
