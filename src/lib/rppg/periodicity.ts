import { mean } from "./signalProcessing";

/**
 * Normalised autocorrelation of a waveform at the lag implied by a BPM value.
 * Returns 0-1: how clearly the signal repeats at the candidate pulse period.
 */
export function periodicityScore(
  wave: Float32Array,
  fps: number,
  bpm: number | null,
): number {
  const n = wave.length;
  if (!bpm || n < fps * 3 || fps <= 0) return 0;
  const lag = Math.round((60 / bpm) * fps);
  if (lag < 2 || lag * 3 > n) return 0;

  const m = mean(wave);
  let denom = 0;
  for (let i = 0; i < n; i++) denom += (wave[i] - m) ** 2;
  if (denom <= 0) return 0;

  // Average correlation at the first three multiples of the period.
  let acc = 0;
  let used = 0;
  for (let k = 1; k <= 3; k++) {
    const l = lag * k;
    if (l >= n) break;
    let num = 0;
    for (let i = 0; i + l < n; i++) num += (wave[i] - m) * (wave[i + l] - m);
    acc += num / denom;
    used++;
  }
  if (!used) return 0;
  return Math.max(0, Math.min(1, acc / used));
}
