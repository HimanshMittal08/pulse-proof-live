import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { loadFaceLandmarker } from "@/lib/faceLandmarker";
import type {
  ActiveLiveness,
  ChallengeType,
  FrameSample,
  LightingLabel,
  LivenessFeatures,
  RegionName,
  Verdict,
} from "@/types/biometrics";
import { ChallengeRunner, CHALLENGE_PROMPT, pickChallenges } from "@/lib/rppg/challenge";
import { computeFaceGeometry } from "@/lib/rppg/faceGeometry";
import { analyzeFrames, estimateFps, regionWaveform } from "@/lib/rppg/analyze";
import { defaultClassifier } from "@/lib/rppg/scoring";
import { computeLighting } from "@/lib/rppg/quality";
import { computeMotion } from "@/lib/rppg/motion";
import { RPPG_CONFIG } from "@/lib/rppg/config";
import { dominantFrequency, welchPsd, clamp } from "@/lib/rppg/signalProcessing";
import { computeSignalQuality } from "@/lib/rppg/quality";

export type SessionPhase =
  | "idle"
  | "initializing"
  | "challenge"
  | "acquiring"
  | "analyzing"
  | "complete"
  | "error";

export type ChallengeUiState =
  | "IDLE"
  | "READY"
  | "PROMPT"
  | "DETECTING"
  | "RETRY"
  | "PASSED"
  | "FAILED";

export type StepStatus = "WAITING" | "PROCESSING" | "COMPLETE";
export type StepId =
  | "camera"
  | "face"
  | "roi"
  | "signal"
  | "quality"
  | "consistency"
  | "verdict";

export interface LiveStatus {
  faceCount: number;
  stability: number;
  lighting: LightingLabel;
  lightingScore: number;
  fps: number;
  elapsedSec: number;
  targetSec: number;
  message: string;
  waveform: number[];
  liveBpm: number | null;
  liveQuality: number | null;
  /** active-liveness instruction currently shown to the user */
  challengePrompt: string;
  challengeState: ChallengeUiState;
  /** 1-based attempt number of the active-liveness stage */
  challengeAttempt: number;
  challengeAttempts: number;
}

const MIN_SECONDS: number = RPPG_CONFIG.acquisition.minSec;
const MAX_SECONDS: number = RPPG_CONFIG.acquisition.maxSec;
const SAMPLE_WIDTH = 256;

const initialStatus: LiveStatus = {
  faceCount: 0,
  stability: 0,
  lighting: "POOR",
  lightingScore: 0,
  fps: 0,
  elapsedSec: 0,
  targetSec: MIN_SECONDS,
  message: "Waiting for face…",
  waveform: [],
  liveBpm: null,
  liveQuality: null,
  challengePrompt: "",
  challengeState: "IDLE",
  challengeAttempt: 1,
  challengeAttempts: RPPG_CONFIG.challenge.maxAttempts,
};

// MediaPipe Face Mesh landmark indices used as ROI anchors.
const ANCHORS: Record<RegionName, number> = {
  forehead: 151,
  leftCheek: 50,
  rightCheek: 280,
};
const ROI_SIZE: Record<RegionName, [number, number]> = {
  forehead: [0.26, 0.1],
  leftCheek: [0.14, 0.12],
  rightCheek: [0.14, 0.12],
};

interface RoiStats {
  r: number;
  g: number;
  b: number;
  brightness: number;
  over: number;
  under: number;
  valid: number;
}

/**
 * Mean colour of the skin-like pixels inside an ROI. Very dark, clipped or
 * non-skin-ratio pixels (hair, background, shadow) are excluded.
 */
function sampleRoi(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
): RoiStats | null {
  const x0 = Math.max(0, Math.round(cx - w / 2));
  const x1 = Math.min(imgW, Math.round(cx + w / 2));
  const y0 = Math.max(0, Math.round(cy - h / 2));
  const y1 = Math.min(imgH, Math.round(cy + h / 2));
  if (x1 - x0 < 3 || y1 - y0 < 3) return null;
  const S = RPPG_CONFIG.skin;
  let r = 0;
  let g = 0;
  let b = 0;
  let over = 0;
  let under = 0;
  let n = 0;
  let valid = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * imgW + x) * 4;
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
      n++;
      if (lum > 240) over++;
      if (lum < 30) under++;
      if (lum < S.minLuma || lum > S.maxLuma) continue;
      const rg = pg > 0 ? pr / pg : 0;
      const rb = pb > 0 ? pr / pb : 0;
      if (rb < S.minRedOverBlue) continue;
      if (rg < S.minRedOverGreen || rg > S.maxRedOverGreen) continue;
      r += pr;
      g += pg;
      b += pb;
      valid++;
    }
  }
  if (n === 0 || valid < 12) return null;
  const rm = r / valid;
  const gm = g / valid;
  const bm = b / valid;
  return {
    r: rm,
    g: gm,
    b: bm,
    brightness: 0.299 * rm + 0.587 * gm + 0.114 * bm,
    over: over / n,
    under: under / n,
    valid: valid / n,
  };
}

export function useRPPG(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [status, setStatus] = useState<LiveStatus>(initialStatus);
  const [steps, setSteps] = useState<Record<StepId, StepStatus>>({
    camera: "WAITING",
    face: "WAITING",
    roi: "WAITING",
    signal: "WAITING",
    quality: "WAITING",
    consistency: "WAITING",
    verdict: "WAITING",
  });
  const [features, setFeatures] = useState<LivenessFeatures | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);

  const framesRef = useRef<FrameSample[]>([]);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runningRef = useRef(false);
  const lastVideoTs = useRef(-1);
  const lastPreview = useRef(0);
  const targetRef = useRef(MIN_SECONDS);
  const faceLostAt = useRef<number | null>(null);
  const runnerRef = useRef<ChallengeRunner | null>(null);
  const livenessRef = useRef<ActiveLiveness | null>(null);
  const attemptRef = useRef(1);
  const usedChallengesRef = useRef<ChallengeType[]>([]);
  const passedAtRef = useRef(0);

  const setStep = useCallback((id: StepId, s: StepStatus) => {
    setSteps((prev) => (prev[id] === s ? prev : { ...prev, [id]: s }));
  }, []);

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const finish = useCallback(() => {
    runningRef.current = false;
    setPhase("analyzing");
    setStep("signal", "COMPLETE");
    setStep("quality", "PROCESSING");
    // Yield a frame so the pipeline UI paints before the (synchronous) analysis.
    setTimeout(() => {
      const f = analyzeFrames(framesRef.current);
      if (!f) {
        setStep("quality", "COMPLETE");
        setStep("consistency", "COMPLETE");
        setStep("verdict", "COMPLETE");
        setFeatures(null);
        setVerdict({
          label: "INSUFFICIENT_EVIDENCE",
          evidenceStrength: 0,
          reasons: ["Not enough usable frames were collected."],
          explanation:
            "The acquisition did not produce enough usable facial samples for any measurement to be made.",
        });
        setPhase("complete");
        return;
      }
      setStep("quality", "COMPLETE");
      setStep("consistency", "PROCESSING");
      setFeatures(f);
      const v = defaultClassifier.classify(f);
      setStep("consistency", "COMPLETE");
      setStep("verdict", "COMPLETE");
      setVerdict(v);
      setPhase("complete");
    }, 60);
  }, [setStep]);

  const loop = useCallback(() => {
    if (!runningRef.current) return;
    rafRef.current = requestAnimationFrame(loop);

    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !landmarker || video.readyState < 2) return;
    if (video.currentTime === lastVideoTs.current) return;
    lastVideoTs.current = video.currentTime;

    const now = performance.now();
    let result;
    try {
      result = landmarker.detectForVideo(video, now);
    } catch {
      return;
    }
    const faces = result.faceLandmarks ?? [];

    if (faces.length !== 1) {
      if (faceLostAt.current == null) faceLostAt.current = now;
      const lostSec = (now - faceLostAt.current) / 1000;
      if (faces.length > 1 || lostSec > RPPG_CONFIG.acquisition.faceLossResetSec) {
        framesRef.current = [];
      }
      setStep("face", "PROCESSING");
      setStep("roi", "WAITING");
      setStatus((s) => ({
        ...s,
        faceCount: faces.length,
        elapsedSec: 0,
        waveform: [],
        liveBpm: null,
        liveQuality: null,
        message:
          faces.length === 0
            ? "Waiting for face — position yourself in the frame."
            : "Multiple faces detected. Please ensure only one face is visible.",
      }));
      return;
    }
    faceLostAt.current = null;
    setStep("face", "COMPLETE");

    const lm = faces[0];
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    const faceW = maxX - minX;
    const faceH = maxY - minY;

    if (faceW < RPPG_CONFIG.acquisition.minFaceWidth) {
      framesRef.current = [];
      setStatus((s) => ({ ...s, faceCount: 1, elapsedSec: 0, message: "Move closer to the camera." }));
      return;
    }
    if (faceW > RPPG_CONFIG.acquisition.maxFaceWidth) {
      setStatus((s) => ({ ...s, faceCount: 1, elapsedSec: 0, message: "Move slightly further away." }));
      return;
    }

    // Downscaled frame sampling (never the full-resolution frame).
    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    const sw = SAMPLE_WIDTH;
    const sh = Math.round((vh / vw) * sw);
    if (canvas.width !== sw || canvas.height !== sh) {
      canvas.width = sw;
      canvas.height = sh;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, sw, sh);
    const img = ctx.getImageData(0, 0, sw, sh).data;

    setStep("roi", "COMPLETE");

    const regions: FrameSample["regions"] = {
      forehead: null,
      leftCheek: null,
      rightCheek: null,
    };
    let brightness = 0;
    let over = 0;
    let under = 0;
    let validSum = 0;
    let count = 0;
    (Object.keys(ANCHORS) as RegionName[]).forEach((name) => {
      const anchor = lm[ANCHORS[name]];
      if (!anchor) return;
      const [rw, rh] = ROI_SIZE[name];
      const stats = sampleRoi(
        img,
        sw,
        sh,
        anchor.x * sw,
        anchor.y * sh,
        faceW * rw * sw,
        faceH * rh * sh,
      );
      if (!stats) return;
      regions[name] = { t: now, r: stats.r, g: stats.g, b: stats.b, valid: stats.valid };
      brightness += stats.brightness;
      over += stats.over;
      under += stats.under;
      validSum += stats.valid;
      count++;
    });
    if (count === 0) return;

    const frame: FrameSample = {
      t: now,
      regions,
      faceX: minX + faceW / 2,
      faceY: minY + faceH / 2,
      faceWidth: faceW,
      faceHeight: faceH,
      brightness: brightness / count,
      overexposed: over / count,
      underexposed: under / count,
      validRatio: validSum / count,
    };
    framesRef.current.push(frame);
    const buf = framesRef.current;
    if (buf.length > 2000) buf.splice(0, buf.length - 2000);

    setStep("signal", "PROCESSING");

    // Motion is scored continuously; heavy movement lowers quality but never
    // discards the recording (natural movement must not reset acquisition).
    const motion = computeMotion(buf.slice(-45));


    const elapsed = (frame.t - buf[0].t) / 1000;
    const fps = estimateFps(buf);
    const lighting = computeLighting(
      buf.slice(-60).map((f) => f.brightness),
      buf.slice(-60).map((f) => f.overexposed),
      buf.slice(-60).map((f) => f.underexposed),
    );

    // Live preview of the real fused waveform, refreshed ~5x per second.
    let preview: Partial<LiveStatus> = {};
    if (now - lastPreview.current > 200 && elapsed > 4 && fps >= 8) {
      lastPreview.current = now;
      const window = buf.filter((f) => frame.t - f.t <= 8000);
      const waves = (Object.keys(ANCHORS) as RegionName[])
        .map((name) => regionWaveform(window, name, fps))
        .filter((w) => w.length > fps * 3);
      if (waves.length) {
        const len = Math.min(...waves.map((w) => w.length));
        const fused = new Float32Array(len);
        for (let i = 0; i < len; i++) {
          let s = 0;
          for (const w of waves) s += w[i];
          fused[i] = s / waves.length;
        }
        const peak = dominantFrequency(welchPsd(fused, fps));
        const q = peak ? computeSignalQuality(peak.snrDb, peak.peakStrength, 0.5) : 0;
        preview = {
          waveform: Array.from(fused.subarray(Math.max(0, len - Math.round(fps * 6)))),
          liveBpm: peak && q >= 30 ? peak.bpm : null,
          liveQuality: Math.round(q),
        };
        // Adaptive duration: extend acquisition when the signal is weak.
        targetRef.current = q >= 60 ? MIN_SECONDS : MAX_SECONDS;
      }
    }

    setStatus((s) => ({
      ...s,
      ...preview,
      faceCount: 1,
      stability: clamp(motion.stability),
      lighting: lighting.label,
      lightingScore: lighting.score,
      fps,
      elapsedSec: elapsed,
      targetSec: targetRef.current,
      message:
        lighting.label === "POOR"
          ? "Insufficient lighting for biological signal analysis."
          : "Acquiring biological signal…",
    }));

    if (elapsed >= targetRef.current) finish();
  }, [finish, setStep, videoRef]);

  const start = useCallback(async () => {
    setError(null);
    setVerdict(null);
    setFeatures(null);
    framesRef.current = [];
    targetRef.current = MIN_SECONDS;
    lastVideoTs.current = -1;
    setStatus(initialStatus);
    setSteps({
      camera: "COMPLETE",
      face: "PROCESSING",
      roi: "WAITING",
      signal: "WAITING",
      quality: "WAITING",
      consistency: "WAITING",
      verdict: "WAITING",
    });
    setPhase("initializing");
    try {
      landmarkerRef.current = await loadFaceLandmarker();
    } catch (err) {
      setError(
        "Face tracking could not be initialised in this browser. " +
          ((err as Error)?.message ?? ""),
      );
      setPhase("error");
      return;
    }
    setPhase("acquiring");
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const reset = useCallback(() => {
    stop();
    framesRef.current = [];
    setStatus(initialStatus);
    setFeatures(null);
    setVerdict(null);
    setError(null);
    setPhase("idle");
    setSteps({
      camera: "WAITING",
      face: "WAITING",
      roi: "WAITING",
      signal: "WAITING",
      quality: "WAITING",
      consistency: "WAITING",
      verdict: "WAITING",
    });
  }, [stop]);

  return { phase, status, steps, features, verdict, error, start, stop, reset };
}
