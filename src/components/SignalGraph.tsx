import { useEffect, useRef } from "react";

interface Props {
  data: number[];
  quality: number | null;
  bpm: number | null;
  height?: number;
}

/** Renders the actual fused rPPG waveform samples — no synthetic data. */
export function SignalGraph({ data, quality, bpm, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(120, 220, 255, 0.10)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (data.length < 2) return;
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "rgba(80, 240, 255, 0.25)");
    grad.addColorStop(1, "rgba(80, 240, 255, 1)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(80, 230, 255, 0.7)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h * 0.82) - h * 0.09;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [data]);

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="label-mono">rPPG Signal</span>
        <div className="flex gap-4 font-mono text-xs">
          <span className="text-muted-foreground">
            Quality:{" "}
            <span className="text-primary">{quality != null ? `${quality}/100` : "—"}</span>
          </span>
          <span className="text-muted-foreground">
            Pulse:{" "}
            <span className="text-primary">
              {bpm != null ? `${bpm.toFixed(0)} BPM` : "Not reliable"}
            </span>
          </span>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ height }} className="w-full" />
      {data.length < 2 && (
        <p className="label-mono mt-2">Awaiting sufficient samples…</p>
      )}
    </div>
  );
}
