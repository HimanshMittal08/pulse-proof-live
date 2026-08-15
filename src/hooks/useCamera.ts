import { useCallback, useRef, useState } from "react";

export type CameraError =
  | "PERMISSION_DENIED"
  | "NO_CAMERA"
  | "UNSUPPORTED"
  | "DISCONNECTED"
  | "UNKNOWN";

export interface CameraState {
  active: boolean;
  error: CameraError | null;
  errorDetail: string | null;
}

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({
    active: false,
    error: null,
    errorDetail: null,
  });

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState({ active: false, error: null, errorDetail: null });
  }, []);

  const start = useCallback(async (video: HTMLVideoElement) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState({
        active: false,
        error: "UNSUPPORTED",
        errorDetail: "This browser does not expose the camera API (getUserMedia).",
      });
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        setState({
          active: false,
          error: "DISCONNECTED",
          errorDetail: "The camera was disconnected.",
        });
      });
      setState({ active: true, error: null, errorDetail: null });
      return true;
    } catch (err) {
      const e = err as DOMException;
      const code: CameraError =
        e?.name === "NotAllowedError" || e?.name === "SecurityError"
          ? "PERMISSION_DENIED"
          : e?.name === "NotFoundError" || e?.name === "OverconstrainedError"
            ? "NO_CAMERA"
            : "UNKNOWN";
      setState({ active: false, error: code, errorDetail: e?.message ?? String(err) });
      return false;
    }
  }, []);

  return { ...state, start, stop, streamRef };
}
