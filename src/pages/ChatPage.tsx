import { useState, useRef, useEffect, type CSSProperties } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Smile, Image as ImageIcon, Mic, MicOff, Phone, Video, Check, CheckCheck, Trash2, MoreVertical, Flag, Ban, Flame, Wallpaper, PhoneOff, CameraOff, RotateCcw, Upload, Activity, BellRing, SignalHigh, Volume2, VolumeX, ShieldCheck } from "lucide-react";
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
  senderId?: string;
  createdAt?: string;
}

interface CallState {
  type: "audio" | "video";
  status: "requesting" | "ringing" | "connected";
  muted: boolean;
  cameraOff: boolean;
  speakerOn: boolean;
  quality: "HD" | "Auto" | "Eco";
}

const quickEmojis = ["❤️", "🔥", "😂", "😍", "👏", "🤯", "💀", "🙏", "😭", "🥰", "💯", "🎉"];
const chatBackgrounds = [
  { label: "Nuit", value: "radial-gradient(circle at top left, rgba(255,43,136,.22), transparent 35%), linear-gradient(160deg, #050505, #17121f 55%, #070707)" },
  { label: "Glace", value: "linear-gradient(135deg, rgba(125,211,252,.24), rgba(244,114,182,.18)), #07090f" },
  { label: "Studio", value: "linear-gradient(145deg, rgba(250,204,21,.16), rgba(34,197,94,.12)), #080808" },
  { label: "Sobre", value: "linear-gradient(180deg, #0b0b0f, #111827)" },
];

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
  const [chatBackground, setChatBackground] = useState(chatBackgrounds[0].value);
  const [customBackgroundUrl, setCustomBackgroundUrl] = useState("");
  const [streakDays, setStreakDays] = useState(0);
  const [streakNeedsReply, setStreakNeedsReply] = useState(false);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callAudioLevel, setCallAudioLevel] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const callStreamRef = useRef<MediaStream | null>(null);
  const callSessionRef = useRef<string | null>(null);
  const callFacingModeRef = useRef<"user" | "environment">("user");
  const ringtoneCtxRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<number | null>(null);
  const callMeterFrameRef = useRef<number | null>(null);
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
    if (!conversationId || !user) return;
    const key = `chat-bg:${conversationId}:${user.id}`;
    const local = localStorage.getItem(key);
    if (local) setChatBackground(local);

    void (async () => {
      try {
        const { data } = await (supabase as any)
          .from("chat_preferences")
          .select("background")
          .eq("conversation_id", conversationId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.background) {
          setChatBackground(data.background);
          localStorage.setItem(key, data.background);
        }
      } catch {
        // Preferences table may not exist until the latest migration is applied.
      }
    })();
  }, [conversationId, user]);

  useEffect(() => {
    if (!callState || !localVideoRef.current || callState.type !== "video") return;
    localVideoRef.current.srcObject = callStreamRef.current;
    localVideoRef.current.play().catch(() => {});
  }, [callState]);

  useEffect(() => {
    return () => {
      callStreamRef.current?.getTracks().forEach(t => t.stop());
      stopRingtone();
      if (callMeterFrameRef.current) cancelAnimationFrame(callMeterFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (callState?.status !== "connected") {
      setCallSeconds(0);
      return;
    }
    const interval = window.setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => window.clearInterval(interval);
  }, [callState?.status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!user || !otherUserId || messages.length === 0) {
      setStreakDays(0);
      setStreakNeedsReply(false);
      return;
    }
    const byDay = new Map<string, Set<string>>();
    messages.forEach((m) => {
      if (!m.senderId || !m.createdAt) return;
      const rawDate = m.createdAt;
      const dateKey = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
      const senders = byDay.get(dateKey) || new Set<string>();
      senders.add(m.senderId);
      byDay.set(dateKey, senders);
    });
    const qualifies = (date: Date) => {
      const senders = byDay.get(date.toISOString().slice(0, 10));
      return !!senders?.has(user.id) && !!senders?.has(otherUserId);
    };
    const cursor = new Date();
    let days = 0;
    if (!qualifies(cursor)) {
      const yesterday = new Date(cursor);
      yesterday.setDate(yesterday.getDate() - 1);
      if (qualifies(yesterday)) {
        setStreakNeedsReply(true);
        cursor.setDate(cursor.getDate() - 1);
      } else {
        setStreakDays(0);
        setStreakNeedsReply(false);
        return;
      }
    } else {
      setStreakNeedsReply(false);
    }
    while (qualifies(cursor)) {
      days += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    setStreakDays(days);
  }, [messages, otherUserId, user]);

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
      senderId: m.sender_id,
      createdAt: m.created_at,
    };
  };

  const fetchMessages = async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at", { ascending: true });
    if (data) {
      const hidden = loadHiddenIds();
      const mapped = await Promise.all(data.filter((m: any) => !hidden.has(m.id)).map(mapMessage));
      setMessages(mapped);
    }
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

  const hiddenStorageKey = () => (conversationId && user ? `chat-hidden:${conversationId}:${user.id}` : null);

  const loadHiddenIds = (): Set<string> => {
    const k = hiddenStorageKey();
    if (!k) return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(k) || "[]")); } catch { return new Set(); }
  };

  const persistHidden = (ids: Set<string>) => {
    const k = hiddenStorageKey();
    if (k) localStorage.setItem(k, JSON.stringify(Array.from(ids)));
  };

  const deleteForMe = (msgId: string) => {
    const ids = loadHiddenIds();
    ids.add(msgId);
    persistHidden(ids);
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setDeleteTarget(null);
    toast.success("Supprimé pour toi");
  };

  const deleteForBoth = async (msgId: string) => {
    if (!user) return;
    const { error } = await supabase.from("messages").delete().eq("id", msgId).eq("sender_id", user.id);
    if (error) { toast.error("Suppression impossible"); return; }
    setMessages(prev => prev.filter(m => m.id !== msgId));
    setDeleteTarget(null);
    toast.success("Message supprimé pour tous");
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

  const reportAndBlockConversation = async () => {
    if (!user || !otherUserId) return;
    await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: otherUserId,
      type: "message",
      reason: "Signalement + blocage depuis une conversation privee",
      status: "pending",
    });
    if (!isBlocked) {
      await (supabase as any).from("user_blocks").insert({ blocker_id: user.id, blocked_id: otherUserId, reason: "Signalement et blocage" });
      setIsBlocked(true);
    }
    toast.success("Signalement envoye et utilisateur bloque");
    setShowSafetyMenu(false);
  };

  const stopRingtone = () => {
    if (ringtoneTimerRef.current) window.clearInterval(ringtoneTimerRef.current);
    ringtoneTimerRef.current = null;
    ringtoneCtxRef.current?.close().catch(() => {});
    ringtoneCtxRef.current = null;
  };

  const startRingtone = () => {
    stopRingtone();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    ringtoneCtxRef.current = ctx;
    const beep = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.32);
    };
    beep();
    ringtoneTimerRef.current = window.setInterval(beep, 1250);
  };

  const startAudioMeter = (stream: MediaStream) => {
    if (callMeterFrameRef.current) cancelAnimationFrame(callMeterFrameRef.current);
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx || stream.getAudioTracks().length === 0) return;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
      setCallAudioLevel(Math.min(100, Math.round(avg * 1.4)));
      callMeterFrameRef.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const saveChatBackground = async (background: string) => {
    if (!conversationId || !user) return;
    setChatBackground(background);
    localStorage.setItem(`chat-bg:${conversationId}:${user.id}`, background);
    try {
      await (supabase as any)
        .from("chat_preferences")
        .upsert({ conversation_id: conversationId, user_id: user.id, background, updated_at: new Date().toISOString() }, { onConflict: "conversation_id,user_id" });
    } catch {
      // Keep the local wallpaper even if the preference sync is unavailable.
    }
    toast.success("Fond de chat appliqué");
  };

  const uploadChatBackground = async (file?: File | null) => {
    if (!file || !user || !conversationId) return;
    const fileCheck = validateUploadFile(file, { maxBytes: 6 * 1024 * 1024, acceptedPrefixes: ["image/"] });
    if (!fileCheck.ok) { toast.error(fileCheck.reason); return; }
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/chat-backgrounds/${conversationId}-${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      await saveChatBackground(`linear-gradient(180deg, rgba(0,0,0,.46), rgba(0,0,0,.76)), url("${data.publicUrl}") center / cover fixed`);
    } catch {
      toast.error("Upload du fond impossible");
    } finally {
      if (backgroundInputRef.current) backgroundInputRef.current.value = "";
    }
  };

  const applyCustomBackground = () => {
    const url = customBackgroundUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Colle une URL d'image https");
      return;
    }
    saveChatBackground(`linear-gradient(180deg, rgba(0,0,0,.58), rgba(0,0,0,.78)), url("${url.split('"').join("%22")}") center / cover fixed`);
    setCustomBackgroundUrl("");
  };

  const startCall = async (type: "audio" | "video") => {
    if (!user || !conversationId || !otherUserId || isBlocked || blockedByThem) return;
    try {
      setCallSeconds(0);
      setCallAudioLevel(0);
      callFacingModeRef.current = "user";
      setCallState({ type, status: "requesting", muted: false, cameraOff: false, speakerOn: true, quality: type === "video" ? "HD" : "Auto" });
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
        video: type === "video" ? { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } } : false,
      });
      callStreamRef.current = media;
      startAudioMeter(media);
      let data: any = null;
      try {
        const res = await (supabase as any)
          .from("direct_call_sessions")
          .insert({ conversation_id: conversationId, caller_id: user.id, recipient_id: otherUserId, call_type: type, status: "ringing" })
          .select("id")
          .single();
        data = res.data;
      } catch {
        // Call signaling is best-effort; media controls still work locally.
      }
      callSessionRef.current = data?.id || null;
      startRingtone();
      setCallState({ type, status: "ringing", muted: false, cameraOff: false, speakerOn: true, quality: type === "video" ? "HD" : "Auto" });
      window.setTimeout(() => {
        stopRingtone();
        setCallState((current) => current ? { ...current, status: "connected" } : current);
        if (callSessionRef.current) {
          (supabase as any).from("direct_call_sessions").update({ status: "connected" }).eq("id", callSessionRef.current);
        }
      }, 1100);
    } catch {
      stopRingtone();
      setCallState(null);
      toast.error(type === "video" ? "Autorise la caméra et le micro" : "Autorise le micro");
    }
  };

  const endCall = async () => {
    stopRingtone();
    if (callMeterFrameRef.current) cancelAnimationFrame(callMeterFrameRef.current);
    setCallAudioLevel(0);
    callStreamRef.current?.getTracks().forEach(t => t.stop());
    callStreamRef.current = null;
    if (callSessionRef.current) {
      try {
        await (supabase as any).from("direct_call_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", callSessionRef.current);
      } catch {
        // The call may already be gone; stopping local tracks is the important part.
      }
    }
    callSessionRef.current = null;
    setCallState(null);
  };

  const toggleCallMute = () => {
    callStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setCallState((current) => current ? { ...current, muted: !current.muted } : current);
  };

  const toggleCallCamera = () => {
    callStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setCallState((current) => current ? { ...current, cameraOff: !current.cameraOff } : current);
  };

  const flipCallCamera = async () => {
    if (!callStreamRef.current || callState?.type !== "video") return;
    const next = callFacingModeRef.current === "user" ? "environment" : "user";
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } },
        audio: false,
      });
      callStreamRef.current.getVideoTracks().forEach(track => {
        track.stop();
        callStreamRef.current?.removeTrack(track);
      });
      replacement.getVideoTracks().forEach(track => callStreamRef.current?.addTrack(track));
      callFacingModeRef.current = next;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = callStreamRef.current;
        localVideoRef.current.play().catch(() => {});
      }
      setCallState((current) => current ? { ...current, cameraOff: false, quality: "HD" } : current);
      toast.success(next === "environment" ? "Camera arriere activee" : "Camera selfie activee");
    } catch {
      toast.error("Changement de camera impossible sur cet appareil");
    }
  };

  const toggleSpeaker = () => {
    setCallState((current) => current ? { ...current, speakerOn: !current.speakerOn } : current);
    toast.success(callState?.speakerOn ? "Mode ecouteur demande" : "Haut-parleur demande");
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "read") return <CheckCheck className="h-3 w-3 text-accent" />;
    if (status === "delivered") return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    return <Check className="h-3 w-3 text-muted-foreground" />;
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const chatBackgroundStyle: CSSProperties = {
    background: chatBackground,
    backgroundAttachment: "fixed",
    backgroundPosition: "center",
    backgroundSize: "cover",
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{otherUserName}</span>
            {streakDays > 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${streakNeedsReply ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"}`}>
                <Flame className="h-3 w-3" /> {streakDays}j
              </span>
            )}
          </div>
          {(isBlocked || blockedByThem) && (
            <p className="text-[11px] text-destructive">{isBlocked ? "Bloqué par toi" : "Messages bloqués"}</p>
          )}
          {!isBlocked && !blockedByThem && streakNeedsReply && <p className="text-[11px] text-accent">Flamme à relancer aujourd'hui</p>}
        </div>
        <div className="flex items-center gap-3">
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => startCall("audio")} disabled={isBlocked || blockedByThem} aria-label="Appel audio">
            <Phone className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => startCall("video")} disabled={isBlocked || blockedByThem} aria-label="Appel video">
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
            <div className="mx-auto grid max-w-lg grid-cols-3 gap-2">
              <button onClick={reportConversation} className="flex items-center justify-center gap-2 rounded-xl bg-destructive/15 px-3 py-2 text-xs font-semibold text-destructive">
                <Flag className="h-4 w-4" /> Signaler
              </button>
              <button onClick={toggleBlockUser} className="flex items-center justify-center gap-2 rounded-xl bg-card px-3 py-2 text-xs font-semibold text-foreground">
                <Ban className="h-4 w-4" /> {isBlocked ? "Débloquer" : "Bloquer"}
              </button>
              <button onClick={reportAndBlockConversation} className="flex items-center justify-center gap-2 rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground">
                <ShieldCheck className="h-4 w-4" /> Les deux
              </button>
            </div>
            <div className="mx-auto mt-3 max-w-lg rounded-2xl bg-background/55 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-foreground">
                <Wallpaper className="h-4 w-4 text-primary" /> Fond privé
              </div>
              <input
                ref={backgroundInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => uploadChatBackground(e.target.files?.[0])}
              />
              <div className="grid grid-cols-4 gap-2">
                {chatBackgrounds.map(bg => (
                  <button
                    key={bg.label}
                    type="button"
                    onClick={() => saveChatBackground(bg.value)}
                    className="h-12 rounded-xl border border-border text-[10px] font-bold text-foreground shadow-inner"
                    style={{ background: bg.value }}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input value={customBackgroundUrl} onChange={e => setCustomBackgroundUrl(e.target.value)} placeholder="URL image https..." className="min-w-0 flex-1 rounded-xl bg-card px-3 py-2 text-xs text-foreground outline-none" />
                <button type="button" onClick={applyCustomBackground} className="rounded-xl gradient-primary px-3 py-2 text-xs font-bold text-primary-foreground">OK</button>
              </div>
              <button type="button" onClick={() => backgroundInputRef.current?.click()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-card px-3 py-2 text-xs font-bold text-foreground">
                <Upload className="h-3.5 w-3.5 text-primary" /> Uploader une image
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {callState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-background/88 px-4 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }} className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
              <div className="relative aspect-[3/4] bg-black">
                {callState.type === "video" && !callState.cameraOff ? (
                  <video ref={localVideoRef} className="h-full w-full object-cover" muted playsInline autoPlay style={{ transform: "scaleX(-1)" }} />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-background via-card to-background">
                    <div className="grid h-24 w-24 place-items-center rounded-full gradient-primary text-3xl font-bold text-primary-foreground">{otherUserName[0]}</div>
                    <p className="text-sm font-semibold text-foreground">{callState.type === "video" ? "Camera coupée" : "Appel audio"}</p>
                  </div>
                )}
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-bold text-foreground backdrop-blur">
                  {callState.status === "ringing" ? <BellRing className="h-3.5 w-3.5 text-primary" /> : <SignalHigh className="h-3.5 w-3.5 text-accent" />}
                  {callState.status === "requesting" ? "Permissions" : callState.status === "ringing" ? "Sonnerie" : fmtTime(callSeconds)}
                </div>
              </div>
              <div className="space-y-2 border-b border-border px-4 py-3">
                <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground">
                  <span className="flex items-center gap-1"><SignalHigh className="h-3.5 w-3.5 text-primary" /> {callState.type === "video" ? "Video 1080p/60" : "Audio 48 kHz"}</span>
                  <span>{callState.quality}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Activity className="h-3.5 w-3.5 text-accent" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${callAudioLevel}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums">{callAudioLevel}%</span>
                </div>
              </div>
              <div className="flex items-center justify-center gap-3 p-4">
                <button type="button" onClick={toggleCallMute} className={`grid h-12 w-12 place-items-center rounded-full ${callState.muted ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground"}`} aria-label={callState.muted ? "Réactiver le micro" : "Couper le micro"}>
                  {callState.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                {callState.type === "video" && (
                  <button type="button" onClick={toggleCallCamera} className={`grid h-12 w-12 place-items-center rounded-full ${callState.cameraOff ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground"}`} aria-label={callState.cameraOff ? "Réactiver la camera" : "Couper la camera"}>
                    {callState.cameraOff ? <CameraOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                  </button>
                )}
                <button type="button" onClick={toggleSpeaker} className={`grid h-12 w-12 place-items-center rounded-full ${callState.speakerOn ? "bg-secondary text-foreground" : "bg-card text-muted-foreground"}`} aria-label={callState.speakerOn ? "Passer en ecouteur" : "Activer haut-parleur"}>
                  {callState.speakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                </button>
                {callState.type === "video" && (
                <button type="button" onClick={flipCallCamera} className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-foreground" aria-label="Changer de camera">
                  <RotateCcw className="h-5 w-5" />
                </button>
                )}
                <button type="button" onClick={endCall} className="grid h-12 w-12 place-items-center rounded-full bg-destructive text-destructive-foreground" aria-label="Raccrocher">
                  <PhoneOff className="h-5 w-5" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-3" style={chatBackgroundStyle}>
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
                {msg.fromMe && (
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setDeleteTarget(msg)}
                    className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-card border border-border"
                    aria-label="Supprimer le message"
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

        {!isRecordingAudio && newMsg.trim() && !isBlocked && !blockedByThem && (
          <div className="mb-2 flex justify-end">
            <div className="max-w-[78%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-xs text-foreground shadow-sm">
              {newMsg.slice(0, 120)}
            </div>
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
