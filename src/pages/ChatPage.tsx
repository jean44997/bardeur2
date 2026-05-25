import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Smile, Image as ImageIcon, Mic, MicOff, Phone, Video, Check, CheckCheck, Square, Trash2, MoreVertical, Flag, Ban } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AudioBubble from "@/components/AudioBubble";
import { getBestAudioRecorderOptions } from "@/lib/mediaCapabilities";
import { checkClientRateLimit, formatRetryAfter } from "@/lib/clientRateLimit";
import { looksLikeRepeatedSpam, validateUploadFile, validateUserText } from "@/lib/contentSafety";
import { decryptMessageContent, encryptMessageContent, isEncryptedContent } from "@/lib/messageCrypto";

interface Message {
  id: string;
  text: string;
  fromMe: boolean;
  time: string;
  status: "sent" | "delivered" | "read";
  mediaUrl?: string;
  mediaType?: string;
}

const quickEmojis = ["❤️", "🔥", "😂", "😍", "👏", "🤯", "💀", "🙏", "😭", "🥰", "💯", "🎉"];

export default function ChatPage() {
  const navigate = useNavigate();
  const { id: conversationId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [otherUserName, setOtherUserName] = useState("Conversation");
  const [loading, setLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockedByThem, setBlockedByThem] = useState(false);
  const [showSafetyMenu, setShowSafetyMenu] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const cancelledAudioRef = useRef(false);
  const recentTextRef = useRef<string[]>([]);

  useEffect(() => {
    if (conversationId && user) {
      fetchMessages();
      fetchOtherUser();
      markAsRead();

      const channel = supabase
        .channel(`messages-${conversationId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, () => {
          fetchMessages();
          markAsRead();
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [conversationId, user]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Recording timer
  useEffect(() => {
    if (!isRecordingAudio) { setRecordingTime(0); return; }
    const interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecordingAudio]);

  useEffect(() => {
    if (isRecordingAudio && recordingTime >= 60) {
      stopAudioRecording();
      toast.info("Vocal limité à 60 secondes");
    }
  }, [isRecordingAudio, recordingTime]);

  const mapMessage = async (m: any): Promise<Message> => {
    const content = m.content || "";
    return {
      id: m.id,
      text: isEncryptedContent(content) && conversationId ? await decryptMessageContent(content, conversationId) : content,
      fromMe: m.sender_id === user?.id,
      time: new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      status: m.is_read ? "read" : "delivered",
      mediaUrl: m.media_url || undefined,
      mediaType: m.media_type || undefined,
    };
  };

  const fetchMessages = async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (data) setMessages(await Promise.all(data.map(mapMessage)));
    setLoading(false);
  };

  const fetchOtherUser = async () => {
    if (!conversationId || !user) return;
    const { data } = await supabase.from("conversation_participants").select("user_id, profiles:user_id(display_name)").eq("conversation_id", conversationId).neq("user_id", user.id);
    if (data?.[0]) {
      const targetId = (data[0] as any).user_id;
      setOtherUserId(targetId);
      setOtherUserName((data[0] as any).profiles?.display_name || "Utilisateur");
      checkBlockStatus(targetId);
    }
  };

  const checkBlockStatus = async (targetId = otherUserId) => {
    if (!user || !targetId) return;
    const { data } = await (supabase as any)
      .from("user_blocks")
      .select("blocker_id, blocked_id")
      .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${user.id})`);
    const blocks = data || [];
    setIsBlocked(blocks.some((b: any) => b.blocker_id === user.id));
    setBlockedByThem(blocks.some((b: any) => b.blocker_id === targetId));
  };

  const markAsRead = async () => {
    if (!conversationId || !user) return;
    await Promise.all([
      supabase.from("messages").update({ is_read: true }).eq("conversation_id", conversationId).neq("sender_id", user.id).eq("is_read", false),
      supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("type", "message").eq("reference_id", conversationId).eq("is_read", false),
    ]);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !user || !conversationId || isBlocked || blockedByThem) return;

    const rate = checkClientRateLimit({
      key: `chat:${conversationId}:${user.id}`,
      limit: 12,
      windowMs: 60_000,
      cooldownMs: 600,
      blockMs: 30_000,
    });
    if (!rate.allowed) {
      toast.error(`Trop rapide, réessaie dans ${formatRetryAfter(rate.retryAfterMs)}`);
      return;
    }

    const validation = validateUserText(newMsg, { maxLength: 500, allowLinks: false });
    if (!validation.ok) {
      toast.error(validation.reason || "Message refusé");
      return;
    }
    if (looksLikeRepeatedSpam(validation.value, recentTextRef.current)) {
      toast.error("Message répété bloqué");
      return;
    }

    const encryptedContent = await encryptMessageContent(validation.value, conversationId);
    const { error } = await (supabase as any).from("messages").insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: encryptedContent,
      encrypted_content: encryptedContent !== validation.value,
      content_version: encryptedContent !== validation.value ? "bdenc_v1" : "plain",
    });
    if (error) {
      toast.error(error.message?.includes("rate") ? "Rate-limit serveur atteint" : "Message impossible");
      return;
    }

    recentTextRef.current = [validation.value, ...recentTextRef.current].slice(0, 6);
    setNewMsg("");
  };

  const sendImage = async (file?: File | null) => {
    if (!file || !user || !conversationId) return;
    const fileCheck = validateUploadFile(file, { maxBytes: 8 * 1024 * 1024, acceptedPrefixes: ["image/"] });
    if (!fileCheck.ok) { toast.error(fileCheck.reason); return; }
    const rate = checkClientRateLimit({ key: `chat-media:${conversationId}:${user.id}`, limit: 6, windowMs: 60_000, blockMs: 45_000 });
    if (!rate.allowed) { toast.error(`Upload ralenti, réessaie dans ${formatRetryAfter(rate.retryAfterMs)}`); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/chat/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      await (supabase as any).from("messages").insert({ conversation_id: conversationId, sender_id: user.id, content: "", media_url: data.publicUrl, media_type: file.type || "image/*", content_version: "plain" });
      toast.success("Image envoyée");
    } catch { toast.error("Impossible d'envoyer l'image"); }
    finally { setUploadingImage(false); if (imageInputRef.current) imageInputRef.current.value = ""; }
  };

  const startAudioRecording = async () => {
    if (!user || !conversationId || isBlocked || blockedByThem) return;
    const rate = checkClientRateLimit({ key: `chat-audio:${conversationId}:${user.id}`, limit: 5, windowMs: 60_000, blockMs: 45_000 });
    if (!rate.allowed) { toast.error(`Vocaux ralentis, réessaie dans ${formatRetryAfter(rate.retryAfterMs)}`); return; }
    try {
      const recorderOptions = getBestAudioRecorderOptions(160000);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 } });
      audioStreamRef.current = stream;
      audioChunksRef.current = [];
      cancelledAudioRef.current = false;
      const mr = new MediaRecorder(stream, recorderOptions.options);
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (cancelledAudioRef.current) { audioChunksRef.current = []; cancelledAudioRef.current = false; return; }
        const blob = new Blob(audioChunksRef.current, { type: recorderOptions.contentType });
        if (blob.size < 1000) { toast.info("Audio trop court"); return; }
        await sendAudioBlob(blob, recorderOptions.extension, recorderOptions.contentType);
      };
      mr.start(250);
      audioRecorderRef.current = mr;
      setIsRecordingAudio(true);
    } catch {
      toast.error("Autorise l'accès au micro");
    }
  };

  const stopAudioRecording = () => {
    audioRecorderRef.current?.stop();
    setIsRecordingAudio(false);
  };

  const cancelAudioRecording = () => {
    cancelledAudioRef.current = true;
    audioRecorderRef.current?.stop();
    audioStreamRef.current?.getTracks().forEach(t => t.stop());
    audioChunksRef.current = [];
    setIsRecordingAudio(false);
  };

  const sendAudioBlob = async (blob: Blob, extension = "webm", contentType = "audio/webm") => {
    if (!user || !conversationId) return;
    try {
      const path = `${user.id}/audio/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, blob, { contentType });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      await (supabase as any).from("messages").insert({ conversation_id: conversationId, sender_id: user.id, content: "🎤 Message vocal", media_url: data.publicUrl, media_type: contentType, content_version: "plain" });
      toast.success("Vocal envoyé 🎤");
    } catch { toast.error("Erreur envoi vocal"); }
  };

  const deleteMessage = async (msgId: string) => {
    if (!user) return;
    await supabase.from("messages").update({ content: "Message supprimé", content_version: "plain" } as any).eq("id", msgId).eq("sender_id", user.id);
    fetchMessages();
  };

  const toggleBlockUser = async () => {
    if (!user || !otherUserId) return;
    if (isBlocked) {
      await (supabase as any).from("user_blocks").delete().eq("blocker_id", user.id).eq("blocked_id", otherUserId);
      setIsBlocked(false);
      toast.success("Utilisateur débloqué");
    } else {
      await (supabase as any).from("user_blocks").insert({ blocker_id: user.id, blocked_id: otherUserId, reason: "Bloqué depuis le chat" });
      setIsBlocked(true);
      toast.success("Utilisateur bloqué");
    }
    setShowSafetyMenu(false);
  };

  const reportConversation = async () => {
    if (!user || !otherUserId) return;
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: otherUserId,
      type: "message",
      reason: "Signalement depuis une conversation privée",
      status: "pending",
    });
    if (error) toast.error("Signalement impossible");
    else toast.success("Signalement envoyé");
    setShowSafetyMenu(false);
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "read") return <CheckCheck className="h-3 w-3 text-accent" />;
    if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    return <Check className="h-3 w-3 text-muted-foreground" />;
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-[100svh] bg-background md:pl-[var(--sidebar-width,260px)]">
      <div className="glass border-b border-border px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] flex items-center gap-3 z-10">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/inbox")}>
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </motion.button>
        <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-secondary-foreground">
          {otherUserName[0]}
        </div>
        <div className="flex-1">
          <span className="text-sm font-semibold text-foreground">{otherUserName}</span>
          {(isBlocked || blockedByThem) && (
            <p className="text-[11px] text-destructive">{isBlocked ? "Bloqué par toi" : "Messages bloqués"}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => toast.info("Appels bientôt disponibles")}>
            <Phone className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => toast.info("Appels vidéo bientôt disponibles")}>
            <Video className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowSafetyMenu(p => !p)} aria-label="Options sécurité">
            <MoreVertical className="h-5 w-5 text-muted-foreground" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showSafetyMenu && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="z-10 overflow-hidden border-b border-border bg-card/95 px-4 py-3">
            <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">
              <button onClick={reportConversation} className="flex items-center justify-center gap-2 rounded-xl bg-destructive/15 px-3 py-2 text-xs font-semibold text-destructive">
                <Flag className="h-4 w-4" /> Signaler
              </button>
              <button onClick={toggleBlockUser} className="flex items-center justify-center gap-2 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground">
                <Ban className="h-4 w-4" /> {isBlocked ? "Débloquer" : "Bloquer"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3">
        {loading ? (
          <div className="text-center py-8">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Dis bonjour ! 👋</p>
        ) : (
          messages.map(msg => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex ${msg.fromMe ? "justify-end" : "justify-start"} group`}>
              <div className="max-w-[75%] relative">
                <div className={`px-4 py-2.5 text-sm ${msg.fromMe ? "gradient-primary text-primary-foreground rounded-2xl rounded-br-sm" : "glass text-foreground rounded-2xl rounded-bl-sm"}`}>
                  {msg.mediaUrl && msg.mediaType?.startsWith("image") && (
                    <img src={msg.mediaUrl} alt="" className="mb-2 max-h-64 w-full rounded-xl object-cover" loading="lazy" />
                  )}
                  {msg.mediaUrl && msg.mediaType?.startsWith("audio") && (
                    <div className="mb-1"><AudioBubble src={msg.mediaUrl} /></div>
                  )}
                  {msg.text && msg.text !== "Message supprimé" ? msg.text : msg.text === "Message supprimé" ? <span className="italic opacity-60">{msg.text}</span> : null}
                </div>
                <div className={`flex items-center gap-1 mt-0.5 ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                  {msg.fromMe && <StatusIcon status={msg.status} />}
                </div>
                {msg.fromMe && msg.text !== "Message supprimé" && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => deleteMessage(msg.id)}
                    className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-full bg-card"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </motion.button>
                )}
              </div>
            </motion.div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <AnimatePresence>
        {showEmojis && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-4 py-2 border-t border-border flex gap-2 justify-center flex-wrap">
            {quickEmojis.map(e => (
              <motion.button key={e} whileTap={{ scale: 1.4 }} onClick={() => setNewMsg(p => p + e)} className="text-xl">{e}</motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={e => sendImage(e.target.files?.[0])} />

        {(isBlocked || blockedByThem) && (
          <div className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">
            {isBlocked ? "Tu as bloqué cette conversation. Débloque pour réécrire." : "Cette conversation ne peut plus recevoir de messages."}
          </div>
        )}

        {isRecordingAudio ? (
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.9 }} onClick={cancelAudioRecording}>
              <Trash2 className="h-5 w-5 text-destructive" />
            </motion.button>
            <div className="flex-1 glass rounded-full flex items-center px-4 py-2.5 gap-2">
              <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
              <span className="text-sm font-medium text-foreground">{fmtTime(recordingTime)}</span>
              <span className="text-xs text-muted-foreground flex-1">Enregistrement...</span>
            </div>
            <motion.button whileTap={{ scale: 0.85 }} onClick={stopAudioRecording} className="rounded-full p-2.5 gradient-primary">
              <Send className="h-4 w-4 text-primary-foreground" />
            </motion.button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowEmojis(p => !p)}>
              <Smile className="h-5 w-5 text-muted-foreground" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => imageInputRef.current?.click()} disabled={uploadingImage || isBlocked || blockedByThem}>
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </motion.button>
            <div className="flex-1 glass rounded-full flex items-center px-4 py-2.5">
              <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} placeholder={isBlocked || blockedByThem ? "Conversation bloquée" : "Message..."} disabled={isBlocked || blockedByThem} maxLength={500} className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50" />
            </div>
            {newMsg.trim() ? (
              <motion.button whileTap={{ scale: 0.85 }} onClick={sendMessage} disabled={isBlocked || blockedByThem} className="rounded-full p-2.5 gradient-primary disabled:opacity-40">
                <Send className="h-4 w-4 text-primary-foreground" />
              </motion.button>
            ) : (
              <motion.button whileTap={{ scale: 0.85 }} onClick={startAudioRecording} disabled={isBlocked || blockedByThem} className="rounded-full p-2.5 bg-secondary disabled:opacity-40">
                <Mic className="h-4 w-4 text-muted-foreground" />
              </motion.button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
