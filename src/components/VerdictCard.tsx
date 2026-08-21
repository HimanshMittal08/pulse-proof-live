import type { Verdict } from "@/types/biometrics";
import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";

const CONFIG = {
  LIKELY_REAL: {
    title: "LIKELY REAL",
    Icon: ShieldCheck,
    color: "var(--success)",
  },
  LIKELY_DEEPFAKE: {
    title: "LIKELY DEEPFAKE",
    Icon: ShieldAlert,
    color: "var(--destructive)",
  },
  INSUFFICIENT_EVIDENCE: {
    title: "INSUFFICIENT EVIDENCE",
    Icon: ShieldQuestion,
    color: "var(--warning)",
  },
} as const;

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  const cfg = CONFIG[verdict.label];
  const { Icon } = cfg;
  return (
    <div
      className="glass-panel rounded-2xl p-6"
      style={{ boxShadow: `0 0 0 1px ${cfg.color}55, 0 0 40px -12px ${cfg.color}` }}
    >
      <div className="flex items-start gap-4">
        <Icon className="mt-1 h-8 w-8 shrink-0" style={{ color: cfg.color }} />
        <div className="min-w-0 flex-1">
          <span className="label-mono">Assessment</span>
          <h2
            className="font-display text-2xl font-bold tracking-wide sm:text-3xl"
            style={{ color: cfg.color }}
          >
            {cfg.title}
          </h2>
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="label-mono">Evidence Strength</span>
              <span className="font-mono text-sm text-foreground">
                {verdict.evidenceStrength}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${verdict.evidenceStrength}%`,
                  backgroundColor: cfg.color,
                  boxShadow: `0 0 14px ${cfg.color}`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <span className="label-mono">Why this result?</span>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">{verdict.explanation}</p>
        {verdict.reasons.length > 0 && (
          <ul className="mt-3 space-y-1">
            {verdict.reasons.map((r) => (
              <li key={r} className="flex gap-2 text-xs text-muted-foreground">
                <span className="text-primary">›</span>
                {r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
