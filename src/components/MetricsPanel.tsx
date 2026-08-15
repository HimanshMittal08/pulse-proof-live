import type { LivenessFeatures } from "@/types/biometrics";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <span className="label-mono">{label}</span>
      <p className="mt-1 font-mono text-2xl text-primary text-glow">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MetricsPanel({ features }: { features: LivenessFeatures | null }) {
  if (!features) return null;
  const reliable = features.signalQuality >= 45 && features.bpm != null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      <Metric
        label="Estimated Pulse"
        value={reliable ? `${features.bpm!.toFixed(0)} BPM` : "Not reliable"}
        hint={reliable ? `${features.snrDb.toFixed(1)} dB in-band SNR` : "Signal quality too low"}
      />
      <Metric label="Signal Quality" value={`${features.signalQuality.toFixed(0)}%`} />
      <Metric label="Spatial Consistency" value={`${features.spatialConsistency.toFixed(0)}%`} />
      <Metric label="Temporal Consistency" value={`${features.temporalConsistency.toFixed(0)}%`} />
      <Metric label="Face Stability" value={`${features.motionStability.toFixed(0)}%`} />
      <Metric
        label="Lighting"
        value={features.lighting.label}
        hint={`Mean luminance ${features.lighting.brightness.toFixed(0)}/255`}
      />
      <Metric
        label="Acquisition"
        value={`${features.durationSec.toFixed(1)}s`}
        hint={`${features.frames} frames @ ${features.fps.toFixed(1)} fps`}
      />
      <Metric
        label="Spectral Peak"
        value={`${(features.peakStrength * 100).toFixed(0)}%`}
        hint="In-band power at pulse peak"
      />
      <Metric
        label="Regions Analysed"
        value={`${features.regions.length}/3`}
        hint={features.regions.map((r) => (r.bpm ? `${r.bpm.toFixed(0)}` : "—")).join(" / ") + " BPM"}
      />
    </div>
  );
}
