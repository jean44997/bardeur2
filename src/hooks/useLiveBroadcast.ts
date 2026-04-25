import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getBestAudioRecorderOptions } from "@/lib/mediaCapabilities";

interface UseLiveBroadcastOptions {
  liveId: string | null;
  stream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
  enabled: boolean;
  frameIntervalMs?: number;
  audioChunkMs?: number;
}

export type BroadcastStatus = "idle" | "starting" | "live" | "paused" | "reconnecting" | "ended";

/**
 * Captures periodic video frames (jpeg) and audio chunks (opus webm) from the
 * streamer's camera and broadcasts them to viewers via Supabase storage + a
 * realtime broadcast channel. Includes safeguards: detects camera/mic loss,
 * pauses uploads when tracks die, resumes when the stream comes back, and
 * surfaces a clear status to the UI.
 */
export function useLiveBroadcast({
  liveId,
  stream,
  videoElement,
  enabled,
  frameIntervalMs = 1200,
  audioChunkMs = 4000,
}: UseLiveBroadcastOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const seqRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pausedRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const [status, setStatus] = useState<BroadcastStatus>("idle");

  useEffect(() => {
    if (!enabled || !liveId || !stream || !videoElement) {
      setStatus("idle");
      return;
    }

    setStatus("starting");
    let reconnectAttempt = 0;
    let reconnectTimer: number | undefined;
    const channel = supabase.channel(`live-stream-${liveId}`, {
      config: { broadcast: { ack: false, self: false } },
    });
    const subscribe = () => channel.subscribe((s) => {
      if (s === "SUBSCRIBED") { reconnectAttempt = 0; setStatus("live"); }
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setStatus("reconnecting");
        const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt));
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(() => { try { subscribe(); } catch { /* noop */ } }, delay);
      }
    });
    subscribe();
    channelRef.current = channel;

    const announce = (state: BroadcastStatus) => {
      try { channel.send({ type: "broadcast", event: "status", payload: { state, ts: Date.now() } }); } catch { /* noop */ }
    };

    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const checkTracks = () => {
      const video = stream.getVideoTracks();
      const audio = stream.getAudioTracks();
      const videoLive = video.some((t) => t.readyState === "live" && t.enabled);
      const audioLive = audio.some((t) => t.readyState === "live" && t.enabled);
      const shouldPause = !videoLive && !audioLive;
      if (shouldPause && !pausedRef.current) {
        pausedRef.current = true;
        setStatus("paused");
        announce("paused");
      } else if (!shouldPause && pausedRef.current) {
        pausedRef.current = false;
        setStatus("live");
        announce("live");
      }
    };

    const trackHandlers: Array<() => void> = [];
    [...stream.getTracks()].forEach((track) => {
      const onEnded = () => checkTracks();
      const onMute = () => checkTracks();
      const onUnmute = () => checkTracks();
      track.addEventListener("ended", onEnded);
      track.addEventListener("mute", onMute);
      track.addEventListener("unmute", onUnmute);
      trackHandlers.push(() => {
        track.removeEventListener("ended", onEnded);
        track.removeEventListener("mute", onMute);
        track.removeEventListener("unmute", onUnmute);
      });
    });

    const captureFrame = async () => {
      if (pausedRef.current) return;
      if (!videoElement.videoWidth || !ctx) return;
      canvas.width = Math.min(720, videoElement.videoWidth);
      canvas.height = Math.round((canvas.width / videoElement.videoWidth) * videoElement.videoHeight);
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.7));
      if (!blob) return;
      try {
        await supabase.storage
          .from("media")
          .upload(`live-stream/${liveId}/frame.jpg`, blob, { contentType: "image/jpeg", upsert: true, cacheControl: "0" });
        consecutiveErrorsRef.current = 0;
        if (status === "reconnecting") setStatus("live");
        // Event-driven: tell viewers a fresh frame is up so they can refresh immediately.
        channel.send({ type: "broadcast", event: "frame", payload: { ts: Date.now() } });
      } catch {
        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current >= 2) {
          setStatus("reconnecting");
          announce("reconnecting");
        }
      }
    };

    const frameTimer = window.setInterval(captureFrame, frameIntervalMs);
    captureFrame();
    const trackTimer = window.setInterval(checkTracks, 1500);

    // Audio chunked recording
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length) {
      const audioStream = new MediaStream(audioTracks);
      let mr: MediaRecorder;
      const recorderOptions = getBestAudioRecorderOptions(128000);
      try { mr = new MediaRecorder(audioStream, recorderOptions.options); } catch { mr = new MediaRecorder(audioStream); }
      recorderRef.current = mr;

      mr.ondataavailable = async (event) => {
        if (pausedRef.current) return;
        if (!event.data || event.data.size < 800) return;
        const seq = seqRef.current++;
        const path = `live-stream/${liveId}/audio-${seq % 8}.${recorderOptions.extension}`;
        try {
          await supabase.storage.from("media").upload(path, event.data, { contentType: recorderOptions.contentType, upsert: true, cacheControl: "0" });
          const { data } = supabase.storage.from("media").getPublicUrl(path);
          channel.send({ type: "broadcast", event: "audio", payload: { url: `${data.publicUrl}?t=${Date.now()}`, seq, ts: Date.now(), contentType: recorderOptions.contentType } });
        } catch {
          // ignore
        }
      };

      try { mr.start(audioChunkMs); } catch { /* noop */ }
    }

    return () => {
      window.clearInterval(frameTimer);
      window.clearInterval(trackTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      trackHandlers.forEach((off) => off());
      try { recorderRef.current?.stop(); } catch { /* noop */ }
      recorderRef.current = null;
      announce("ended");
      setStatus("ended");
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, liveId, stream, videoElement, frameIntervalMs, audioChunkMs]);

  return { status };
}
