import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Activity, CameraOff, Fingerprint, Lock, RadioTower, ScanFace } from "lucide-react";
import { useCamera } from "@/hooks/useCamera";
import { useRPPG } from "@/hooks/useRPPG";
import { CameraScanner } from "@/components/CameraScanner";
import { SignalGraph } from "@/components/SignalGraph";
import { AnalysisPipeline } from "@/components/AnalysisPipeline";
import { MetricsPanel } from "@/components/MetricsPanel";
import { VerdictCard } from "@/components/VerdictCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PulseProof — Real-Time Biological Liveness Detection" },
      {
        name: "description",
        content:
          "PulseProof analyzes camera-derived physiological signals (rPPG) in your browser to assess biological liveness in real time.",
      },
      { property: "og:title", content: "PulseProof — Biological Liveness Detection" },
      {
        property: "og:description",
        content:
          "Verify human presence through biology: real-time rPPG signal quality, spatial and temporal consistency analysis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PulseProof,
});

const FEATURES = [
  {
    icon: RadioTower,
    title: "REAL-TIME",
    body: "Biological signal analysis directly from camera input.",
  },
  {
    icon: Fingerprint,
    title: "NON-INTRUSIVE",
    body: "No wearable sensor required.",
  },
  {
    icon: Activity,
    title: "EVIDENCE-BASED",
    body: "Combines signal quality, spatial consistency and temporal consistency.",
  },
];

function CameraErrorCard({ detail, onRetry }: { detail: string; onRetry: () => void }) {
  return (
    <div className="glass-panel rounded-2xl p-6 text-center">
      <CameraOff className="mx-auto h-8 w-8 text-[var(--destructive)]" />
      <h2 className="font-display mt-3 text-xl font-bold text-[var(--destructive)]">
        Camera Access Required
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
      <p className="mt-3 text-xs text-muted-foreground">
        Enable the camera for this site in your browser&apos;s address-bar permission icon (or
        Settings → Site settings → Camera), then reload and try again. No verification result can
        be produced without camera input.
      </p>
      <button
        onClick={onRetry}
        className="glow-cyan mt-5 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}

function PulseProof() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera();
  const rppg = useRPPG(videoRef);
  const [started, setStarted] = useState(false);

  const begin = useCallback(async () => {
    setStarted(true);
    rppg.reset();
    const video = videoRef.current;
    if (!video) return;
    const ok = await camera.start(video);
    if (ok) await rppg.start();
  }, [camera, rppg]);

  const restart = useCallback(async () => {
    rppg.reset();
    await rppg.start();
  }, [rppg]);

  const showResults = rppg.phase === "complete" && rppg.verdict;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="flex flex-col items-center text-center">
        <div className="flex items-center gap-3">
          <ScanFace className="h-7 w-7 text-primary" />
          <h1 className="font-display text-3xl font-black tracking-[0.2em] text-primary text-glow sm:text-4xl">
            PULSEPROOF
          </h1>
        </div>
        <p className="label-mono mt-2">Real-Time Biological Liveness Detection</p>
        {!started && (
          <>
            <h2 className="mt-8 max-w-2xl font-display text-3xl font-bold leading-tight sm:text-4xl">
              Verify Human Presence Through Biology
            </h2>
            <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
              PulseProof analyzes subtle camera-derived physiological signals to assess biological
              liveness in real time. Verify human presence through biological signal consistency.
            </p>
            <button
              onClick={begin}
              className="glow-cyan mt-8 rounded-xl bg-primary px-8 py-3 font-display text-sm font-bold tracking-widest text-primary-foreground transition hover:brightness-110"
            >
              START VERIFICATION
            </button>
            <p className="mt-3 text-xs text-muted-foreground">
              Your camera feed is analyzed locally in your browser. Frames are never uploaded or
              stored.
            </p>
          </>
        )}
      </header>

      {!started && (
        <>
          <section className="mt-12 grid gap-4 sm:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="glass-panel rounded-xl p-5">
                <Icon className="h-6 w-6 text-primary" />
                <h3 className="font-display mt-3 text-sm font-bold tracking-widest text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </section>

          <section className="glass-panel mt-6 rounded-xl p-5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <span className="label-mono">Privacy</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>
                PulseProof analyzes camera-derived signals for liveness assessment. All face
                tracking and signal processing runs in your browser.
              </li>
              <li>
                Camera frames are not stored and are not uploaded to any server. Only aggregated
                per-region colour averages are held in memory during a session, then discarded.
              </li>
              <li>
                The face-tracking model is downloaded from a public CDN; no image data is sent
                back.
              </li>
            </ul>
          </section>

          <section className="mt-6 rounded-xl border border-border/60 p-5 text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground/80">Scientific scope.</strong> PulseProof provides
            biological liveness evidence to help assess whether a visual feed is consistent with a
            live human. Remote photoplethysmography indicates biological consistency; it is not a
            guaranteed deepfake detector, and no accuracy figure is claimed here because none has
            been validated against a public dataset. Weak evidence is reported as{" "}
            <span className="text-[var(--warning)]">INSUFFICIENT EVIDENCE</span>, never as a
            synthetic verdict.
          </section>
        </>
      )}

      {started && (
        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            {camera.error ? (
              <CameraErrorCard
                detail={
                  camera.error === "PERMISSION_DENIED"
                    ? "Camera permission was denied, so no biological signal can be measured."
                    : camera.error === "NO_CAMERA"
                      ? "No usable camera device was found."
                      : camera.error === "DISCONNECTED"
                        ? "The camera was disconnected during the session."
                        : (camera.errorDetail ?? "The camera could not be started.")
                }
                onRetry={begin}
              />
            ) : (
              <CameraScanner videoRef={videoRef} phase={rppg.phase} status={rppg.status} />
            )}
            {rppg.error && (
              <div className="glass-panel rounded-xl p-4 text-sm text-[var(--destructive)]">
                {rppg.error}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <SignalGraph
              data={rppg.status.waveform}
              quality={rppg.status.liveQuality}
              bpm={rppg.status.liveBpm}
            />
            <AnalysisPipeline steps={rppg.steps} />
            {showResults && rppg.verdict && <VerdictCard verdict={rppg.verdict} />}
          </div>

          {showResults && (
            <div className="space-y-5 lg:col-span-2">
              <MetricsPanel features={rppg.features} />
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={restart}
                  className="glow-cyan rounded-lg bg-primary px-6 py-2.5 font-display text-xs font-bold tracking-widest text-primary-foreground"
                >
                  RUN AGAIN
                </button>
                <button
                  onClick={() => {
                    camera.stop();
                    rppg.reset();
                    setStarted(false);
                  }}
                  className="rounded-lg border border-border px-6 py-2.5 font-display text-xs font-bold tracking-widest text-foreground/80"
                >
                  END SESSION
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
