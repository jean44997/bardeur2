// Utilities that keep a WebRTC call alive and observable when the PWA is
// backgrounded. Two ingredients matter on mobile browsers:
//  1. A silent, always-on WebAudio node so the audio graph is not suspended by
//     iOS Safari / some Android browsers, which otherwise pause the remote
//     track when the tab loses focus.
//  2. MediaSession metadata + a hangup action so the OS lock screen surfaces
//     the ongoing call (Android/Chrome) instead of the app looking "dead".
// Both are strictly no-ops when the browser does not support them.

let keepAliveCtx: AudioContext | null = null;
let keepAliveGain: GainNode | null = null;
let keepAliveOsc: OscillatorNode | null = null;

export type BackgroundCallInfo = {
  title: string; // e.g. "Appel audio en cours"
  peerName: string;
  peerAvatar?: string | null;
  onHangup: () => void;
};

const startSilentAudio = () => {
  try {
    if (keepAliveCtx) return;
    const Ctx: typeof AudioContext | undefined =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    // Effectively inaudible but keeps the graph active.
    gain.gain.value = 0.00001;
    const osc = ctx.createOscillator();
    osc.frequency.value = 20; // sub-audible
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    keepAliveCtx = ctx;
    keepAliveGain = gain;
    keepAliveOsc = osc;
    // Some browsers start contexts as "suspended" until a user gesture. The
    // call itself is triggered by one, so resume() usually succeeds.
    void ctx.resume?.().catch(() => {});
  } catch {
    // Keepalive is a bonus.
  }
};

const stopSilentAudio = () => {
  try {
    keepAliveOsc?.stop();
  } catch {
    // ignore
  }
  try {
    keepAliveOsc?.disconnect();
    keepAliveGain?.disconnect();
  } catch {
    // ignore
  }
  keepAliveCtx?.close().catch(() => {});
  keepAliveCtx = null;
  keepAliveGain = null;
  keepAliveOsc = null;
};

const setMediaSession = (info: BackgroundCallInfo) => {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  try {
    const artwork = info.peerAvatar
      ? [{ src: info.peerAvatar, sizes: "512x512", type: "image/png" }]
      : [];
    ms.metadata = new (window as any).MediaMetadata({
      title: info.title,
      artist: info.peerName,
      album: "BARDEUR",
      artwork,
    });
    ms.playbackState = "playing";
    // Any of these might not exist on older browsers; wrap each in try/catch.
    const bind = (action: string, handler: () => void) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // Not supported.
      }
    };
    bind("stop", info.onHangup);
    bind("pause", info.onHangup);
  } catch {
    // MediaSession is a bonus.
  }
};

const clearMediaSession = () => {
  const ms = (navigator as any).mediaSession;
  if (!ms) return;
  try {
    ms.metadata = null;
    ms.playbackState = "none";
    ["stop", "pause", "play"].forEach((action) => {
      try {
        ms.setActionHandler(action, null);
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
};

export const startBackgroundCallKeepalive = (info: BackgroundCallInfo) => {
  startSilentAudio();
  setMediaSession(info);
};

export const stopBackgroundCallKeepalive = () => {
  stopSilentAudio();
  clearMediaSession();
};
