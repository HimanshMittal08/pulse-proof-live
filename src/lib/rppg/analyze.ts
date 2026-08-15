import type {
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
  resampleUniform,
  welchPsd,
  zscore,
  HR_MAX_HZ,
  HR_MIN_HZ,
} from "./signalProcessing";
import { pos } from "./pos";
import { chrom } from "./chrom";
import { computeLighting, computeSignalQuality } from "./quality";
import { computeMotion } from "./motion";

export const REGIONS: RegionName[] = ["forehead", "leftCheek", "rightCheek"];

export function estimateFps(frames: FrameSample[]): number {
  if (frames.length < 2) return 0;
  const span = (frames[frames.length - 1].t - frames[0].t) / 1000;
  return span > 0 ? (frames.length - 1) / span : 0;
}

/** Extract a band-passed pulse waveform for one facial region. */
export function regionWaveform(
  frames: FrameSample[],
  region: RegionName,
  fps: number,
): Float32Array {
  const t: number[] = [];
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (const f of frames) {
    const s = f.regions[region];
    if (!s) continue;
    t.push(s.t);
    r.push(s.r);
    g.push(s.g);
    b.push(s.b);
  }
  if (t.length < fps * 3) return new Float32Array(0);
  const ru = resampleUniform(t, r, fps);
  const gu = resampleUniform(t, g, fps);
  const bu = resampleUniform(t, b, fps);
  const win = Math.max(3, Math.round(fps * 1.5));
  // POS operates on the raw (positive) channels: it normalises internally.
  const primary = pos(ru, gu, bu, fps);
  const filtered = bandpass(detrend(primary, win * 4), fps, HR_MIN_HZ, HR_MAX_HZ);
  if (!isFinite(filtered[0] ?? NaN)) return chrom(ru, gu, bu, fps);
  return zscore(filtered);
}

function analyseRegion(
  region: RegionName,
  wave: Float32Array,
  fps: number,
): RegionAnalysis {
  const spec = welchPsd(wave, fps);
  const peak = dominantFrequency(spec);
  return {
    region,
    bpm: peak ? peak.bpm : null,
    snr: peak ? peak.snrDb : -Infinity,
    peakStrength: peak ? peak.peakStrength : 0,
    waveform: wave,
    spectrum: spec,
  };
}

/** Agreement between a set of BPM estimates, 0-1. */
export function bpmAgreement(values: (number | null)[]): number {
  const v = values.filter((x): x is number => x != null && isFinite(x));
  if (v.length < 2) return 0;
  let acc = 0;
  let pairs = 0;
  for (let i = 0; i < v.length; i++) {
    for (let j = i + 1; j < v.length; j++) {
      const diff = Math.abs(v[i] - v[j]);
      // 0 BPM difference -> 1, 12 BPM or more -> 0
      acc += clamp(1 - diff / 12, 0, 1);
      pairs++;
    }
  }
  return pairs ? acc / pairs : 0;
}

export function analyzeFrames(frames: FrameSample[]): LivenessFeatures | null {
  const fps = estimateFps(frames);
  if (frames.length < 60 || fps < 8) return null;
  const durationSec = (frames[frames.length - 1].t - frames[0].t) / 1000;

  const regions: RegionAnalysis[] = [];
  for (const name of REGIONS) {
    const wave = regionWaveform(frames, name, fps);
    if (wave.length >= fps * 3) regions.push(analyseRegion(name, wave, fps));
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

  // Spatial consistency: waveform correlation + BPM agreement across regions.
  let corrAcc = 0;
  let pairs = 0;
  const maxLag = Math.round(fps * 0.25);
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i].waveform.subarray(0, len);
      const b = regions[j].waveform.subarray(0, len);
      corrAcc += maxLaggedCorrelation(new Float32Array(a), new Float32Array(b), maxLag);
      pairs++;
    }
  }
  const corr = pairs ? corrAcc / pairs : 0;
  const spatialBpm = bpmAgreement(regions.map((r) => r.bpm));
  const spatialConsistency = clamp((0.6 * corr + 0.4 * spatialBpm) * 100);

  // Temporal consistency: independent BPM estimates over 4 segments.
  const segCount = 4;
  const segLen = Math.floor(len / segCount);
  const bpmSegments: (number | null)[] = [];
  for (let s = 0; s < segCount; s++) {
    if (segLen < fps * 2) {
      bpmSegments.push(null);
      continue;
    }
    const seg = new Float32Array(fused.subarray(s * segLen, (s + 1) * segLen));
    const p = dominantFrequency(welchPsd(seg, fps, seg.length));
    bpmSegments.push(p ? p.bpm : null);
  }
  const temporalConsistency = clamp(bpmAgreement(bpmSegments) * 100);

  const snrDb = fusedPeak ? fusedPeak.snrDb : -Infinity;
  const peakStrength = fusedPeak ? fusedPeak.peakStrength : 0;
  const signalQuality = computeSignalQuality(
    isFinite(snrDb) ? snrDb : -10,
    peakStrength,
    temporalConsistency / 100,
  );

  const motion = computeMotion(frames);
  const lighting = computeLighting(
    frames.map((f) => f.brightness),
    frames.map((f) => f.overexposed),
    frames.map((f) => f.underexposed),
  );

  const bpm =
    fusedPeak && fusedPeak.bpm >= HR_MIN_HZ * 60 && fusedPeak.bpm <= HR_MAX_HZ * 60
      ? fusedPeak.bpm
      : null;

  return {
    frames: frames.length,
    durationSec,
    fps,
    bpm,
    snrDb: isFinite(snrDb) ? snrDb : -20,
    peakStrength,
    signalQuality,
    spatialConsistency,
    temporalConsistency,
    motionStability: motion.stability,
    lighting,
    regions,
    bpmSegments,
  };
}
