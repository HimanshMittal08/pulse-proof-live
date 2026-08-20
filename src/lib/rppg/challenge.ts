import type {
  ActiveLiveness,
  ChallengeResult,
  ChallengeType,
  FaceGeometry,
} from "@/types/biometrics";
import { RPPG_CONFIG } from "./config";

export const CHALLENGE_PROMPT: Record<ChallengeType, string> = {
  TURN_LEFT: "Turn your head slightly LEFT",
  TURN_RIGHT: "Turn your head slightly RIGHT",
  BLINK: "Please blink",
  OPEN_MOUTH: "Please open your mouth",
};

const ALL: ChallengeType[] = ["TURN_LEFT", "TURN_RIGHT", "BLINK", "OPEN_MOUTH"];

/**
 * Randomness is used ONLY to pick which challenges are requested, never to
 * influence any measurement or the final verdict. Unpredictable selection is
 * what stops a pre-recorded clip from satisfying a fixed scripted movement.
 */
export function pickChallenges(
  rand: () => number = Math.random,
  count = 1,
  exclude: ChallengeType[] = [],
): ChallengeType[] {
  const pool = ALL.filter((c) => !exclude.includes(c));
  const bag = (pool.length ? pool : ALL).slice();
  const out: ChallengeType[] = [];
  while (out.length < count && bag.length) {
    out.push(bag.splice(Math.floor(rand() * bag.length), 1)[0]);
  }
  return out;
}

export type ChallengeState = "READY" | "DETECTING";

export interface ChallengeTick {
  /** instruction currently shown to the user */
  prompt: string;
  state: ChallengeState;
  index: number;
  total: number;
  /** true once every challenge has been resolved (passed or timed out) */
  done: boolean;
  result: ActiveLiveness | null;
}

interface Baseline {
  yaw: number;
  eye: number;
  mouth: number;
}

/**
 * Sequential active-liveness challenge runner. All decisions come from
 * measured, size-normalised facial geometry deltas relative to a per-user
 * baseline captured at the start of each challenge — never from absolute
 * screen coordinates, so moving the camera or a phone cannot satisfy it.
 */
export class ChallengeRunner {
  private readonly types: ChallengeType[];
  private i = 0;
  private results: ChallengeResult[] = [];
  private baselineSamples: FaceGeometry[] = [];
  private baseline: Baseline | null = null;
  private startedAt: number | null = null;
  private peak = 0;
  private returned = false;
  private finished: ActiveLiveness | null = null;

  constructor(types: ChallengeType[] = pickChallenges()) {
    this.types = types.length ? types : pickChallenges();
  }

  get challenges(): ChallengeType[] {
    return this.types;
  }

  /** Called when the face is lost — the current challenge restarts cleanly. */
  resetCurrent(): void {
    this.baseline = null;
    this.baselineSamples = [];
    this.startedAt = null;
    this.peak = 0;
    this.returned = false;
  }

  update(g: FaceGeometry, t: number): ChallengeTick {
    if (this.finished) {
      return {
        prompt: "",
        state: "DETECTING",
        index: this.types.length,
        total: this.types.length,
        done: true,
        result: this.finished,
      };
    }
    const C = RPPG_CONFIG.challenge;
    const type = this.types[this.i];

    // Baseline capture (short, per challenge) before the instruction counts.
    if (!this.baseline) {
      this.baselineSamples.push(g);
      if (this.baselineSamples.length >= C.baselineFrames) {
        const n = this.baselineSamples.length;
        const med = (sel: (x: FaceGeometry) => number) => {
          const v = this.baselineSamples.map(sel).sort((a, b) => a - b);
          return v[Math.floor(n / 2)];
        };
        this.baseline = {
          yaw: med((x) => x.yaw),
          eye: med((x) => x.eyeAspect),
          mouth: med((x) => x.mouthAspect),
        };
        this.startedAt = t;
      }
      return {
        prompt: "Get ready…",
        state: "READY",
        index: this.i,
        total: this.types.length,
        done: false,
        result: null,
      };
    }

    const elapsed = (t - (this.startedAt ?? t)) / 1000;
    let passed = false;
    let magnitude = 0;

    if (type === "TURN_LEFT" || type === "TURN_RIGHT") {
      // The camera preview is mirrored; the user's left is a decrease in the
      // measured (image-space) yaw. Either direction is accepted with the
      // requested one preferred, so we score the signed change generously.
      const delta = g.yaw - this.baseline.yaw;
      const signed = type === "TURN_LEFT" ? -delta : delta;
      this.peak = Math.max(this.peak, signed);
      magnitude = this.peak;
      passed = this.peak >= C.yawDeltaDeg;
    } else if (type === "BLINK") {
      const closed = g.eyeAspect < this.baseline.eye * C.blinkCloseRatio;
      if (closed) this.returned = true; // eye seen closed
      const open = g.eyeAspect > this.baseline.eye * C.blinkOpenRatio;
      this.peak = Math.max(this.peak, 1 - g.eyeAspect / Math.max(1e-6, this.baseline.eye));
      magnitude = this.peak;
      passed = this.returned && open;
    } else {
      // Tolerant: a clearly opened mouth is sufficient; closing again is not
      // required, so a natural, brief movement passes.
      this.peak = Math.max(this.peak, g.mouthAspect - this.baseline.mouth);
      magnitude = this.peak;
      passed = this.peak >= C.mouthOpenDelta;
    }

    if (passed || elapsed > C.timeoutSec) {
      this.results.push({
        type,
        passed,
        magnitude,
        detail: describe(type, passed, magnitude),
      });
      this.i++;
      this.resetCurrent();
      if (!passed || this.i >= this.types.length) {
        const verified = this.results.every((r) => r.passed);
        this.finished = {
          verified,
          challenges: this.results,
          reason: verified
            ? undefined
            : `Requested facial action was not observed (${this.results
                .filter((r) => !r.passed)
                .map((r) => CHALLENGE_PROMPT[r.type])
                .join("; ")}).`,
        };
        return {
          prompt: "",
          index: this.types.length,
          total: this.types.length,
          done: true,
          result: this.finished,
        };
      }
    }

    return {
      prompt: CHALLENGE_PROMPT[this.types[Math.min(this.i, this.types.length - 1)]],
      index: this.i,
      total: this.types.length,
      done: false,
      result: null,
    };
  }
}

function describe(type: ChallengeType, passed: boolean, magnitude: number): string {
  const m =
    type === "TURN_LEFT" || type === "TURN_RIGHT"
      ? `${magnitude.toFixed(1)}° relative head rotation`
      : type === "BLINK"
        ? `${(magnitude * 100).toFixed(0)}% eye-opening reduction`
        : `${magnitude.toFixed(2)} mouth-opening change`;
  return `${CHALLENGE_PROMPT[type]} — ${passed ? "verified" : "not observed"} (${m}).`;
}
