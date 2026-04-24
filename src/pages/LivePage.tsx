import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Video, Mic, MicOff, Camera, CameraOff, Send, Users, X, Zap, Trophy, RotateCcw, Radio, Square, Check, CheckCheck } from "lucide-react";
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
  const [activeLives, setActiveLives] = useState<any[]>([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

  useLiveBroadcast({
    liveId,
    stream,
    videoElement: videoRef.current,
    enabled: phase === "live",
  });

  const startPreview = useCallback(async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 2 },
      });
      setStream(s);
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.play();
      }
    } catch {
      toast.error("Autorise la caméra et le micro pour passer en live");
    }
  }, [facingMode]);

  useEffect(() => {
    startPreview();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [facingMode]);

  useEffect(() => {
    const fetchActiveLives = async () => {
      const { data } = await supabase
        .from("lives")
        .select("*, profiles:user_id(username, display_name, avatar_url)")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(20);
      setActiveLives(data || []);
    };
    fetchActiveLives();
    const channel = supabase.channel("live-room-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "lives" }, fetchActiveLives)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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
    const { data, error } = await supabase.from("lives").insert({
      user_id: user.id,
      title: title.trim() || "Live de " + (profile?.display_name || "Utilisateur"),
    }).select("id").single();
    if (error || !data) { toast.error("Impossible de démarrer le live"); return; }
    setLiveId(data.id);
    setPhase("live");
    toast.success("Tu es en live ! 🔴");
  };

  const endLive = async () => {
    if (liveId) {
      await supabase.from("lives").update({
        is_active: false,
        ended_at: new Date().toISOString(),
        xp_earned: xpEarned,
        viewers_count: viewerPeak || viewers,
      }).eq("id", liveId);
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
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain bg-background" muted playsInline autoPlay style={{ transform: facingMode === "user" ? "scaleX(-1)" : "none" }} />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
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
          </div>
        )}

        <motion.button whileTap={{ scale: 0.9 }} onClick={flipCamera} className="glass rounded-full p-2">
          <RotateCcw className="h-5 w-5 text-foreground" />
        </motion.button>
      </div>

      {/* Prep overlay */}
      {phase === "prep" && (
        <div className="relative z-10 flex-1 flex items-end justify-center pb-12 px-4">
          <div className="w-full max-w-sm space-y-4">
            {activeLives.length > 0 && (
              <div className="glass rounded-2xl p-3">
                <p className="mb-2 text-xs font-bold uppercase text-muted-foreground">Lives maintenant</p>
                <div className="max-h-32 space-y-2 overflow-y-auto no-scrollbar">
                  {activeLives.map(l => (
                    <button key={l.id} onClick={() => navigate(`/live/${l.id}`)} className="flex w-full items-center gap-2 rounded-xl bg-card px-3 py-2 text-left">
                      <span className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full gradient-primary text-xs font-bold text-primary-foreground">
                        {l.profiles?.avatar_url ? <img src={l.profiles.avatar_url} alt="" className="h-full w-full object-cover" /> : (l.profiles?.display_name || "L")[0]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-bold text-foreground">{l.title || `Live de ${l.profiles?.display_name || "Utilisateur"}`}</span>
                        <span className="block text-[10px] text-muted-foreground">{l.viewers_count || 0} spectateurs · @{l.profiles?.username}</span>
                      </span>
                      <span className="rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold text-destructive-foreground">LIVE</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="glass rounded-2xl px-4 py-3 text-center">
              <Radio className="mx-auto mb-2 h-5 w-5 text-primary" />
              <p className="text-sm font-bold text-foreground">Préparation du live</p>
              <p className="text-xs text-muted-foreground">Caméra, micro, chat et XP temps réel prêts.</p>
            </div>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre du live... 🎬" className="w-full glass rounded-xl px-4 py-3 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none text-center" />
            <motion.button whileTap={{ scale: 0.95 }} onClick={goLive} className="w-full rounded-2xl gradient-primary py-4 text-lg font-bold text-primary-foreground pulse-glow flex items-center justify-center gap-2">
              <Video className="h-5 w-5" /> Passer en Live
            </motion.button>
          </div>
        </div>
      )}

      {/* Live controls & chat */}
      {phase === "live" && (
        <>
          <div className="absolute right-3 bottom-32 z-20 flex flex-col gap-3">
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

          <div className="absolute bottom-0 left-0 right-16 z-10 max-h-[40vh] flex flex-col">
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
            <div className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
