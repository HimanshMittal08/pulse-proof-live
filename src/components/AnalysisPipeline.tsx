import type { StepId, StepStatus } from "@/hooks/useRPPG";

const STEPS: { id: StepId; label: string }[] = [
  { id: "camera", label: "Camera Input" },
  { id: "face", label: "Face Detection" },
  { id: "roi", label: "ROI Extraction" },
  { id: "signal", label: "Biological Signal" },
  { id: "quality", label: "Signal Quality" },
  { id: "consistency", label: "Consistency Analysis" },
  { id: "verdict", label: "Verdict" },
];

const dot: Record<StepStatus, string> = {
  WAITING: "bg-muted-foreground/40",
  PROCESSING: "bg-primary animate-pulse",
  COMPLETE: "bg-[var(--success)]",
};

const text: Record<StepStatus, string> = {
  WAITING: "text-muted-foreground/60",
  PROCESSING: "text-primary",
  COMPLETE: "text-[var(--success)]",
};

export function AnalysisPipeline({ steps }: { steps: Record<StepId, StepStatus> }) {
  return (
    <div className="glass-panel rounded-xl p-4">
      <span className="label-mono">Analysis Pipeline</span>
      <ul className="mt-3 space-y-2">
        {STEPS.map((s) => (
          <li key={s.id} className="flex items-center gap-3">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dot[steps[s.id]]}`} />
            <span className="flex-1 text-sm text-foreground/85">{s.label}</span>
            <span className={`font-mono text-[0.62rem] tracking-widest ${text[steps[s.id]]}`}>
              {steps[s.id]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
