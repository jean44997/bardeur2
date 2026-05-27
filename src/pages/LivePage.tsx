import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Video, Mic, MicOff, Camera, CameraOff, Send, Users, X, Zap, Trophy, RotateCcw, Radio, Square, Check, CheckCheck, Sparkles, Gauge, ShieldCheck, SignalHigh } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AudioBubble from "@/components/AudioBubble";
import { useLiveBroadcast } from "@/hooks/useLiveBroadcast";

interface LiveMessage {
  id: string;
  username: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  status?: "sending" | "delivered" | "read";
}

export default function LivePage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [phase, setPhase] = useState<"prep" | "live" | "ended">("prep");
  const [title, setTitle] = useState("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [liveId, setLiveId] = useState<string | null>(null);
  const [viewers, setViewers] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [viewerPeak, setViewerPeak] = useState(0);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "delivered" | "error">("idle");
  const [typing, setTyping] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [liveQuality, setLiveQuality] = useState<"eco" | "auto" | "hd">("auto");
  const [liveEffect, setLiveEffect] = useState<"none" | "pop" | "cinema">("none");
  const [permissionStatus, setPermissionStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");

  const frameIntervalMs = liveQuality === "eco" ? 1500 : liveQuality === "hd" ? 650 : 900;
  const audioChunkMs = liveQuality === "eco" ? 3600 : 2400;
  const { status: broadcastStatus } = useLiveBroadcast({
    liveId,
    stream,
    videoElement: videoRef.current,
    enabled: phase === "live",
    frameIntervalMs,
    audioChunkMs,
  });

  const startPreview = useCallback(async (manual = false): Promise<MediaStream | null> => {
    if (!manual && localStorage.getItem("permission-prompt:live-media") === "denied") {
      setPermissionStatus("denied");
      return null;
    }
    try {
      setPermissionStatus("requesting");
      localStorage.setItem("permission-prompt:live-media", "asked");
      const currentStream = videoRef.current?.srcObject as MediaStream | null;
      currentStream?.getTracks().forEach(t => t.stop());
      const videoProfile = liveQuality === "eco"
        ? { width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } }
        : liveQuality === "hd"
          ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 60 } };
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, ...videoProfile },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 2 },
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
      setPermissionStatus("granted");
      localStorage.setItem("permission-prompt:live-media", "granted");
      return s;
    } catch {
      setPermissionStatus("denied");
      localStorage.setItem("permission-prompt:live-media", "denied");
      toast.error("Autorise la caméra et le micro pour passer en live");
      return null;
    }
  }, [facingMode, liveQuality]);

  useEffect(() => {
    startPreview();
    return () => {
      const currentStream = videoRef.current?.srcObject as MediaStream | null;
      currentStream?.getTracks().forEach(t => t.stop());
    };
  }, [startPreview]);

  useEffect(() => {
    if (phase !== "live") return;
    const interval = setInterval(() => setDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    const interval = setInterval(() => {
      setXpEarned(x => x + 5 + Math.floor(viewers * 0.5));
    }, 15000);
    return () => clearInterval(interval);
  }, [phase, viewers]);

  useEffect(() => {
    if (phase !== "live" || !liveId) return;
    const interval = setInterval(async () => {
      const liveViewers = Math.max(1, Math.floor(1 + Math.random() * 8 + duration / 45));
      setViewers(liveViewers);
      setViewerPeak(p => Math.max(p, liveViewers));
      await supabase.from("lives").update({ viewers_count: liveViewers, xp_earned: xpEarned }).eq("id", liveId);
    }, 5000);
    return () => clearInterval(interval);
  }, [phase, liveId, duration, xpEarned]);

  useEffect(() => {
    if (!liveId) return;
    const channel = supabase
      .channel(`live-chat-${liveId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "live_messages", filter: `live_id=eq.${liveId}` }, (payload) => {
        const msg = payload.new as any;
        setMessages(prev => [...prev.slice(-100), { id: msg.id, username: msg.user_id.slice(0, 8), content: msg.content, mediaUrl: msg.media_url || undefined, mediaType: msg.media_type || undefined }]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [liveId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const goLive = async () => {
    if (!user) return;
    const activeStream = stream || await startPreview(true);
    if (!activeStream) return;
    const { data, error } = await (supabase as any).from("lives").insert({
      user_id: user.id,
      title: title.trim() || "Live de " + (profile?.display_name || "Utilisateur"),
      quality_profile: liveQuality,
      stream_health: "starting",
    }).select("id").single();
    if (error || !data) { toast.error("Impossible de démarrer le live"); return; }
    setLiveId(data.id);
    setPhase("live");
    toast.success("Tu es en live ! 🔴");
  };

  const endLive = async () => {
    if (liveId) {
      // First mark inactive so viewers are notified to exit
      await supabase.from("lives").update({
        is_active: false,
        ended_at: new Date().toISOString(),
        xp_earned: xpEarned,
        viewers_count: viewerPeak || viewers,
      }).eq("id", liveId);
      // Delete chat history + the live row itself (RLS permits the live owner)
      try {
        await supabase.from("live_messages").delete().eq("live_id", liveId);
        await supabase.from("lives").delete().eq("id", liveId);
      } catch { /* noop — viewers already got the "ended" signal */ }
    }
    stream?.getTracks().forEach(t => t.stop());
    setPhase("ended");
  };

  const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMicOn(prev => !prev);
    }
  };

  const toggleCam = () => {
    if (stream) {
      stream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsCamOn(prev => !prev);
    }
  };

  const flipCamera = () => {
    stream?.getTracks().forEach(t => t.stop());
    setFacingMode(prev => prev === "user" ? "environment" : "user");
  };

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
    if (isRecordingAudio) { audioRecorderRef.current?.stop(); setIsRecordingAudio(false); return; }
    if (!liveId || !user) return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 2 } });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(s, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 192000 });
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        s.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm;codecs=opus" });
        if (blob.size < 1000) return;
        const path = `${user.id}/live-audio/${crypto.randomUUID()}.webm`;
        setSendState("sending");
        const { error } = await supabase.storage.from("media").upload(path, blob, { contentType: "audio/webm" });
        if (error) { setSendState("error"); toast.error("Vocal live impossible"); return; }
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        const { error: insertError } = await supabase.from("live_messages").insert({ live_id: liveId, user_id: user.id, content: "🎤 Vocal live", media_url: data.publicUrl, media_type: "audio/webm" } as any);
        setSendState(insertError ? "error" : "delivered");
        setTimeout(() => setSendState("idle"), 1200);
      };
      audioRecorderRef.current = mr;
      mr.start();
      setIsRecordingAudio(true);
    } catch { toast.error("Autorise le micro pour envoyer un vocal live"); }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const statusIcon = sendState === "sending" ? <Check className="h-3 w-3 text-muted-foreground" /> : sendState === "delivered" ? <CheckCheck className="h-3 w-3 text-accent" /> : null;

  if (phase === "ended") {
    return (
      <div className="min-h-[100svh] bg-background flex items-center justify-center px-4">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-2xl p-8 max-w-sm w-full text-center">
          <Trophy className="h-16 w-16 text-accent mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Live terminé !</h2>
          <div className="grid grid-cols-3 gap-4 my-6">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{fmt(duration)}</p>
              <p className="text-xs text-muted-foreground">Durée</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{viewers}</p>
              <p className="text-xs text-muted-foreground">Vues max</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-accent">{xpEarned}</p>
              <p className="text-xs text-muted-foreground">XP gagnés</p>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate("/live")} className="w-full rounded-xl gradient-primary py-3 text-sm font-bold text-primary-foreground">
            Retour à l'accueil
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-shell-height fixed inset-x-0 top-0 z-50 flex flex-col bg-background">
      <video ref={videoRef} className={`absolute inset-0 w-full h-full object-contain bg-background ${liveEffect === "pop" ? "saturate-150 contrast-125" : liveEffect === "cinema" ? "contrast-125 brightness-90" : ""}`} muted playsInline autoPlay style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }} />

      {/* Top bar */}
      <div className="fullscreen-safe-top relative z-10 flex items-center justify-between px-4">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => { if (phase === "live") endLive(); else { stream?.getTracks().forEach(t => t.stop()); navigate(-1); } }}>
          {phase === "live" ? <X className="h-6 w-6 text-foreground drop-shadow" /> : <ArrowLeft className="h-6 w-6 text-foreground drop-shadow" />}
        </motion.button>

        {phase === "live" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
              <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-bold text-foreground">{fmt(duration)}</span>
            </div>
            <div className="flex items-center gap-1 glass rounded-full px-3 py-1">
              <Users className="h-3.5 w-3.5 text-foreground" />
              <span className="text-xs font-bold text-foreground">{viewers}</span>
            </div>
            <div className="flex items-center gap-1 glass rounded-full px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-bold text-accent">{xpEarned} XP</span>
            </div>
            <div className="hidden items-center gap-1 glass rounded-full px-3 py-1 min-[390px]:flex">
              <SignalHigh className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-bold text-foreground">{broadcastStatus}</span>
            </div>
          </div>
        )}

        <motion.button whileTap={{ scale: 0.9 }} onClick={flipCamera} className="glass rounded-full p-2">
          <RotateCcw className="h-5 w-5 text-foreground" />
        </motion.button>
      </div>

      {/* Prep overlay */}
      {phase === "prep" && (
        <div className="fullscreen-safe-bottom relative z-10 flex flex-1 items-end justify-center px-4">
          <div className="w-full max-w-sm space-y-4">
            <div className="glass rounded-2xl px-4 py-3 text-center">
              <Radio className="mx-auto mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-bold text-foreground">Préparation du live</p>
              <p className="text-xs text-muted-foreground">Caméra, micro, chat et XP temps réel prêts.</p>
            </div>
            <div className="glass rounded-2xl p-3">
              <div className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-card px-3 py-2 text-[11px] font-bold text-foreground">
                <ShieldCheck className={`h-4 w-4 ${permissionStatus === "granted" ? "text-primary" : permissionStatus === "denied" ? "text-destructive" : "text-accent"}`} />
                {permissionStatus === "granted" ? "Camera et micro prets" : permissionStatus === "denied" ? "Autorisation requise" : "Verification permissions"}
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2">
                {(["eco", "auto", "hd"] as const).map(q => (
                  <button key={q} type="button" onClick={() => setLiveQuality(q)} className={`flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-bold ${liveQuality === q ? "gradient-primary text-primary-foreground" : "bg-card text-foreground"}`}>
                    <Gauge className="h-3.5 w-3.5" /> {q.toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(["none", "pop", "cinema"] as const).map(f => (
                  <button key={f} type="button" onClick={() => setLiveEffect(f)} className={`flex items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-bold ${liveEffect === f ? "bg-primary/20 text-primary" : "bg-card text-foreground"}`}>
                    <Sparkles className="h-3.5 w-3.5" /> {f === "none" ? "Normal" : f === "cinema" ? "Cine" : "Pop"}
                  </button>
                ))}
              </div>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre du live... 🎬" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none text-center" />
            {permissionStatus === "denied" && (
              <motion.button whileTap={{ scale: 0.95 }} onClick={() => startPreview(true)} className="w-full rounded-2xl bg-card py-3 text-sm font-bold text-foreground">
                Autoriser camera/micro
              </motion.button>
            )}
            <motion.button whileTap={{ scale: 0.95 }} onClick={goLive} className="w-full rounded-2xl gradient-primary py-4 text-lg font-bold text-primary-foreground pulse-glow flex items-center justify-center gap-2">
              <Video className="h-5 w-5" /> Passer en Live
            </motion.button>
          </div>
        </div>
      )}

      {/* Live controls & chat */}
      {phase === "live" && (
        <>
          <div className="mobile-live-controls absolute right-3 z-20 flex flex-col gap-3">
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleMic} className="glass rounded-full p-3">
              {isMicOn ? <Mic className="h-5 w-5 text-foreground" /> : <MicOff className="h-5 w-5 text-destructive" />}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleCam} className="glass rounded-full p-3">
              {isCamOn ? <Camera className="h-5 w-5 text-foreground" /> : <CameraOff className="h-5 w-5 text-destructive" />}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={endLive} className="rounded-full bg-destructive p-3">
              <X className="h-5 w-5 text-destructive-foreground" />
            </motion.button>
          </div>

          <div className="absolute bottom-0 left-0 right-16 z-10 flex max-h-[42vh] flex-col">
            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-2 space-y-1">
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass rounded-lg px-3 py-1.5 inline-block max-w-[85%]">
                  <span className="text-xs font-bold text-primary">@{msg.username}</span>{" "}
                  <span className="text-xs text-foreground">{msg.content}</span>
                  {msg.mediaUrl && msg.mediaType?.startsWith("audio") && <div className="mt-1"><AudioBubble src={msg.mediaUrl} compact /></div>}
                </motion.div>
              ))}
              {(typing || isRecordingAudio || sendState !== "idle") && <p className="px-2 text-[11px] text-muted-foreground">{isRecordingAudio ? "Vocal en cours…" : sendState === "sending" ? "Envoi…" : typing ? "En train d'écrire…" : "Livré"}</p>}
              <div ref={chatEndRef} />
            </div>
            <div className="fullscreen-safe-bottom px-4">
              <div className="glass rounded-full flex items-center px-4 py-2">
                <input value={newMsg} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onChange={e => { setNewMsg(e.target.value); setTyping(e.target.value.length > 0); }} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Commenter..." className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
                <motion.button whileTap={{ scale: 0.9 }} onClick={toggleAudioMessage} className="mr-2">
                  {isRecordingAudio ? <Square className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-accent" />}
                </motion.button>
                {statusIcon}
                <motion.button whileTap={{ scale: 0.9 }} onClick={sendMessage}>
                  <Send className="h-4 w-4 text-primary" />
                </motion.button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
