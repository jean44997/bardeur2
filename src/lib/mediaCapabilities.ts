export type LiveDebugEvent = {
  ts: number;
  type: "network" | "reconnect" | "buffer" | "audio" | "stream" | "error";
  message: string;
  data?: Record<string, unknown>;
};

export const isIOSDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
};

export const getConnectionInfo = () => {
  const connection = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection;
  return {
    effectiveType: connection?.effectiveType || "unknown",
    downlink: typeof connection?.downlink === "number" ? connection.downlink : 0,
    rtt: typeof connection?.rtt === "number" ? connection.rtt : 0,
    saveData: !!connection?.saveData,
  };
};

export const getAdaptiveLiveBufferSize = () => {
  const { effectiveType, downlink, saveData } = getConnectionInfo();
  if (saveData || effectiveType === "slow-2g" || effectiveType === "2g") return { images: 2, audio: 6 };
  if (effectiveType === "3g" || (downlink > 0 && downlink < 1.5)) return { images: 3, audio: 5 };
  if (effectiveType === "4g" && downlink >= 1.5 && downlink < 5) return { images: 2, audio: 4 };
  return { images: 2, audio: 3 };
};

export const getBestAudioRecorderOptions = (preferredBits = 160000) => {
  const candidates = isIOSDevice()
    ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  const mimeType = candidates.find((type) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type));
  return {
    mimeType,
    extension: mimeType?.includes("mp4") || mimeType?.includes("aac") ? "m4a" : "webm",
    contentType: mimeType || "audio/webm",
    options: mimeType ? { mimeType, audioBitsPerSecond: preferredBits } : { audioBitsPerSecond: preferredBits },
  };
};

export const emitLiveDebugEvent = (event: Omit<LiveDebugEvent, "ts">) => {
  if (typeof window === "undefined") return;
  const payload: LiveDebugEvent = { ts: Date.now(), ...event };
  window.dispatchEvent(new CustomEvent("bardeur-live-debug", { detail: payload }));
  try {
    const raw = window.localStorage.getItem("bardeur-live-debug-events");
    const events = raw ? (JSON.parse(raw) as LiveDebugEvent[]) : [];
    window.localStorage.setItem("bardeur-live-debug-events", JSON.stringify([...events, payload].slice(-80)));
  } catch {
    // ignore private browsing / storage quota
  }
};

export const createActionGate = (cooldownMs: number) => {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < cooldownMs) return false;
    last = now;
    return true;
  };
};