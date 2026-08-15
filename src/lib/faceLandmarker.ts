import type { FaceLandmarker } from "@mediapipe/tasks-vision";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let cached: Promise<FaceLandmarker> | null = null;

/** Loads the MediaPipe Face Landmarker once, in the browser only. */
export function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Face tracking is only available in the browser."));
  }
  if (!cached) {
    cached = (async () => {
      const vision = await import("@mediapipe/tasks-vision");
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      return vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: false,
      });
    })().catch((err) => {
      cached = null;
      throw err;
    });
  }
  return cached;
}
