import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseLiveBroadcastOptions {
  liveId: string | null;
  stream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
  enabled: boolean;
  frameIntervalMs?: number;
  audioChunkMs?: number;
}

/**
 * Captures periodic video frames (jpeg) and audio chunks (opus webm) from the
 * streamer's camera and broadcasts them to viewers via Supabase storage + a
 * realtime broadcast channel. This is a lightweight pseudo-stream that works
 * without WebRTC infrastructure.
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

  useEffect(() => {
    if (!enabled || !liveId || !stream || !videoElement) return;

    const channel = supabase.channel(`live-stream-${liveId}`, {
      config: { broadcast: { ack: false, self: false } },
    });
    channel.subscribe();
    channelRef.current = channel;

    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const captureFrame = async () => {
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
        channel.send({ type: "broadcast", event: "frame", payload: { ts: Date.now() } });
      } catch {
        // ignore upload errors and try again on next tick
      }
    };

    const frameTimer = window.setInterval(captureFrame, frameIntervalMs);
    captureFrame();

    // Audio chunked recording
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length) {
      const audioStream = new MediaStream(audioTracks);
      let mr: MediaRecorder;
      try {
        mr = new MediaRecorder(audioStream, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 96000 });
      } catch {
        mr = new MediaRecorder(audioStream);
      }
      recorderRef.current = mr;

      mr.ondataavailable = async (event) => {
        if (!event.data || event.data.size < 800) return;
        const seq = seqRef.current++;
        const path = `live-stream/${liveId}/audio-${seq % 6}.webm`;
        try {
          await supabase.storage.from("media").upload(path, event.data, { contentType: "audio/webm", upsert: true, cacheControl: "0" });
          const { data } = supabase.storage.from("media").getPublicUrl(path);
          channel.send({ type: "broadcast", event: "audio", payload: { url: `${data.publicUrl}?t=${Date.now()}`, seq } });
        } catch {
          // ignore
        }
      };

      try { mr.start(audioChunkMs); } catch { /* noop */ }
    }

    return () => {
      window.clearInterval(frameTimer);
      try { recorderRef.current?.stop(); } catch { /* noop */ }
      recorderRef.current = null;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [enabled, liveId, stream, videoElement, frameIntervalMs, audioChunkMs]);
}
