import type {
  ActiveLiveness,
  FrameSample,
  LivenessFeatures,
  RegionAnalysis,
  RegionName,
} from "@/types/biometrics";

import {
  bandpass,
  clamp,
  dominantFrequency,
  detrend,
  maxLaggedCorrelation,
  median,
  resampleUniform,
  robustConsensus,
  welchPsd,
  zscore,
  HR_MAX_HZ,
  HR_MIN_HZ,
} from "./signalProcessing";
import { pos } from "./pos";
import { chrom } from "./chrom";
import { computeLighting, computeSignalQuality } from "./quality";
import { computeMotion } from "./motion";
import { computeTemporalLiveness } from "./temporal";
import { periodicityScore } from "./periodicity";
import { RPPG_CONFIG } from "./config";

export const REGIONS: RegionName[] = ["forehead", "leftCheek", "rightCheek"];

export function estimateFps(frames: FrameSample[]): number {
  if (frames.length < 2) return 0;
  const span = (frames[frames.length - 1].t - frames[0].t) / 1000;
  return span > 0 ? (frames.length - 1) / span : 0;
}

interface Extraction {
  wave: Float32Array;
  method: "POS" | "CHROM";
}

function prepare(wave: Float32Array, fps: number): Float32Array {
  const win = Math.max(3, Math.round(fps * 1.5)) * 4;
  const filtered = bandpass(detrend(wave, win), fps, HR_MIN_HZ, HR_MAX_HZ);
  return zscore(filtered);
}

/**
 * Extract a band-passed pulse waveform for one facial region.
 * Both POS and CHROM are computed; the variant with the stronger in-band peak
 * is kept, because either can win depending on skin tone and illumination.
 */
export function extractRegion(
  frames: FrameSample[],
  region: RegionName,
  fps: number,
): Extraction | null {
  const t: number[] = [];
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (const f of frames) {
    const s = f.regions[region];
    if (!s || s.valid < RPPG_CONFIG.skin.minValidFraction) continue;
    t.push(s.t);
    r.push(s.r);
    g.push(s.g);
    b.push(s.b);
  }
  if (t.length < fps * 4) return null;
  const ru = resampleUniform(t, r, fps);
  const gu = resampleUniform(t, g, fps);
  const bu = resampleUniform(t, b, fps);
  if (ru.length < fps * 4) return null;

  const candidates: Extraction[] = [
    { wave: prepare(pos(ru, gu, bu, fps), fps), method: "POS" },
    { wave: prepare(chrom(ru, gu, bu, fps), fps), method: "CHROM" },
  ].filter((c) => c.wave.length > 0 && isFinite(c.wave[0] ?? NaN)) as Extraction[];
  if (candidates.length === 0) return null;

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const p = dominantFrequency(welchPsd(c.wave, fps));
    const score = p ? p.snrDb + p.peakStrength * 5 : -Infinity;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** Backwards-compatible helper returning only the chosen waveform. */
export function regionWaveform(
  frames: FrameSample[],
  region: RegionName,
  fps: number,
): Float32Array {
  return extractRegion(frames, region, fps)?.wave ?? new Float32Array(0);
}

function analyseRegion(
  region: RegionName,
  ex: Extraction,
  fps: number,
): RegionAnalysis {
  const spec = welchPsd(ex.wave, fps);
  const peak = dominantFrequency(spec);
  return {
    region,
    bpm: peak ? peak.bpm : null,
    snr: peak ? peak.snrDb : -Infinity,
    peakStrength: peak ? peak.peakStrength : 0,
    periodicity: periodicityScore(ex.wave, fps, peak ? peak.bpm : null),
    method: ex.method,
    waveform: ex.wave,
    spectrum: spec,
  };
}

/** Agreement between a set of BPM estimates, 0-1. Tolerant of natural variation. */
export function bpmAgreement(
  values: (number | null)[],
  toleranceBpm: number = RPPG_CONFIG.agreementToleranceBpm,
): number {
  const v = values.filter((x): x is number => x != null && isFinite(x));
  if (v.length < 2) return 0;
  let acc = 0;
  let pairs = 0;
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      const diff = Math.abs(v[i] - v[j]);
      acc += clamp(1 - diff / toleranceBpm, 0, 1);
      pairs++;
    }
  }
  return pairs ? acc / pairs : 0;
}

/** BPM estimated in overlapping windows across the fused waveform. */
export function windowedBpms(
  fused: Float32Array,
  fps: number,
): (number | null)[] {
  const len = fused.length;
  const winLen = Math.round(RPPG_CONFIG.window.lengthSec * fps);
  const stride = Math.max(1, Math.round(RPPG_CONFIG.window.strideSec * fps));
  const out: (number | null)[] = [];
  if (len < winLen) {
    const p = dominantFrequency(welchPsd(fused, fps, len));
    return [p ? p.bpm : null];
  }
  for (let start = 0; start + winLen <= len; start += stride) {
    const seg = new Float32Array(fused.subarray(start, start + winLen));
    const p = dominantFrequency(welchPsd(seg, fps, seg.length));
    out.push(p ? p.bpm : null);
  }
  return out;
}

export function analyzeFrames(
  frames: FrameSample[],
  activeLiveness: ActiveLiveness = { verified: false, challenges: [], reason: "Active liveness was not evaluated." },
): LivenessFeatures | null {
  const fps = estimateFps(frames);
  if (frames.length < 45 || fps < 6) return null;

  const durationSec = (frames[frames.length - 1].t - frames[0].t) / 1000;

  const regions: RegionAnalysis[] = [];
  for (const name of REGIONS) {
    const ex = extractRegion(frames, name, fps);
    if (ex && ex.wave.length >= fps * 4) regions.push(analyseRegion(name, ex, fps));
  }
  if (regions.length === 0) return null;

  // Fused waveform: mean of available region waveforms (already z-scored).
  const len = Math.min(...regions.map((r) => r.waveform.length));
  const fused = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (const r of regions) s += r.waveform[i];
    fused[i] = s / regions.length;
  }
  const fusedSpec = welchPsd(fused, fps);
  const fusedPeak = dominantFrequency(fusedSpec);

  // Spatial consistency: frequency agreement dominates; waveform correlation
  // is a bonus, because real regions need not produce identical waveforms.
  let corrAcc = 0;
  let pairs = 0;
  const maxLag = Math.round(fps * 0.35);
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = new Float32Array(regions[i].waveform.subarray(0, len));
      const b = new Float32Array(regions[j].waveform.subarray(0, len));
      corrAcc += maxLaggedCorrelation(a, b, maxLag);
      pairs++;
    }
  }
  const corr = pairs ? corrAcc / pairs : 0;
  const frequencyAgreement = bpmAgreement(regions.map((r) => r.bpm));
  const spatialConsistency =
    regions.length < 2
      ? clamp(corr * 60)
      : clamp((0.7 * frequencyAgreement + 0.3 * corr) * 100);

  // Temporal consistency across overlapping windows.
  const windowBpms = windowedBpms(fused, fps);
  const temporalConsistency = clamp(bpmAgreement(windowBpms) * 100);

  // Robust consensus pulse: window estimates + per-region estimates.
  const consensus = robustConsensus(
    [...windowBpms, ...regions.map((r) => r.bpm), fusedPeak ? fusedPeak.bpm : null],
    RPPG_CONFIG.agreementToleranceBpm,
  );
  const supportingWindows = windowBpms.filter(
    (b) => b != null && consensus != null && Math.abs(b - consensus) <= 12,
  ).length;

  const snrDb = fusedPeak ? fusedPeak.snrDb : -Infinity;
  const peakStrength = fusedPeak ? fusedPeak.peakStrength : 0;
  const periodicity = Math.max(
    periodicityScore(fused, fps, consensus),
    median(regions.map((r) => r.periodicity)),
  );
  const signalQuality = computeSignalQuality(
    isFinite(snrDb) ? snrDb : -10,
    peakStrength,
    Math.max(temporalConsistency / 100, periodicity),
  );

  const motion = computeMotion(frames);
  const lighting = computeLighting(
    frames.map((f) => f.brightness),
    frames.map((f) => f.overexposed),
    frames.map((f) => f.underexposed),
  );

  const minBpm = HR_MIN_HZ * 60;
  const maxBpm = HR_MAX_HZ * 60;
  const bpm =
    consensus != null && consensus >= minBpm && consensus <= maxBpm ? consensus : null;

  const validPixelRatio =
    frames.reduce((s, f) => s + f.validRatio, 0) / Math.max(1, frames.length);

  return {
    activeLiveness,
    temporalLiveness: computeTemporalLiveness(frames),

    frames: frames.length,
    durationSec,
    fps,
    bpm,
    snrDb: isFinite(snrDb) ? snrDb : -20,
    peakStrength,
    periodicity,
    signalQuality,
    spatialConsistency,
    temporalConsistency,
    frequencyAgreement,
    motionStability: motion.stability,
    validPixelRatio,
    lighting,
    regions,
    bpmSegments: windowBpms,
    supportingWindows,
  };
}
