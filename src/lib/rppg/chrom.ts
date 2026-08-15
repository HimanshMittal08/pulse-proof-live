import { bandpass, mean, std, HR_MIN_HZ, HR_MAX_HZ } from "./signalProcessing";

/**
 * CHROM (de Haan & Jeanne, 2013) — chrominance-based rPPG extraction,
 * used as a cross-check / fallback against POS.
 */
export function chrom(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  fps: number,
): Float32Array {
  const n = Math.min(r.length, g.length, b.length);
  if (n < 8) return new Float32Array(n);
  const mr = mean(r) || 1e-9;
  const mg = mean(g) || 1e-9;
  const mb = mean(b) || 1e-9;

  const x = new Float32Array(n);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const rn = r[i] / mr;
    const gn = g[i] / mg;
    const bn = b[i] / mb;
    x[i] = 3 * rn - 2 * gn;
    y[i] = 1.5 * rn + gn - 1.5 * bn;
  }
  const xf = bandpass(x, fps, HR_MIN_HZ, HR_MAX_HZ);
  const yf = bandpass(y, fps, HR_MIN_HZ, HR_MAX_HZ);
  const sy = std(yf);
  const alpha = sy === 0 ? 0 : std(xf) / sy;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = xf[i] - alpha * yf[i];
  return out;
}

/** Green-channel baseline method (last-resort fallback). */
export function greenBaseline(g: Float32Array, fps: number): Float32Array {
  return bandpass(g, fps, HR_MIN_HZ, HR_MAX_HZ);
}
