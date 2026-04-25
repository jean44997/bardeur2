import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Users, Send, Heart, Mic, Square, Check, CheckCheck, Volume2, VolumeX, MessageCircle, Share2, WifiOff, Loader2, Play, Pause } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AudioBubble from "@/components/AudioBubble";
import { LiveAudioQueue } from "@/lib/liveAudioQueue";
import { LivePrebuffer } from "@/lib/livePrebuffer";
import type { BroadcastStatus } from "@/hooks/useLiveBroadcast";
import { emitLiveDebugEvent, getAdaptiveLiveBufferSize, getBestAudioRecorderOptions, getConnectionInfo } from "@/lib/mediaCapabilities";

interface LiveMsg { id: string; username: string; content: string; mediaUrl?: string; mediaType?: string; }

const FRAME_BASE = "https://imgqkcvojnalanrlanld.supabase.co/storage/v1/object/public/media/live-stream";

export default function WatchLivePage() {
  const navigate = useNavigate();
  const { id: liveId } = useParams();
  const { user } = useAuth();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioQueueRef = useRef<LiveAudioQueue>(new LiveAudioQueue());
  const prebufferRef = useRef<LivePrebuffer>(new LivePrebuffer());
  const recordingTimeoutRef = useRef<number | null>(null);
  const lastStatusRef = useRef<BroadcastStatus>("starting");
  const pausedRef = useRef(false);
  const lastTapRef = useRef(0);
  const cooldownsRef = useRef<Record<string, number>>({});

  const [live, setLive] = useState<any>(null);
  const [streamerName, setStreamerName] = useState("");
  const [streamerAvatar, setStreamerAvatar] = useState("");
  const [streamerId, setStreamerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [hearts, setHearts] = useState<string[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "delivered" | "error">("idle");
  const [typing, setTyping] = useState(false);
  const [frameSrc, setFrameSrc] = useState<string>("");
  const [audioMuted, setAudioMuted] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);
  const [streamerStatus, setStreamerStatus] = useState<BroadcastStatus>("starting");
  const [viewerStatus, setViewerStatus] = useState<"connecting" | "connected" | "buffering" | "reconnecting" | "ended">("connecting");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [audioStats, setAudioStats] = useState({ queued: 0, playing: false, lastSeq: -1, dropped: 0 });
  const [networkInfo, setNetworkInfo] = useState(getConnectionInfo());
  const [paused, setPaused] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  // Live aggregate counters (realtime)
  const [likesCount, setLikesCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [sharesCount, setSharesCount] = useState(0);

  const allowAction = (key: string, cooldown = 450) => {
    const now = Date.now();
    if (now - (cooldownsRef.current[key] || 0) < cooldown) return false;
    cooldownsRef.current[key] = now;
    return true;
  };

  // Mute updates the queue too
  useEffect(() => { audioQueueRef.current.setMuted(audioMuted || paused); }, [audioMuted, paused]);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const configureBuffer = () => {
      const nextNetwork = getConnectionInfo();
      const size = getAdaptiveLiveBufferSize();
      setNetworkInfo(nextNetwork);
      prebufferRef.current.configure(size);
      audioQueueRef.current.setBacklog(size.audio);
      emitLiveDebugEvent({ type: "network", message: `${nextNetwork.effectiveType} · ${nextNetwork.downlink || "?"} Mbps`, data: { ...nextNetwork, ...size } });
    };
    audioQueueRef.current.setStatsListener((stats) => { setAudioStats(stats); emitLiveDebugEvent({ type: "buffer", message: `${stats.queued} chunks audio en file`, data: stats }); });
    configureBuffer();
    const connection = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection;
    connection?.addEventListener?.("change", configureBuffer);
    return () => connection?.removeEventListener?.("change", configureBuffer);
  }, []);

  // Pause when tab hidden, auto-resume when visible (iOS-friendly)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        setPaused(true);
        audioQueueRef.current.setMuted(true);
      } else {
        // Auto-resume on iOS: re-arm queue and refresh frame without reload
        setPaused(false);
        audioQueueRef.current.setMuted(audioMuted);
        if (liveId) {
          const fresh = `${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`;
          setFrameSrc(fresh);
          prebufferRef.current.prefetchFrame(fresh);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [audioMuted, liveId]);

  const resumeStream = () => {
    if (!allowAction("resume", 700)) return;
    setPaused(false);
    setViewerStatus("buffering");
    audioQueueRef.current.setMuted(audioMuted);
    const url = `${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`;
    prebufferRef.current.prefetchFrame(url);
    setFrameSrc(url);
    emitLiveDebugEvent({ type: "stream", message: "Reprise du live", data: { liveId } });
  };

  const toggleViewerPause = () => {
    if (!allowAction("pause", 520)) return;
    setPaused((value) => {
      const next = !value;
      audioQueueRef.current.setMuted(next || audioMuted);
      setViewerStatus(next ? "buffering" : "connected");
      emitLiveDebugEvent({ type: "stream", message: next ? "Pause viewer" : "Lecture viewer" });
      return next;
    });
  };

  const handleStreamTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    const now = Date.now();
    const isDouble = now - lastTapRef.current < 320;
    lastTapRef.current = now;
    if (isDouble) {
      if (allowAction("double-like", 650)) sendHeart();
      return;
    }
    window.setTimeout(() => {
      if (Date.now() - lastTapRef.current < 320) return;
      toggleViewerPause();
    }, 260);
  };

  useEffect(() => {
    if (!liveId) return;
    const fetchLive = async () => {
      const { data } = await supabase.from("lives").select("*").eq("id", liveId).single();
      if (data) {
        setLive(data);
        setStreamerId((data as any).user_id);
        const { data: prof } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", (data as any).user_id).single();
        setStreamerName(prof?.display_name || "Live");
        setStreamerAvatar(prof?.avatar_url || "");
      }
    };
    fetchLive();

    const bumpViewer = async () => {
      const { data } = await supabase.from("lives").select("viewers_count").eq("id", liveId).single();
      await supabase.from("lives").update({ viewers_count: ((data as any)?.viewers_count || 0) + 1 }).eq("id", liveId);
    };
    bumpViewer();

    const channel = supabase
      .channel(`watch-live-${liveId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_messages", filter: `live_id=eq.${liveId}` }, (payload) => {
        const m = payload.new as any;
        setMessages(prev => [...prev.slice(-100), { id: m.id, username: m.user_id.slice(0, 8), content: m.content, mediaUrl: m.media_url || undefined, mediaType: m.media_type || undefined }]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lives", filter: `id=eq.${liveId}` }, (payload) => {
        const updated = payload.new as any;
        setLive(updated);
        if (!updated.is_active) { lastStatusRef.current = "ended"; setStreamerStatus("ended"); setViewerStatus("ended"); toast.info("Le live est terminé"); }
      })
      .subscribe();

    // Live stream broadcast channel (frames + audio chunks + streamer status)
    // With progressive backoff to avoid reconnect loops on flaky networks.
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;
    const streamChannel = supabase.channel(`live-stream-${liveId}`, { config: { broadcast: { self: false } } });
    const subscribeStream = () => streamChannel
      .on("broadcast", { event: "frame" }, () => {
        if (pausedRef.current) return;
        const url = `${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`;
        prebufferRef.current.prefetchFrame(url);
        setFrameSrc(url);
        setViewerStatus("connected");
      })
      .on("broadcast", { event: "audio" }, ({ payload }: any) => {
        if (!payload?.url || pausedRef.current) return;
        // Prefetch into mini-buffer so playback is instant even on jitter.
        prebufferRef.current.prefetchAudio(payload.url);
        audioQueueRef.current.enqueue(payload.seq ?? Date.now(), payload.url);
        setViewerStatus("connected");
      })
      .on("broadcast", { event: "status" }, ({ payload }: any) => {
        if (payload?.state) {
          const next = payload.state as BroadcastStatus;
          setStreamerStatus(next);
          setViewerStatus(next === "live" ? "connected" : next === "reconnecting" ? "reconnecting" : next === "ended" ? "ended" : "buffering");
          emitLiveDebugEvent({ type: "stream", message: `Streamer: ${next}`, data: { liveId } });
          if (lastStatusRef.current !== next) {
            if (next === "reconnecting") toast.loading("Reconnexion au live…", { id: "live-status" });
            else if (next === "live") toast.success("Connecté au live", { id: "live-status" });
            else if (next === "paused") toast.message("Streamer en pause", { id: "live-status" });
            else if (next === "ended") toast.info("Stream terminé", { id: "live-status" });
            lastStatusRef.current = next;
          }
        }
      })
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          reconnectAttempt = 0;
          setReconnectAttempts(0);
          setViewerStatus("connected");
          emitLiveDebugEvent({ type: "reconnect", message: "Canal live connecté", data: { attempts: 0 } });
          setStreamerStatus((prev) => (prev === "ended" ? prev : "live"));
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStreamerStatus("reconnecting");
          setViewerStatus("reconnecting");
          toast.loading("Reconnexion au live…", { id: "live-status" });
          const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt));
          reconnectAttempt += 1;
          setReconnectAttempts(reconnectAttempt);
          emitLiveDebugEvent({ type: "reconnect", message: `Tentative ${reconnectAttempt} dans ${delay}ms`, data: { delay, status: s } });
          reconnectTimer = window.setTimeout(() => { try { subscribeStream(); } catch { /* noop */ } }, delay);
        }
      });
    subscribeStream();

    // Initial frame fetch (in case streamer already broadcasting before we joined).
    const initialFrame = `${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`;
    setFrameSrc(initialFrame);
    prebufferRef.current.prefetchFrame(initialFrame);

    // Lightweight safety-net poll only every 8s in case a broadcast event was missed.
    const safetyTimer = window.setInterval(() => {
      if (!pausedRef.current && lastStatusRef.current !== "ended") {
        const url = `${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`;
        prebufferRef.current.prefetchFrame(url);
        setFrameSrc(url);
      }
    }, 8000);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(streamChannel);
      window.clearInterval(safetyTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      audioQueueRef.current.reset();
      prebufferRef.current.reset();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveId]);

  // Realtime live counters: likes + shares (uses notifications table aggregate)
  useEffect(() => {
    if (!liveId) return;
    const fetchCounts = async () => {
      // Use notifications referencing this live id as a lightweight counter store.
      const [likesRes, sharesRes] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("type", "live_like").eq("reference_id", liveId),
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("type", "live_share").eq("reference_id", liveId),
      ]);
      setLikesCount(likesRes.count || 0);
      setSharesCount(sharesRes.count || 0);
      if (user) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id")
          .eq("type", "live_like")
          .eq("reference_id", liveId)
          .eq("from_user_id", user.id)
          .maybeSingle();
        setLiked(!!existing);
      }
    };
    fetchCounts();
    const ch = supabase
      .channel(`live-counters-${liveId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `reference_id=eq.${liveId}` }, (payload) => {
        const t = (payload.new as any).type;
        if (t === "live_like") setLikesCount((c) => c + 1);
        else if (t === "live_share") setSharesCount((c) => c + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [liveId, user]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!newMsg.trim() || !liveId || !user) return;
    setSendState("sending");
    const { error } = await supabase.from("live_messages").insert({ live_id: liveId, user_id: user.id, content: newMsg.trim() });
    setSendState(error ? "error" : "delivered");
    if (error) { toast.error("Message non envoyé"); return; }
    setNewMsg("");
    setTimeout(() => setSendState("idle"), 1200);
  };

  const toggleAudioMessage = async () => {
    if (!allowAction("voice", 650)) return;
    if (sendState === "sending") return; // anti-doublon
    if (isRecordingAudio) {
      if (recordingTimeoutRef.current) { window.clearTimeout(recordingTimeoutRef.current); recordingTimeoutRef.current = null; }
      audioRecorderRef.current?.stop();
      setIsRecordingAudio(false);
      return;
    }
    if (!liveId || !user) return;
    try {
      const recorderOptions = getBestAudioRecorderOptions(160000);
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 } });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(s, recorderOptions.options);
      let alreadySent = false;
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        s.getTracks().forEach(t => t.stop());
        if (alreadySent) return; // garde-fou anti-doublon
        alreadySent = true;
        const blob = new Blob(audioChunksRef.current, { type: recorderOptions.contentType });
        if (blob.size < 1000) { setSendState("idle"); return; }
        setSendState("sending");
        const path = `${user.id}/watch-live-audio/${crypto.randomUUID()}.${recorderOptions.extension}`;
        const { error } = await supabase.storage.from("media").upload(path, blob, { contentType: recorderOptions.contentType });
        if (error) { setSendState("error"); toast.error("Vocal live impossible"); return; }
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        const { error: insertError } = await supabase.from("live_messages").insert({ live_id: liveId, user_id: user.id, content: "🎤 Vocal live", media_url: data.publicUrl, media_type: recorderOptions.contentType } as any);
        setSendState(insertError ? "error" : "delivered");
        setTimeout(() => setSendState("idle"), 1200);
      };
      audioRecorderRef.current = mr;
      mr.start(250);
      setIsRecordingAudio(true);
      emitLiveDebugEvent({ type: "audio", message: `Enregistrement vocal ${recorderOptions.contentType}`, data: { liveId } });
      // Timeout de sécurité : 60s max d'enregistrement
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (audioRecorderRef.current?.state === "recording") {
          toast.info("Vocal limité à 60 secondes");
          audioRecorderRef.current.stop();
          setIsRecordingAudio(false);
        }
      }, 60000);
    } catch (error) { emitLiveDebugEvent({ type: "error", message: "Micro live refusé ou codec non supporté", data: { error: String(error) } }); toast.error("Autorise le micro pour envoyer un vocal live"); }
  };

  const cancelAudioMessage = () => {
    if (!isRecordingAudio) return;
    if (recordingTimeoutRef.current) { window.clearTimeout(recordingTimeoutRef.current); recordingTimeoutRef.current = null; }
    const mr = audioRecorderRef.current;
    if (mr) {
      mr.ondataavailable = null;
      mr.onstop = () => mr.stream.getTracks().forEach(t => t.stop());
      try { mr.stop(); } catch { /* noop */ }
    }
    audioChunksRef.current = [];
    audioRecorderRef.current = null;
    setIsRecordingAudio(false);
    toast.info("Vocal annulé");
  };

  const sendHeart = async () => {
    if (!allowAction("heart", 550)) return;
    const id = crypto.randomUUID();
    setHearts(prev => [...prev, id]);
    setTimeout(() => setHearts(prev => prev.filter(h => h !== id)), 1500);
    if (!user || !liveId || liked || !streamerId) return;
    setLiked(true);
    setLikesCount((c) => c + 1);
    await supabase.from("notifications").insert({
      user_id: streamerId,
      from_user_id: user.id,
      type: "live_like",
      content: "a aimé ton live",
      reference_id: liveId,
    });
  };

  const focusComment = () => {
    setChatOpen(true);
    setTimeout(() => {
      const el = document.getElementById("live-comment-input") as HTMLInputElement | null;
      el?.focus();
    }, 50);
  };

  const shareLive = async () => {
    if (!allowAction("share", 900)) return;
    const url = `${window.location.origin}/live/${liveId}`;
    const shareData = { title: streamerName ? `Live de ${streamerName}` : "Live BARDEUR YK", url };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(url); toast.success("Lien copié"); }
    } catch { /* user dismissed */ }
    if (user && liveId && streamerId) {
      setSharesCount((c) => c + 1);
      await supabase.from("notifications").insert({
        user_id: streamerId,
        from_user_id: user.id,
        type: "live_share",
        content: "a partagé ton live",
        reference_id: liveId,
      });
    }
  };

  if (!live) return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  const statusIcon = sendState === "sending" ? <Check className="h-3 w-3 text-muted-foreground" /> : sendState === "delivered" ? <CheckCheck className="h-3 w-3 text-accent" /> : null;

  const statusLabel: Record<BroadcastStatus, string> = {
    idle: "En attente du streamer…",
    starting: "Connexion au live…",
    live: "En direct",
    paused: "Streamer en pause (caméra/micro coupés)",
    reconnecting: "Reconnexion…",
    ended: "Live terminé",
  };
  const showOverlay = streamerStatus === "paused" || streamerStatus === "reconnecting" || streamerStatus === "starting" || !hasFrame;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Live frame */}
      {frameSrc && !paused && (
        <img
          src={frameSrc}
          alt="Live"
          className="absolute inset-0 h-full w-full object-contain bg-background"
          onLoad={() => setHasFrame(true)}
          onError={() => setHasFrame(false)}
        />
      )}

      {/* Resume overlay (mini player) when paused */}
      {paused && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-background/95 backdrop-blur">
          <div className="glass rounded-2xl p-6 text-center max-w-xs">
            <div className="mx-auto mb-3 h-16 w-16 rounded-full overflow-hidden gradient-primary grid place-items-center text-xl font-bold text-primary-foreground ring-4 ring-destructive">
              {streamerAvatar ? <img src={streamerAvatar} alt="" className="h-full w-full object-cover" /> : streamerName[0]}
            </div>
            <p className="text-sm font-bold text-foreground">Live en pause</p>
            <p className="mb-4 text-xs text-muted-foreground">Le flux a été suspendu pour économiser ta connexion.</p>
            <motion.button whileTap={{ scale: 0.95 }} onClick={resumeStream} className="w-full rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground">
              Reprendre
            </motion.button>
          </div>
        </div>
      )}

      {/* Status overlay */}
      {showOverlay && !paused && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-background via-card to-background">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <div className="h-20 w-20 rounded-full overflow-hidden gradient-primary grid place-items-center text-2xl font-bold text-primary-foreground ring-4 ring-destructive">
              {streamerAvatar ? <img src={streamerAvatar} alt="" className="h-full w-full object-cover" /> : streamerName[0]}
            </div>
            <p className="text-sm font-bold text-foreground">{streamerName}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {streamerStatus === "reconnecting" ? <WifiOff className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{statusLabel[streamerStatus]}</span>
            </div>
          </div>
        </div>
      )}

      {/* Top gradient for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-background/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-64 bg-gradient-to-t from-background/90 to-transparent" />

      <AnimatePresence>
        {hearts.map(id => (
          <motion.div key={id} initial={{ opacity: 1, y: 0, x: "70vw" }} animate={{ opacity: 0, y: -200 }} exit={{ opacity: 0 }} transition={{ duration: 1.5 }} className="absolute bottom-40 z-30">
            <Heart className="h-8 w-8 fill-primary text-primary" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="glass rounded-full p-2" aria-label="Retour">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </motion.button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
            <div className={`h-2.5 w-2.5 rounded-full ${streamerStatus === "live" ? "bg-destructive animate-pulse" : "bg-muted-foreground"}`} />
            <span className="text-xs font-bold text-foreground">{streamerStatus === "live" ? "LIVE" : statusLabel[streamerStatus]}</span>
          </div>
          <div className="flex items-center gap-1 glass rounded-full px-3 py-1">
            <Users className="h-3.5 w-3.5 text-foreground" />
            <span className="text-xs font-bold text-foreground">{live.viewers_count || 0}</span>
          </div>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setAudioMuted((m) => !m)} className="glass rounded-full p-2" aria-label="Couper le son">
            {audioMuted ? <VolumeX className="h-4 w-4 text-foreground" /> : <Volume2 className="h-4 w-4 text-foreground" />}
          </motion.button>
        </div>
      </div>

      {/* Streamer info chip */}
      <div className="relative z-10 mx-4 mt-3 flex w-fit items-center gap-2 rounded-full glass px-3 py-1.5">
        <div className="h-7 w-7 rounded-full overflow-hidden gradient-primary grid place-items-center text-xs font-bold text-primary-foreground">
          {streamerAvatar ? <img src={streamerAvatar} alt="" className="h-full w-full object-cover" /> : streamerName[0]}
        </div>
        <span className="text-xs font-bold text-foreground">{streamerName}</span>
      </div>

      {/* Right action rail: Like / Comment / Share */}
      <div className="absolute right-3 bottom-44 z-20 flex flex-col items-center gap-4">
        <motion.button whileTap={{ scale: 0.85 }} onClick={sendHeart} className="flex flex-col items-center gap-1" aria-label="J'aime">
          <span className="glass rounded-full p-3">
            <Heart className={`h-6 w-6 ${liked ? "fill-primary text-primary" : "text-foreground"}`} />
          </span>
          <span className="text-[11px] font-bold text-foreground tabular-nums">{likesCount}</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} onClick={focusComment} className="flex flex-col items-center gap-1" aria-label="Commenter">
          <span className="glass rounded-full p-3">
            <MessageCircle className="h-6 w-6 text-foreground" />
          </span>
          <span className="text-[11px] font-bold text-foreground tabular-nums">{messages.length}</span>
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} onClick={shareLive} className="flex flex-col items-center gap-1" aria-label="Partager">
          <span className="glass rounded-full p-3">
            <Share2 className="h-6 w-6 text-foreground" />
          </span>
          <span className="text-[11px] font-bold text-foreground tabular-nums">{sharesCount}</span>
        </motion.button>
      </div>

      {/* Chat */}
      {chatOpen && (
        <div className="relative z-10 mt-auto flex max-h-[55vh] flex-col">
          <div className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-4 pb-2 pr-20">
            {messages.map(msg => (
              <motion.div key={msg.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass inline-block max-w-[85%] rounded-lg px-3 py-1.5">
                <span className="text-xs font-bold text-primary">@{msg.username}</span>{" "}
                <span className="text-xs text-foreground">{msg.content}</span>
                {msg.mediaUrl && msg.mediaType?.startsWith("audio") && <div className="mt-1"><AudioBubble src={msg.mediaUrl} compact /></div>}
              </motion.div>
            ))}
            {(typing || isRecordingAudio || sendState !== "idle") && <p className="px-2 text-[11px] text-muted-foreground">{isRecordingAudio ? "Vocal en cours… (appuie longuement sur ✕ pour annuler)" : sendState === "sending" ? "Envoi…" : typing ? "En train d'écrire…" : "Livré"}</p>}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pr-20">
            <div className="glass flex flex-1 items-center rounded-full px-4 py-2">
              <input id="live-comment-input" value={newMsg} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onChange={e => { setNewMsg(e.target.value); setTyping(e.target.value.length > 0); }} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Commenter..." className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
              {isRecordingAudio && (
                <motion.button whileTap={{ scale: 0.9 }} onClick={cancelAudioMessage} className="mr-2" aria-label="Annuler">
                  <span className="text-xs font-bold text-destructive">Annuler</span>
                </motion.button>
              )}
              <motion.button whileTap={{ scale: 0.9 }} onClick={toggleAudioMessage} className="mr-2" aria-label="Vocal">
                {isRecordingAudio ? <Square className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-accent" />}
              </motion.button>
              {statusIcon}
              <motion.button whileTap={{ scale: 0.9 }} onClick={sendMessage} aria-label="Envoyer">
                <Send className="h-4 w-4 text-primary" />
              </motion.button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
