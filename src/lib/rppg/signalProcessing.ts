/**
 * Deterministic DSP helpers for rPPG processing.
 * Pure functions only — no randomness, no UI concerns.
 */

import { RPPG_CONFIG } from "./config";

export const HR_MIN_HZ = RPPG_CONFIG.band.minHz; // 42 BPM
export const HR_MAX_HZ = RPPG_CONFIG.band.maxHz; // 210 BPM

/** Median of a numeric list (0 when empty). */
export function median(x: number[]): number {
  const v = x.filter((n) => isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Robust consensus of BPM estimates: median, then mean of the values within
 * `tolerance` BPM of it (obvious outliers are discarded, not failed).
 */
export function robustConsensus(values: (number | null)[], tolerance = 12): number | null {
  const v = values.filter((x): x is number => x != null && isFinite(x));
  if (v.length === 0) return null;
  const med = median(v);
  const inliers = v.filter((x) => Math.abs(x - med) <= tolerance);
  const use = inliers.length ? inliers : [med];
  return use.reduce((a, b) => a + b, 0) / use.length;
}


export function mean(x: ArrayLike<number>): number {
  if (x.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return s / x.length;
}

export function std(x: ArrayLike<number>): number {
  if (x.length < 2) return 0;
  const m = mean(x);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] - m) ** 2;
  return Math.sqrt(s / (x.length - 1));
}

/** Linear resampling of an irregularly-sampled series onto a uniform grid. */
export function resampleUniform(
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  fps: number,
): Float32Array {
  const n = times.length;
  if (n < 2) return new Float32Array(0);
  const t0 = times[0];
  const t1 = times[n - 1];
  const count = Math.max(0, Math.floor(((t1 - t0) / 1000) * fps) + 1);
  const out = new Float32Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const t = t0 + (i / fps) * 1000;
    while (j < n - 2 && times[j + 1] < t) j++;
    const ta = times[j];
    const tb = times[j + 1];
    const w = tb === ta ? 0 : (t - ta) / (tb - ta);
    out[i] = values[j] + (values[j + 1] - values[j]) * Math.min(1, Math.max(0, w));
  }
  return out;
}

/** Remove slow drift using a centred moving-average baseline. */
export function detrend(x: Float32Array, windowSize: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  if (n === 0) return out;
  const w = Math.max(3, Math.min(n, Math.floor(windowSize) | 1));
  const half = Math.floor(w / 2);
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + x[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    const baseline = (prefix[b] - prefix[a]) / (b - a);
    out[i] = x[i] - baseline;
  }
  return out;
}

export function zscore(x: Float32Array): Float32Array {
  const m = mean(x);
  const s = std(x) || 1;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] - m) / s;
  return out;
}

export function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** In-place iterative radix-2 FFT. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export interface Spectrum {
  freqs: Float32Array;
  power: Float32Array;
}

/** Single-sided power spectrum with Hann window and zero padding. */
export function powerSpectrum(x: Float32Array, fs: number, padFactor = 4): Spectrum {
  const n = x.length;
  if (n < 8) return { freqs: new Float32Array(0), power: new Float32Array(0) };
  const w = hann(n);
  const size = nextPow2(n * padFactor);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const m = mean(x);
  for (let i = 0; i < n; i++) re[i] = (x[i] - m) * w[i];
  fft(re, im);
  const half = size / 2;
  const freqs = new Float32Array(half);
  const power = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    freqs[i] = (i * fs) / size;
    power[i] = (re[i] * re[i] + im[i] * im[i]) / n;
  }
  return { freqs, power };
}

/** Welch PSD: averaged periodograms over 50%-overlapping segments. */
export function welchPsd(x: Float32Array, fs: number, segLen?: number): Spectrum {
  const n = x.length;
  const L = Math.min(n, segLen ?? Math.max(64, Math.floor(n / 2)));
  if (n < 16) return powerSpectrum(x, fs);
  const step = Math.max(1, Math.floor(L / 2));
  let acc: Float32Array | null = null;
  let freqs = new Float32Array(0);
  let count = 0;
  for (let start = 0; start + L <= n; start += step) {
    const seg = x.subarray(start, start + L);
    const sp = powerSpectrum(new Float32Array(seg), fs);
    if (!acc) {
      acc = new Float32Array(sp.power.length);
      freqs = new Float32Array(sp.freqs);
    }
    for (let i = 0; i < acc.length; i++) acc[i] += sp.power[i];
    count++;
  }
  if (!acc || count === 0) return powerSpectrum(x, fs);
  for (let i = 0; i < acc.length; i++) acc[i] /= count;
  return { freqs, power: acc };
}

/** Zero-phase FFT band-pass filter with cosine-tapered edges. */
export function bandpass(x: Float32Array, fs: number, lo: number, hi: number): Float32Array {
  const n = x.length;
  if (n < 8) return new Float32Array(x);
  const size = nextPow2(n);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const m = mean(x);
  for (let i = 0; i < n; i++) re[i] = x[i] - m;
  fft(re, im);
  const taper = 0.1; // Hz transition band
  for (let i = 0; i <= size / 2; i++) {
    const f = (i * fs) / size;
    let gain: number;
    if (f < lo - taper || f > hi + taper) gain = 0;
    else if (f < lo) gain = 0.5 * (1 - Math.cos((Math.PI * (f - (lo - taper))) / taper));
    else if (f > hi) gain = 0.5 * (1 + Math.cos((Math.PI * (f - hi)) / taper));
    else gain = 1;
    re[i] *= gain;
    im[i] *= gain;
    const j = (size - i) % size;
    re[j] *= gain;
    im[j] *= gain;
  }
  // inverse FFT via conjugation
  for (let i = 0; i < size; i++) im[i] = -im[i];
  fft(re, im);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = re[i] / size;
  return out;
}

export interface PeakInfo {
  freq: number;
  bpm: number;
  power: number;
  /** peak power / total in-band power (0-1) */
  peakStrength: number;
  /** 10*log10(signal band power / remaining in-band power) */
  snrDb: number;
}

export function dominantFrequency(
  spec: Spectrum,
  loHz = HR_MIN_HZ,
  hiHz = HR_MAX_HZ,
): PeakInfo | null {
  const { freqs, power } = spec;
  if (freqs.length === 0) return null;
  let bestI = -1;
  let best = -Infinity;
  let total = 0;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] < loHz || freqs[i] > hiHz) continue;
    total += power[i];
    if (power[i] > best) {
      best = power[i];
      bestI = i;
    }
  }
  if (bestI < 0 || total <= 0) return null;
  const f0 = freqs[bestI];
  // signal band = peak ± 0.15 Hz plus first harmonic ± 0.15 Hz
  let signal = 0;
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] < loHz || freqs[i] > hiHz) continue;
    const nearF0 = Math.abs(freqs[i] - f0) <= 0.15;
    const nearH1 = Math.abs(freqs[i] - 2 * f0) <= 0.15;
    if (nearF0 || nearH1) signal += power[i];
  }
  const noise = Math.max(total - signal, 1e-12);
  return {
    freq: f0,
    bpm: f0 * 60,
    power: best,
    peakStrength: signal / total,
    snrDb: 10 * Math.log10(signal / noise),
  };
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = mean(Array.prototype.slice.call(a, 0, n));
  const mb = mean(Array.prototype.slice.call(b, 0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

/** Maximum absolute correlation allowing a small lag (in samples). */
export function maxLaggedCorrelation(
  a: Float32Array,
  b: Float32Array,
  maxLag: number,
): number {
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const s = lag >= 0 ? a.subarray(lag) : a.subarray(0, a.length + lag);
    const t = lag >= 0 ? b.subarray(0, b.length - lag) : b.subarray(-lag);
    const c = Math.abs(pearson(s, t));
    if (c > best) best = c;
  }
  return best;
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, v));
}
