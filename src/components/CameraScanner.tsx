import type { RefObject } from "react";
import type { LiveStatus, SessionPhase } from "@/hooks/useRPPG";

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  phase: SessionPhase;
  status: LiveStatus;
}

function Indicator({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <span className="label-mono">{label}</span>
      <span className="font-mono text-[0.7rem] tracking-wider" style={{ color: tone }}>
        {value}
      </span>
    </div>
  );
}

const OK = "var(--success)";
const WARN = "var(--warning)";
const BAD = "var(--destructive)";

export function CameraScanner({ videoRef, phase, status }: Props) {
  const faceOk = status.faceCount === 1;
  const acquiring = phase === "acquiring";
  const progress = Math.min(1, status.targetSec ? status.elapsedSec / status.targetSec : 0);

  return (
    <div className="space-y-4">
      <div className="glass-panel relative aspect-[4/3] w-full overflow-hidden rounded-2xl">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
        />
        {/* Scanner frame overlay */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[72%] w-[54%] -translate-x-1/2 -translate-y-1/2 rounded-[45%/38%] border-2 border-primary/50 shadow-[0_0_40px_-8px_var(--color-primary)]" />
          {["left-4 top-4 border-l-2 border-t-2", "right-4 top-4 border-r-2 border-t-2", "left-4 bottom-4 border-b-2 border-l-2", "right-4 bottom-4 border-b-2 border-r-2"].map(
            (c) => (
              <div key={c} className={`absolute h-8 w-8 border-primary ${c}`} />
            ),
          )}
          {acquiring && faceOk && (
            <div className="absolute inset-x-0 top-0 h-full overflow-hidden">
              <div className="scanline h-[2px] w-full bg-primary/80 shadow-[0_0_18px_2px_var(--color-primary)]" />
            </div>
          )}
        </div>
        <div className="absolute bottom-3 left-3 right-3 rounded-lg bg-background/70 px-3 py-2 backdrop-blur">
          <p className="font-mono text-[0.7rem] tracking-wide text-foreground/90">
            {phase === "initializing" ? "Initialising face tracking…" : status.message}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Indicator
          label="Face"
          value={
            status.faceCount === 1
              ? "DETECTED ✓"
              : status.faceCount === 0
                ? "NOT DETECTED"
                : "MULTIPLE FACES"
          }
          tone={faceOk ? OK : status.faceCount > 1 ? BAD : WARN}
        />
        <Indicator
          label="Face Stability"
          value={
            !faceOk
              ? "—"
              : status.stability >= 75
                ? `GOOD (${status.stability.toFixed(0)})`
                : status.stability >= 50
                  ? `FAIR (${status.stability.toFixed(0)})`
                  : `POOR (${status.stability.toFixed(0)})`
          }
          tone={status.stability >= 75 ? OK : status.stability >= 50 ? WARN : BAD}
        />
        <Indicator
          label="Lighting"
          value={faceOk ? `${status.lighting} (${status.lightingScore.toFixed(0)})` : "—"}
          tone={status.lighting === "GOOD" ? OK : status.lighting === "FAIR" ? WARN : BAD}
        />
        <Indicator
          label="Signal"
          value={
            !faceOk
              ? "WAITING"
              : status.liveQuality != null
                ? `ACQUIRED ${status.liveQuality}/100`
                : "ACQUIRING"
          }
          tone={status.liveQuality != null && status.liveQuality >= 55 ? OK : WARN}
        />
      </div>

      <div className="glass-panel rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="label-mono">Signal Acquisition</span>
          <span className="font-mono text-xs text-primary">
            {status.elapsedSec.toFixed(1)} / {status.targetSec} s · {status.fps.toFixed(0)} fps
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress * 100}%`, boxShadow: "0 0 14px var(--color-primary)" }}
          />
        </div>
      </div>
    </div>
  );
}
