import type { FaceGeometry } from "@/types/biometrics";

interface Pt {
  x: number;
  y: number;
  z?: number;
}

const IDX = {
  noseTip: 1,
  leftFace: 234,
  rightFace: 454,
  chin: 152,
  foreheadTop: 10,
  leftEyeOuter: 33,
  leftEyeInner: 133,
  leftEyeUpper: 159,
  leftEyeLower: 145,
  rightEyeOuter: 263,
  rightEyeInner: 362,
  rightEyeUpper: 386,
  rightEyeLower: 374,
  mouthLeft: 78,
  mouthRight: 308,
  mouthUpper: 13,
  mouthLower: 14,
} as const;

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Head pose and eye/mouth openness derived from *relative* facial geometry.
 * Every quantity is normalised by an internal facial distance, so translating
 * or rescaling the whole face (a phone being moved, the user leaning in) does
 * not change any of these values — only real facial articulation does.
 * Returns null when the required landmarks are unavailable.
 */
export function computeFaceGeometry(lm: Pt[]): FaceGeometry | null {
  const p = (i: number) => lm[i];
  for (const i of Object.values(IDX)) if (!p(i)) return null;

  const nose = p(IDX.noseTip);
  const left = p(IDX.leftFace);
  const right = p(IDX.rightFace);
  const chin = p(IDX.chin);
  const top = p(IDX.foreheadTop);

  // Yaw: horizontal asymmetry of the nose between the two face edges.
  const dL = Math.abs(nose.x - left.x);
  const dR = Math.abs(right.x - nose.x);
  const denom = dL + dR;
  if (denom < 1e-6) return null;
  const asym = (dR - dL) / denom; // -1 .. 1
  const yaw = Math.max(-70, Math.min(70, asym * 75));

  // Pitch: vertical position of the nose between the eye line and the chin.
  const eyeY = (p(IDX.leftEyeOuter).y + p(IDX.rightEyeOuter).y) / 2;
  const span = chin.y - top.y;
  if (Math.abs(span) < 1e-6) return null;
  const rel = (nose.y - eyeY) / span; // ~0.2 neutral
  const pitch = Math.max(-70, Math.min(70, (rel - 0.22) * 220));

  // Eye aspect ratios (openness), normalised by each eye's own width.
  const earL =
    dist(p(IDX.leftEyeUpper), p(IDX.leftEyeLower)) /
    Math.max(1e-6, dist(p(IDX.leftEyeOuter), p(IDX.leftEyeInner)));
  const earR =
    dist(p(IDX.rightEyeUpper), p(IDX.rightEyeLower)) /
    Math.max(1e-6, dist(p(IDX.rightEyeOuter), p(IDX.rightEyeInner)));

  // Mouth aspect ratio, normalised by mouth width.
  const mar =
    dist(p(IDX.mouthUpper), p(IDX.mouthLower)) /
    Math.max(1e-6, dist(p(IDX.mouthLeft), p(IDX.mouthRight)));

  return { yaw, pitch, eyeAspect: (earL + earR) / 2, mouthAspect: mar };
}
