import { useCallback, useEffect, useRef, useState } from "react";

type RecorderPermission = "idle" | "requesting" | "granted" | "denied";

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 2,
};

export function useVoiceRecorder() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);

  const [permission, setPermission] = useState<RecorderPermission>("idle");
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const revokePreview = useCallback((url?: string | null) => {
    const nextUrl = url ?? previewUrlRef.current;
    if (nextUrl) URL.revokeObjectURL(nextUrl);
    if (!url) previewUrlRef.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    revokePreview();
    setPreviewUrl(null);
    setRecordingBlob(null);
  }, [revokePreview]);

  useEffect(() => {
    if (!isRecording) {
      setRecordingTime(0);
      return;
    }

    const interval = window.setInterval(() => {
      setRecordingTime((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    return () => {
      revokePreview();
      stopTracks();
    };
  }, [revokePreview, stopTracks]);

  const startRecording = useCallback(async () => {
    if (isRecording) return true;

    clearPreview();
    setIsProcessing(false);
    setPermission("requesting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
        audioBitsPerSecond: 192000,
      });

      cancelledRef.current = false;
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stopTracks();
        setIsRecording(false);
        setIsProcessing(false);

        if (cancelledRef.current) {
          cancelledRef.current = false;
          chunksRef.current = [];
          return;
        }

        const blob = new Blob(chunksRef.current, { type: "audio/webm;codecs=opus" });
        chunksRef.current = [];

        if (blob.size < 1000) {
          setRecordingBlob(null);
          setPreviewUrl(null);
          return;
        }

        revokePreview();
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setRecordingBlob(blob);
        setPreviewUrl(url);
      };

      recorder.start(250);
      setPermission("granted");
      setIsRecording(true);
      setRecordingTime(0);
      return true;
    } catch {
      stopTracks();
      recorderRef.current = null;
      setIsRecording(false);
      setIsProcessing(false);
      setPermission("denied");
      return false;
    }
  }, [clearPreview, isRecording, revokePreview, stopTracks]);

  const stopRecording = useCallback(() => {
    if (!recorderRef.current || recorderRef.current.state === "inactive") return;
    setIsProcessing(true);
    recorderRef.current.stop();
    recorderRef.current = null;
  }, []);

  const cancelRecording = useCallback(() => {
    clearPreview();
    cancelledRef.current = true;
    setIsRecording(false);
    setIsProcessing(false);

    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    } else {
      stopTracks();
    }

    recorderRef.current = null;
    chunksRef.current = [];
  }, [clearPreview, stopTracks]);

  return {
    permission,
    isRecording,
    isProcessing,
    recordingTime,
    recordingBlob,
    previewUrl,
    startRecording,
    stopRecording,
    cancelRecording,
    clearPreview,
  };
}