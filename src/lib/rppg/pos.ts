import { mean, std } from "./signalProcessing";

/**
 * POS — Plane-Orthogonal-to-Skin (Wang et al., 2017).
 * Sliding-window projection of normalised RGB onto a plane orthogonal
 * to the skin-tone direction, with overlap-add reconstruction.
 */
export function pos(
  r: Float32Array,
  g: Float32Array,
  b: Float32Array,
  fps: number,
): Float32Array {
  const n = Math.min(r.length, g.length, b.length);
  const out = new Float32Array(n);
  if (n < 8) return out;
  const l = Math.max(8, Math.round(1.6 * fps));
  if (n < l) return out;

  const s1 = new Float32Array(l);
  const s2 = new Float32Array(l);

  for (let start = 0; start + l <= n; start++) {
    const mr = mean(r.subarray(start, start + l)) || 1e-9;
    const mg = mean(g.subarray(start, start + l)) || 1e-9;
    const mb = mean(b.subarray(start, start + l)) || 1e-9;
    for (let i = 0; i < l; i++) {
      const rn = r[start + i] / mr;
      const gn = g[start + i] / mg;
      const bn = b[start + i] / mb;
      s1[i] = gn - bn;
      s2[i] = gn + bn - 2 * rn;
    }
    const sd2 = std(s2);
    const alpha = sd2 === 0 ? 0 : std(s1) / sd2;
    const h = new Float32Array(l);
    for (let i = 0; i < l; i++) h[i] = s1[i] + alpha * s2[i];
    const mh = mean(h);
    for (let i = 0; i < l; i++) out[start + i] += h[i] - mh;
  }
  return out;
}
