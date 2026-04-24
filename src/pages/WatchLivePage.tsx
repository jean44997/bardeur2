import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Users, Send, Heart, Mic, Square, Check, CheckCheck, Volume2, VolumeX } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AudioBubble from "@/components/AudioBubble";

interface LiveMsg { id: string; username: string; content: string; mediaUrl?: string; mediaType?: string; }

const FRAME_BASE = "https://imgqkcvojnalanrlanld.supabase.co/storage/v1/object/public/media/live-stream";

export default function WatchLivePage() {
  const navigate = useNavigate();
  const { id: liveId } = useParams();
  const { user } = useAuth();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastSeqRef = useRef(-1);

  const [live, setLive] = useState<any>(null);
  const [streamerName, setStreamerName] = useState("");
  const [streamerAvatar, setStreamerAvatar] = useState("");
  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [hearts, setHearts] = useState<string[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [sendState, setSendState] = useState<"idle" | "sending" | "delivered" | "error">("idle");
  const [typing, setTyping] = useState(false);
  const [frameSrc, setFrameSrc] = useState<string>("");
  const [audioMuted, setAudioMuted] = useState(false);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    if (!liveId) return;
    const fetchLive = async () => {
      const { data } = await supabase.from("lives").select("*").eq("id", liveId).single();
      if (data) {
        setLive(data);
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
        if (!updated.is_active) toast.info("Le live est terminé");
      })
      .subscribe();

    // Live stream broadcast channel (frames + audio chunks)
    const streamChannel = supabase.channel(`live-stream-${liveId}`, { config: { broadcast: { self: false } } });
    streamChannel
      .on("broadcast", { event: "frame" }, () => {
        setFrameSrc(`${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`);
      })
      .on("broadcast", { event: "audio" }, ({ payload }: any) => {
        if (!payload?.url || audioMuted) return;
        if (typeof payload.seq === "number" && payload.seq <= lastSeqRef.current) return;
        lastSeqRef.current = payload.seq ?? lastSeqRef.current;
        const audio = liveAudioRef.current;
        if (audio) {
          audio.src = payload.url;
          audio.play().catch(() => { /* autoplay blocked, user must tap */ });
        }
      })
      .subscribe();

    // Initial frame fetch (in case streamer already broadcasting before we joined)
    setFrameSrc(`${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`);
    const pollTimer = window.setInterval(() => {
      setFrameSrc(`${FRAME_BASE}/${liveId}/frame.jpg?t=${Date.now()}`);
    }, 2500);

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(streamChannel);
      window.clearInterval(pollTimer);
    };
  }, [liveId, audioMuted]);

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
        setSendState("sending");
        const path = `${user.id}/watch-live-audio/${crypto.randomUUID()}.webm`;
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

  const sendHeart = () => {
    const id = crypto.randomUUID();
    setHearts(prev => [...prev, id]);
    setTimeout(() => setHearts(prev => prev.filter(h => h !== id)), 1500);
  };

  if (!live) return (
    <div className="min-h-[100svh] bg-background flex items-center justify-center">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );

  const statusIcon = sendState === "sending" ? <Check className="h-3 w-3 text-muted-foreground" /> : sendState === "delivered" ? <CheckCheck className="h-3 w-3 text-accent" /> : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Live frame */}
      {frameSrc && (
        <img
          src={frameSrc}
          alt="Live"
          className="absolute inset-0 h-full w-full object-contain bg-background"
          onLoad={() => setHasFrame(true)}
          onError={() => setHasFrame(false)}
        />
      )}
      {!hasFrame && (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-background via-card to-background">
          <div className="flex flex-col items-center gap-3">
            <div className="h-20 w-20 rounded-full overflow-hidden gradient-primary grid place-items-center text-2xl font-bold text-primary-foreground ring-4 ring-destructive">
              {streamerAvatar ? <img src={streamerAvatar} alt="" className="h-full w-full object-cover" /> : streamerName[0]}
            </div>
            <p className="text-sm font-bold text-foreground">{streamerName}</p>
            <p className="text-xs text-muted-foreground">Connexion au live…</p>
          </div>
        </div>
      )}

      {/* Hidden audio element receiving live audio chunks */}
      <audio ref={liveAudioRef} autoPlay playsInline />

      {/* Top gradient for legibility */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40 bg-gradient-to-b from-background/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-64 bg-gradient-to-t from-background/90 to-transparent" />

      {hearts.map(id => (
        <motion.div key={id} initial={{ opacity: 1, y: 0, x: "70vw" }} animate={{ opacity: 0, y: -200 }} transition={{ duration: 1.5 }} className="absolute bottom-40 z-30">
          <Heart className="h-8 w-8 fill-primary text-primary" />
        </motion.div>
      ))}

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="glass rounded-full p-2" aria-label="Retour">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </motion.button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 glass rounded-full px-3 py-1">
            <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs font-bold text-foreground">LIVE</span>
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

      {/* Chat */}
      <div className="relative z-10 mt-auto flex max-h-[55vh] flex-col">
        <div className="no-scrollbar flex-1 space-y-1 overflow-y-auto px-4 pb-2">
          {messages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="glass inline-block max-w-[85%] rounded-lg px-3 py-1.5">
              <span className="text-xs font-bold text-primary">@{msg.username}</span>{" "}
              <span className="text-xs text-foreground">{msg.content}</span>
              {msg.mediaUrl && msg.mediaType?.startsWith("audio") && <div className="mt-1"><AudioBubble src={msg.mediaUrl} compact /></div>}
            </motion.div>
          ))}
          {(typing || isRecordingAudio || sendState !== "idle") && <p className="px-2 text-[11px] text-muted-foreground">{isRecordingAudio ? "Vocal en cours…" : sendState === "sending" ? "Envoi…" : typing ? "En train d'écrire…" : "Livré"}</p>}
          <div ref={chatEndRef} />
        </div>
        <div className="flex items-center gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="glass flex flex-1 items-center rounded-full px-4 py-2">
            <input value={newMsg} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} onChange={e => { setNewMsg(e.target.value); setTyping(e.target.value.length > 0); }} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder="Commenter..." className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            <motion.button whileTap={{ scale: 0.9 }} onClick={toggleAudioMessage} className="mr-2" aria-label="Vocal">
              {isRecordingAudio ? <Square className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-accent" />}
            </motion.button>
            {statusIcon}
            <motion.button whileTap={{ scale: 0.9 }} onClick={sendMessage} aria-label="Envoyer">
              <Send className="h-4 w-4 text-primary" />
            </motion.button>
          </div>
          <motion.button whileTap={{ scale: 1.3 }} onClick={sendHeart} className="glass rounded-full p-2.5" aria-label="Envoyer un cœur">
            <Heart className="h-5 w-5 text-primary" />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
