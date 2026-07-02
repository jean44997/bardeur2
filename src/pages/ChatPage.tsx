import { useState, useRef, useEffect, type CSSProperties, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowDown, Send, Smile, Image as ImageIcon, Mic, MicOff, Phone, Video, Check, CheckCheck, Trash2, MoreVertical, Flag, Ban, Flame, Wallpaper, PhoneOff, CameraOff, RotateCcw, Upload, Activity, BellRing, SignalHigh, Volume2, VolumeX, ShieldCheck, Plus, MapPin, FileUp, Contact, BarChart3, Sticker, Reply, ImagePlus, Music2, Gamepad2, Users, UserPlus, CheckCircle2, Crown, DoorOpen, UserMinus, X, ScreenShare, ScreenShareOff } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import AudioBubble from "@/components/AudioBubble";
import { getBestAudioRecorderOptions, getConnectionInfo } from "@/lib/mediaCapabilities";
import { checkClientRateLimit, formatRetryAfter } from "@/lib/clientRateLimit";
import { looksLikeRepeatedSpam, validateUploadFile, validateUserText } from "@/lib/contentSafety";
import { decryptMessageContent, encryptMessageContent, isEncryptedContent } from "@/lib/messageCrypto";
import { startBackgroundCallKeepalive, stopBackgroundCallKeepalive } from "@/lib/backgroundCall";

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
  replyToId?: string | null;
  replyPreview?: string | null;
}

interface CallState {
  type: "audio" | "video";
  status: "requesting" | "ringing" | "connected";
  direction: "outgoing" | "incoming";
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
  screenShareMode?: "screen" | "camera" | null;
  speakerOn: boolean;
  quality: "HD" | "Auto" | "Eco";
}

interface IncomingCall {
  id: string;
  type: "audio" | "video";
  callerId: string;
}

interface FriendOption {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

interface GroupCallState {
  id: string;
  type: "audio" | "video";
  startedAt: number;
  micMuted: boolean;
  camOff: boolean;
  screenSharing: boolean;
  screenSharers: string[];
}

interface PollPayload {
  question: string;
  options: string[];
}

const quickEmojis = ["❤️", "🔥", "😂", "😍", "👏", "🤯", "💀", "🙏", "😭", "🥰", "💯", "🎉"];
const quickReactions = ["<3", "Fire", "Haha", "OK", "Wow", "+1"];
const POLL_PREFIX = "POLL_V1:";
const chatBackgrounds = [
  { label: "Nuit", value: "radial-gradient(circle at top left, rgba(255,43,136,.22), transparent 35%), linear-gradient(160deg, #050505, #17121f 55%, #070707)" },
  { label: "Glace", value: "linear-gradient(135deg, rgba(125,211,252,.24), rgba(244,114,182,.18)), #07090f" },
  { label: "Studio", value: "linear-gradient(145deg, rgba(250,204,21,.16), rgba(34,197,94,.12)), #080808" },
  { label: "Sobre", value: "linear-gradient(180deg, #0b0b0f, #111827)" },
];

const getTurnIceServers = (): RTCIceServer[] => {
  const urls = String(import.meta.env.VITE_TURN_URLS || "").split(",").map((url) => url.trim()).filter(Boolean);
  const username = import.meta.env.VITE_TURN_USERNAME;
  const credential = import.meta.env.VITE_TURN_CREDENTIAL;
  return urls.length && username && credential ? [{ urls, username, credential }] : [];
};

const getCallProfile = () => {
  const info = getConnectionInfo();
  if (info.saveData || info.effectiveType === "2g" || info.effectiveType === "slow-2g" || (info.downlink > 0 && info.downlink < 1.2)) {
    return { label: "Eco" as const, width: 640, height: 360, frameRate: 24, bitrate: 420_000 };
  }
  if (info.effectiveType === "3g" || info.rtt > 350 || (info.downlink > 0 && info.downlink < 3)) {
    return { label: "Auto" as const, width: 1280, height: 720, frameRate: 30, bitrate: 1_200_000 };
  }
  return { label: "HD" as const, width: 1920, height: 1080, frameRate: 30, bitrate: 2_200_000 };
};

export default function ChatPage() {
  const navigate = useNavigate();
  const { id: conversationId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [newMsg, setNewMsg] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [showPlusDrawer, setShowPlusDrawer] = useState(false);
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
  const [streakDays, setStreakDays] = useState(0);
  const [streakNeedsReply, setStreakNeedsReply] = useState(false);
  const [callState, setCallState] = useState<CallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callFacingMode, setCallFacingMode] = useState<"user" | "environment">("user");
  const [callSeconds, setCallSeconds] = useState(0);
  const [callAudioLevel, setCallAudioLevel] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [reactionTarget, setReactionTarget] = useState<Message | null>(null);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  const [pollVotes, setPollVotes] = useState<Record<string, Record<string, string[]>>>({});
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["Oui", "Non"]);
  const [isGroupConversation, setIsGroupConversation] = useState(false);
  const [conversationParticipants, setConversationParticipants] = useState<FriendOption[]>([]);
  const [showGroupWizard, setShowGroupWizard] = useState(false);
  const [groupWizardMode, setGroupWizardMode] = useState<"create" | "add">("create");
  const [groupStep, setGroupStep] = useState<"select" | "details">("select");
  const [friendOptions, setFriendOptions] = useState<FriendOption[]>([]);
  const [selectedGroupFriendIds, setSelectedGroupFriendIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupCallState, setGroupCallState] = useState<GroupCallState | null>(null);
  const [groupCallParticipants, setGroupCallParticipants] = useState<FriendOption[]>([]);
  const [groupCallSeconds, setGroupCallSeconds] = useState(0);
  const groupScreenStreamRef = useRef<MediaStream | null>(null);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const callStateRef = useRef<CallState | null>(null);
  const messagesPaneRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const groupLocalVideoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const callStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const signalChannelRef = useRef<any>(null);
  const cameraTrackBeforeScreenRef = useRef<MediaStreamTrack | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callSessionRef = useRef<string | null>(null);
  const callFacingModeRef = useRef<"user" | "environment">("user");
  const wakeLockRef = useRef<any>(null);
  const backgroundCallNoticeRef = useRef(false);
  const ringtoneCtxRef = useRef<AudioContext | null>(null);
  const ringtoneTimerRef = useRef<number | null>(null);
  const callAutoEndTimerRef = useRef<number | null>(null);
  const callMeterFrameRef = useRef<number | null>(null);
  const callQualityTimerRef = useRef<number | null>(null);
  const callReconnectTimerRef = useRef<number | null>(null);
  const cancelledAudioRef = useRef(false);
  const recentTextRef = useRef<string[]>([]);
  const isNearChatBottomRef = useRef(true);
  const pendingAutoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const [remoteConnected, setRemoteConnected] = useState(false);

  const isNearChatBottom = () => {
    const el = messagesPaneRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  const requestCallWakeLock = async () => {
    const nav = navigator as any;
    if (!nav.wakeLock || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await nav.wakeLock.request("screen");
      wakeLockRef.current?.addEventListener?.("release", () => {
        wakeLockRef.current = null;
      });
    } catch {
      wakeLockRef.current = null;
    }
  };

  const releaseCallWakeLock = async () => {
    try {
      await wakeLockRef.current?.release?.();
    } catch {
      // Wake lock may already be released by the OS.
    } finally {
      wakeLockRef.current = null;
    }
  };

  const notifyOngoingCallInBackground = async () => {
    const current = callStateRef.current;
    if (!current || current.status !== "connected" || backgroundCallNoticeRef.current) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    backgroundCallNoticeRef.current = true;
    const title = current.type === "video" ? "Appel video en cours" : "Appel audio en cours";
    const body = "BARDEUR garde l'appel actif tant que la PWA reste ouverte.";
    const url = conversationId ? `/chat/${conversationId}` : "/inbox";
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const opts: NotificationOptions = {
        body,
        icon: "/app-icon-512.png",
        badge: "/app-icon-512.png",
        tag: `active-call-${callSessionRef.current || conversationId || "bardeur"}`,
        silent: true,
        data: { url },
      };
      if (reg && (reg as any).showNotification) await (reg as any).showNotification(title, opts);
      else {
        const note = new Notification(title, opts);
        note.onclick = () => {
          window.focus();
          navigate(url);
          note.close();
        };
      }
    } catch {
      // Notification is a bonus; the call stream remains the source of truth.
    }
  };

  useEffect(() => {
    if (conversationId && user) {
      fetchMessages();
      fetchConversationMeta();
      markAsRead();

      const channel = supabase
        .channel(`messages-${conversationId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, async (payload: any) => {
          // Avoid full refetch flash when our own INSERT echoes back — we already appended optimistically.
          if (payload?.eventType === "INSERT" && payload?.new?.sender_id === user?.id) return;
          if (payload?.eventType === "INSERT") {
            const mapped = await mapMessage(payload.new);
            const shouldAutoRead = isNearChatBottom();
            pendingAutoScrollRef.current = shouldAutoRead;
            setMessages((prev) => prev.some((m) => m.id === mapped.id) ? prev : [...prev, mapped]);
            if (shouldAutoRead) void markAsRead();
            return;
          }
          if (payload?.eventType === "UPDATE" && payload?.new?.id) {
            const mapped = await mapMessage(payload.new);
            setMessages((prev) => prev.map((m) => m.id === mapped.id ? { ...m, ...mapped } : m));
            return;
          }
          if (payload?.eventType === "DELETE" && payload?.old?.id) {
            setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
            return;
          }
          fetchMessages(true);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions", filter: `conversation_id=eq.${conversationId}` }, (payload: any) => {
          applyRealtimeReaction(payload);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "message_poll_votes", filter: `conversation_id=eq.${conversationId}` }, (payload: any) => {
          applyRealtimePollVote(payload);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "direct_call_sessions", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
          handleCallSignal(payload.new as any);
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [conversationId, user]);

  useEffect(() => {
    callStateRef.current = callState;
    if (callState) {
      void requestCallWakeLock();
      if (document.visibilityState === "visible") backgroundCallNoticeRef.current = false;
      if (callState.status === "connected") {
        startBackgroundCallKeepalive({
          title: callState.type === "video" ? "Appel video en cours" : "Appel audio en cours",
          peerName: otherUserName || "Contact",
          peerAvatar: null,
          onHangup: () => { void endCall(); },
        });
      }
      return;
    }
    backgroundCallNoticeRef.current = false;
    stopBackgroundCallKeepalive();
    void releaseCallWakeLock();
  }, [callState]);

  useEffect(() => {
    if (!groupCallState) { setGroupCallSeconds(0); return; }
    const started = groupCallState.startedAt;
    setGroupCallSeconds(Math.floor((Date.now() - started) / 1000));
    const id = window.setInterval(() => setGroupCallSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [groupCallState?.id]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        backgroundCallNoticeRef.current = false;
        if (callStateRef.current) void requestCallWakeLock();
      } else {
        void notifyOngoingCallInBackground();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const callId = searchParams.get("call");
    if (!callId || !conversationId || !user) return;
    void (async () => {
      const { data } = await (supabase as any)
        .from("direct_call_sessions")
        .select("*")
        .eq("id", callId)
        .eq("conversation_id", conversationId)
        .maybeSingle();
      if (data?.status === "ringing" && data.recipient_id === user.id) {
        const call = { id: data.id, type: data.call_type === "video" ? "video" : "audio", callerId: data.caller_id } as IncomingCall;
        callSessionRef.current = data.id;
        setIncomingCall(call);
        if (searchParams.get("answer") === "1") {
          window.setTimeout(() => acceptIncomingCall(call), 0);
        } else {
          startRingtone();
          navigator.vibrate?.([180, 80, 180]);
        }
      }
      setSearchParams({}, { replace: true });
    })();
  }, [conversationId, searchParams, setSearchParams, user]);

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
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [callState, remoteConnected]);

  useEffect(() => {
    return () => {
      void releaseCallWakeLock();
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      cameraTrackBeforeScreenRef.current?.stop();
      callStreamRef.current?.getTracks().forEach(t => t.stop());
      stopRingtone();
      clearCallAutoEnd();
      if (callMeterFrameRef.current) cancelAnimationFrame(callMeterFrameRef.current);
      if (callQualityTimerRef.current) window.clearInterval(callQualityTimerRef.current);
      if (callReconnectTimerRef.current) window.clearTimeout(callReconnectTimerRef.current);
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
    previousMessageCountRef.current = 0;
    pendingAutoScrollRef.current = true;
    isNearChatBottomRef.current = true;
    setNewMessagesCount(0);
  }, [conversationId]);

  useEffect(() => {
    const el = messagesPaneRef.current;
    if (!el) return;
    const handleScroll = () => {
      const nearBottom = isNearChatBottom();
      isNearChatBottomRef.current = nearBottom;
      if (nearBottom) {
        setNewMessagesCount(0);
        void markAsRead();
      }
    };
    handleScroll();
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [conversationId, user?.id]);

  useEffect(() => {
    const previousCount = previousMessageCountRef.current;
    const nextCount = messages.length;
    previousMessageCountRef.current = nextCount;
    if (loading || nextCount === 0 || nextCount <= previousCount) return;

    const addedMessages = messages.slice(previousCount);
    const incomingCount = addedMessages.filter((message) => !message.fromMe).length;
    const shouldStickToBottom = pendingAutoScrollRef.current || isNearChatBottomRef.current || addedMessages.some((message) => message.fromMe);
    pendingAutoScrollRef.current = false;

    if (shouldStickToBottom) {
      setNewMessagesCount(0);
      window.requestAnimationFrame(() => scrollChatToBottom(previousCount === 0 ? "auto" : "smooth"));
      if (incomingCount > 0) void markAsRead();
      return;
    }

    if (incomingCount > 0) {
      setNewMessagesCount((current) => Math.min(99, current + incomingCount));
    }
  }, [messages, loading]);

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
      replyToId: m.reply_to_id || null,
      replyPreview: m.reply_preview || null,
    };
  };

  const fetchMessages = async (silent = false) => {
    if (!conversationId) return;
    if (!silent) setLoading(true);
    try {
      pendingAutoScrollRef.current = !silent || isNearChatBottom();
      let { data, error } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at, is_read, media_url, media_type, reply_to_id, reply_preview" as any)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(160) as any;
      if (error) {
        const fallback = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(160);
        data = fallback.data as any;
        error = fallback.error;
      }
      if (error) throw error;
      const hidden = loadHiddenIds();
      const rows = [...(data || [])].reverse();
      const mapped = await Promise.all(rows.filter((m: any) => !hidden.has(m.id)).map(mapMessage));
      setMessages(mapped);
      void fetchMessageReactions(mapped.map((m) => m.id));
      void fetchPollVotes(mapped.filter((m) => !!parsePollMessage(m.text)).map((m) => m.id));
    } catch {
      if (!silent) toast.error("Chargement des messages impossible");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchMessageReactions = async (messageIds: string[]) => {
    if (!conversationId || messageIds.length === 0) {
      setMessageReactions({});
      return;
    }
    try {
      const { data } = await (supabase as any)
        .from("message_reactions")
        .select("message_id, reaction")
        .eq("conversation_id", conversationId)
        .in("message_id", messageIds);
      const grouped: Record<string, string[]> = {};
      (data || []).forEach((row: any) => {
        grouped[row.message_id] = [...(grouped[row.message_id] || []), row.reaction];
      });
      setMessageReactions(grouped);
    } catch {
      setMessageReactions({});
    }
  };

  const applyRealtimeReaction = (payload: any) => {
    const row = payload?.new || payload?.old;
    if (!row?.message_id) return;
    setMessageReactions((current) => {
      const next = { ...current };
      const list = next[row.message_id] || [];
      if (payload.eventType === "DELETE") {
        next[row.message_id] = list.filter((reaction) => reaction !== row.reaction);
      } else if (!list.includes(row.reaction)) {
        next[row.message_id] = [...list, row.reaction];
      }
      return next;
    });
  };

  const encodePollMessage = (payload: PollPayload) => {
    return `${POLL_PREFIX}${btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}`;
  };

  const parsePollMessage = (text?: string | null): PollPayload | null => {
    if (!text?.startsWith(POLL_PREFIX)) return null;
    try {
      const raw = decodeURIComponent(escape(atob(text.slice(POLL_PREFIX.length))));
      const parsed = JSON.parse(raw);
      if (!parsed?.question || !Array.isArray(parsed.options)) return null;
      return {
        question: String(parsed.question).slice(0, 140),
        options: parsed.options.map((option: unknown) => String(option).slice(0, 40)).filter(Boolean).slice(0, 6),
      };
    } catch {
      return null;
    }
  };

  const fetchPollVotes = async (messageIds: string[]) => {
    if (!conversationId || messageIds.length === 0) return;
    try {
      const { data } = await (supabase as any)
        .from("message_poll_votes")
        .select("message_id, option_text, user_id")
        .eq("conversation_id", conversationId)
        .in("message_id", messageIds);
      const grouped: Record<string, Record<string, string[]>> = {};
      (data || []).forEach((row: any) => {
        if (!grouped[row.message_id]) grouped[row.message_id] = {};
        grouped[row.message_id][row.option_text] = [...(grouped[row.message_id][row.option_text] || []), row.user_id];
      });
      setPollVotes((current) => ({ ...current, ...grouped }));
    } catch {
      // Poll tables may not exist until the latest migration is applied.
    }
  };

  const applyRealtimePollVote = (payload: any) => {
    const row = payload?.new || payload?.old;
    if (!row?.message_id || !row?.option_text) return;
    setPollVotes((current) => {
      const next = { ...current };
      const byOption = { ...(next[row.message_id] || {}) };
      Object.keys(byOption).forEach((option) => {
        byOption[option] = byOption[option].filter((id) => id !== row.user_id);
      });
      if (payload.eventType !== "DELETE") {
        byOption[row.option_text] = [...(byOption[row.option_text] || []), row.user_id];
      }
      next[row.message_id] = byOption;
      return next;
    });
  };

  const fetchOtherUser = async () => {
    if (!conversationId || !user) return;
    const { data } = await supabase.from("conversation_participants").select("user_id, profiles:user_id(display_name)").eq("conversation_id", conversationId).neq("user_id", user.id);
    if (data?.[0]) {
      const targetId = (data[0] as any).user_id;
      setOtherUserId(targetId);
      // If the other user is an admin/super_admin, display the official BARDEUR identity.
      const { data: roleRow } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", targetId)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();
      if (roleRow) {
        setOtherUserName("BARDEUR Officiel ✓");
      } else {
        setOtherUserName((data[0] as any).profiles?.display_name || "Utilisateur");
      }
      checkBlockStatus(targetId);
    }
  };

  const fetchConversationMeta = async () => {
    if (!conversationId || !user) return;
    const [{ data: conversation }, { data }] = await Promise.all([
      (supabase as any).from("conversations").select("is_group, group_name").eq("id", conversationId).maybeSingle(),
      supabase.from("conversation_participants").select("user_id, profiles:user_id(username, display_name, avatar_url)").eq("conversation_id", conversationId),
    ]);
    const participants = (data || []).map((row: any) => ({
      id: row.user_id,
      username: row.profiles?.username || "user",
      displayName: row.profiles?.display_name || row.profiles?.username || "Utilisateur",
      avatarUrl: row.profiles?.avatar_url || "",
    }));
    setConversationParticipants(participants);
    const group = !!conversation?.is_group;
    setIsGroupConversation(group);
    if (group) {
      setOtherUserName(conversation?.group_name || `Groupe (${participants.length})`);
      setOtherUserId(null);
      setIsBlocked(false);
      setBlockedByThem(false);
      return;
    }
    const other = (data || []).find((row: any) => row.user_id !== user.id);
    if (other) {
      const targetId = (other as any).user_id;
      setOtherUserId(targetId);
      const { data: roleRow } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", targetId)
        .in("role", ["admin", "super_admin"])
        .maybeSingle();
      setOtherUserName(roleRow ? "BARDEUR Officiel" : ((other as any).profiles?.display_name || "Utilisateur"));
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

  const getMessagePreview = (message: Message) => {
    if (message.text?.trim()) return message.text.trim().slice(0, 120);
    if (message.mediaType?.startsWith("image")) return "Image";
    if (message.mediaType?.startsWith("video")) return "Video";
    if (message.mediaType?.startsWith("audio")) return "Audio";
    return "Piece jointe";
  };

  const addMentionToComposer = (mention: string) => {
    setNewMsg((current) => `${current}${current && !current.endsWith(" ") ? " " : ""}${mention} `);
    setShowMentionPicker(false);
    setShowPlusDrawer(false);
    setTimeout(() => messageInputRef.current?.focus(), 40);
  };

  const openMentionPicker = () => {
    if (!isGroupConversation) {
      toast.info("Les mentions sont disponibles dans les groupes");
      return;
    }
    setShowMentionPicker(true);
    setShowPlusDrawer(false);
  };

  const notifyTaggedUsers = async (messageId: string, text: string) => {
    if (!user || !conversationId || !isGroupConversation || !text.trim() || messageId.startsWith("optim")) return;
    const normalized = text.toLowerCase();
    const everyoneTagged = /(^|\s)@(tous|all|everyone)\b/i.test(text);
    const targets = conversationParticipants
      .filter((participant) => participant.id !== user.id)
      .filter((participant) => {
        if (everyoneTagged) return true;
        const username = participant.username?.toLowerCase();
        const display = participant.displayName?.toLowerCase().replace(/\s+/g, "");
        return (!!username && normalized.includes(`@${username}`)) || (!!display && normalized.includes(`@${display}`));
      });
    const uniqueTargets = Array.from(new Map(targets.map((target) => [target.id, target])).values());
    if (uniqueTargets.length === 0) return;
    await supabase.from("notifications").insert(uniqueTargets.map((target) => ({
      user_id: target.id,
      from_user_id: user.id,
      type: "message",
      content: everyoneTagged ? `${otherUserName}: mention @tous` : `${otherUserName}: tu as ete tague`,
      reference_id: conversationId,
    })));
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
    const optimisticId = `optim-${Date.now()}`;
    const now = new Date();
    const replyingTo = replyTarget;
    pendingAutoScrollRef.current = true;
    // Optimistic append → no visible reload after send
    setMessages(prev => [...prev, {
      id: optimisticId,
      text: validation.value,
      fromMe: true,
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "sent",
      senderId: user.id,
      createdAt: now.toISOString(),
      replyToId: replyingTo?.id || null,
      replyPreview: replyingTo ? getMessagePreview(replyingTo) : null,
    }]);
    setNewMsg("");
    setReplyTarget(null);
    setShowPlusDrawer(false);
    setTimeout(() => scrollChatToBottom("smooth"), 40);

    const messagePayload: any = {
      conversation_id: conversationId,
      sender_id: user.id,
      content: encryptedContent,
      encrypted_content: encryptedContent !== validation.value,
      content_version: encryptedContent !== validation.value ? "bdenc_v1" : "plain",
      reply_to_id: replyingTo?.id || null,
      reply_preview: replyingTo ? getMessagePreview(replyingTo).slice(0, 120) : null,
    };
    let { data, error } = await (supabase as any).from("messages").insert(messagePayload).select("id").single();
    if (error && String(error.message || "").includes("reply_")) {
      delete messagePayload.reply_to_id;
      delete messagePayload.reply_preview;
      const retry = await (supabase as any).from("messages").insert(messagePayload).select("id").single();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setNewMsg(validation.value);
      setReplyTarget(replyingTo);
      toast.error(error.message?.includes("rate") ? "Rate-limit serveur atteint" : "Message impossible");
      return;
    }
    if (data?.id) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m));
    recentTextRef.current = [validation.value, ...recentTextRef.current].slice(0, 6);
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

  const sendAttachment = async (file?: File | null) => {
    if (!file || !user || !conversationId || isBlocked || blockedByThem) return;
    const fileCheck = validateUploadFile(file, { maxBytes: 50 * 1024 * 1024, acceptedPrefixes: ["image/", "video/", "audio/", "application/", "text/"] });
    if (!fileCheck.ok) { toast.error(fileCheck.reason); return; }
    const rate = checkClientRateLimit({ key: `chat-media:${conversationId}:${user.id}`, limit: 6, windowMs: 60_000, blockMs: 45_000 });
    if (!rate.allowed) { toast.error(`Upload ralenti, reessaie dans ${formatRetryAfter(rate.retryAfterMs)}`); return; }
    setUploadingImage(true);
    setShowPlusDrawer(false);
    try {
      const ext = file.name.split(".").pop() || "bin";
      const path = `${user.id}/chat/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const optimisticId = `optim-media-${Date.now()}`;
      const now = new Date();
      const mediaType = file.type || "application/octet-stream";
      const replyingTo = replyTarget;
      const label = mediaType.startsWith("video") ? "Video" : mediaType.startsWith("audio") ? "Audio" : mediaType.startsWith("image") ? "Image" : file.name;
      pendingAutoScrollRef.current = true;
      setMessages(prev => [...prev, {
        id: optimisticId,
        text: label,
        fromMe: true,
        time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        status: "sent",
        mediaUrl: data.publicUrl,
        mediaType,
        senderId: user.id,
        createdAt: now.toISOString(),
        replyToId: replyingTo?.id || null,
        replyPreview: replyingTo ? getMessagePreview(replyingTo) : null,
      }]);
      setReplyTarget(null);
      const payload: any = {
        conversation_id: conversationId,
        sender_id: user.id,
        content: label,
        media_url: data.publicUrl,
        media_type: mediaType,
        content_version: "plain",
        reply_to_id: replyingTo?.id || null,
        reply_preview: replyingTo ? getMessagePreview(replyingTo).slice(0, 120) : null,
      };
      let { data: inserted, error } = await (supabase as any).from("messages").insert(payload).select("id").single();
      if (error && String(error.message || "").includes("reply_")) {
        delete payload.reply_to_id;
        delete payload.reply_preview;
        const retry = await (supabase as any).from("messages").insert(payload).select("id").single();
        inserted = retry.data;
        error = retry.error;
      }
      if (error) throw error;
      if (inserted?.id) setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: inserted.id } : m));
      toast.success("Piece jointe envoyee");
    } catch {
      toast.error("Impossible d'envoyer le fichier");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const sendStructuredMessage = async (text: string) => {
    if (!text.trim() || !user || !conversationId || isBlocked || blockedByThem) return;
    const validation = validateUserText(text, { maxLength: 900, allowLinks: true });
    if (!validation.ok) { toast.error(validation.reason || "Message refuse"); return; }
    const rate = checkClientRateLimit({ key: `chat-structured:${conversationId}:${user.id}`, limit: 8, windowMs: 60_000, blockMs: 30_000 });
    if (!rate.allowed) { toast.error(`Trop rapide, reessaie dans ${formatRetryAfter(rate.retryAfterMs)}`); return; }
    const optimisticId = `optim-quick-${Date.now()}`;
    const now = new Date();
    const replyingTo = replyTarget;
    const encryptedContent = await encryptMessageContent(validation.value, conversationId);
    pendingAutoScrollRef.current = true;
    setMessages(prev => [...prev, {
      id: optimisticId,
      text: validation.value,
      fromMe: true,
      time: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "sent",
      senderId: user.id,
      createdAt: now.toISOString(),
      replyToId: replyingTo?.id || null,
      replyPreview: replyingTo ? getMessagePreview(replyingTo) : null,
    }]);
    setReplyTarget(null);
    setShowPlusDrawer(false);
    const payload: any = {
      conversation_id: conversationId,
      sender_id: user.id,
      content: encryptedContent,
      encrypted_content: encryptedContent !== validation.value,
      content_version: encryptedContent !== validation.value ? "bdenc_v1" : "plain",
      reply_to_id: replyingTo?.id || null,
      reply_preview: replyingTo ? getMessagePreview(replyingTo).slice(0, 120) : null,
    };
    let { data, error } = await (supabase as any).from("messages").insert(payload).select("id").single();
    if (error && String(error.message || "").includes("reply_")) {
      delete payload.reply_to_id;
      delete payload.reply_preview;
      const retry = await (supabase as any).from("messages").insert(payload).select("id").single();
      data = retry.data;
      error = retry.error;
    }
    if (error) {
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      toast.error("Envoi impossible");
      return;
    }
    if (data?.id) {
      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, id: data.id } : m));
      void notifyTaggedUsers(data.id, validation.value);
    }
  };

  const shareLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Localisation indisponible sur cet appareil");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        void sendStructuredMessage(`Localisation partagee: https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`);
      },
      () => toast.error("Autorise la localisation pour partager ta position"),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const sendContactCard = async () => {
    const nav = navigator as any;
    if (nav.contacts?.select) {
      try {
        const contacts = await nav.contacts.select(["name", "tel", "email"], { multiple: false });
        const contact = contacts?.[0];
        if (contact) {
          const detail = contact.tel?.[0] || contact.email?.[0] || "";
          void sendStructuredMessage(`Contact partage: ${(contact.name?.[0] || "Contact").trim()}${detail ? ` - ${detail}` : ""}`);
          return;
        }
      } catch {
        toast.info("Selection contact annulee");
      }
    }
    const name = window.prompt("Nom du contact");
    if (!name?.trim()) return;
    const detail = window.prompt("Telephone, email ou @username") || "";
    void sendStructuredMessage(`Contact partage: ${name.trim()}${detail.trim() ? ` - ${detail.trim()}` : ""}`);
  };

  const sendPoll = () => {
    setPollQuestion("");
    setPollOptions(["Oui", "Non"]);
    setShowPollComposer(true);
    setShowPlusDrawer(false);
  };

  const createPollMessage = async () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((option) => option.trim()).filter(Boolean).slice(0, 6);
    if (question.length < 3 || options.length < 2) {
      toast.error("Ajoute une question et au moins 2 choix");
      return;
    }
    await sendStructuredMessage(encodePollMessage({ question, options }));
    setShowPollComposer(false);
  };

  const votePoll = async (message: Message, option: string) => {
    if (!user || !conversationId || message.id.startsWith("optim")) return;
    setPollVotes((current) => {
      const byOption = { ...(current[message.id] || {}) };
      Object.keys(byOption).forEach((key) => {
        byOption[key] = byOption[key].filter((id) => id !== user.id);
      });
      byOption[option] = [...(byOption[option] || []), user.id];
      return { ...current, [message.id]: byOption };
    });
    try {
      const { error } = await (supabase as any)
        .from("message_poll_votes")
        .upsert({
          conversation_id: conversationId,
          message_id: message.id,
          user_id: user.id,
          option_text: option,
          created_at: new Date().toISOString(),
        }, { onConflict: "message_id,user_id" });
      if (error) throw error;
    } catch {
      toast.info("Vote local en attendant la migration");
    }
  };

  const loadFriendOptions = async () => {
    if (!user) return [];
    const { data } = await supabase
      .from("follows")
      .select("following_id, profiles:following_id(id, username, display_name, avatar_url)")
      .eq("follower_id", user.id)
      .limit(80);
    const raw = (data || []).map((row: any) => row.profiles).filter(Boolean);
    if (raw.length === 0) {
      setFriendOptions([]);
      return [];
    }
    const ids = raw.map((profile: any) => profile.id);
    const { data: back } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("following_id", user.id)
      .in("follower_id", ids);
    const mutualIds = new Set((back || []).map((row: any) => row.follower_id));
    const friends = raw
      .filter((profile: any) => mutualIds.has(profile.id) && !conversationParticipants.some((p) => p.id === profile.id))
      .map((profile: any) => ({
        id: profile.id,
        username: profile.username || "user",
        displayName: profile.display_name || profile.username || "Utilisateur",
        avatarUrl: profile.avatar_url || "",
      }));
    setFriendOptions(friends);
    return friends;
  };

  const openGroupWizard = async (mode: "create" | "add" = "create") => {
    setGroupWizardMode(mode);
    setGroupStep("select");
    setSelectedGroupFriendIds([]);
    setGroupName(mode === "create" ? "" : otherUserName);
    setShowGroupWizard(true);
    setShowPlusDrawer(false);
    const friends = await loadFriendOptions();
    if (friends.length === 0) toast.info("Ajoute des amis mutuels avant de creer un groupe");
  };

  const createFriendGroupDraft = () => {
    void openGroupWizard("create");
  };

  const toggleGroupFriend = (id: string) => {
    setSelectedGroupFriendIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      const limit = groupWizardMode === "create" ? 5 : Math.max(0, 5 - conversationParticipants.length);
      if (current.length >= limit) {
        toast.info("5 personnes maximum pour le moment");
        return current;
      }
      return [...current, id];
    });
  };

  const continueGroupWizard = () => {
    const minimum = groupWizardMode === "create" ? 3 : 1;
    if (selectedGroupFriendIds.length < minimum) {
      toast.error(groupWizardMode === "create" ? "Selectionne au moins 3 amis" : "Selectionne au moins 1 ami");
      return;
    }
    setGroupStep("details");
  };

  const createGroupConversation = async (memberIds: string[], name: string) => {
    const cleanName = name.trim() || "Groupe amis";
    try {
      const { data: conversation, error: conversationError } = await (supabase as any)
        .from("conversations")
        .insert({ is_group: true, group_name: cleanName })
        .select("id")
        .single();
      if (conversationError || !conversation?.id) throw conversationError || new Error("Conversation impossible");

      const participants = [user?.id, ...memberIds].filter(Boolean).map((participantId) => ({
        conversation_id: conversation.id,
        user_id: participantId,
      }));
      const { error: participantError } = await (supabase as any)
        .from("conversation_participants")
        .insert(participants);
      if (participantError) throw participantError;

      return { data: conversation.id, error: null };
    } catch (directError: any) {
      return {
        data: null,
        error: {
          message: directError?.message?.includes("row-level security")
            ? "Supabase bloque la creation de groupe: il faut retrouver l'acces au projet pour autoriser l'insertion."
            : directError?.message || "Creation groupe impossible",
        },
      };
    }
  };

  const submitGroupWizard = async () => {
    if (!user || !conversationId) return;
    setCreatingGroup(true);
    try {
      if (groupWizardMode === "create") {
        const { data, error } = await createGroupConversation(selectedGroupFriendIds, groupName);
        if (error || !data) throw error || new Error("Groupe impossible");
        toast.success("Groupe cree");
        setShowGroupWizard(false);
        navigate(`/chat/${data}`);
      } else {
        const { error } = await (supabase as any)
          .rpc("add_friend_group_members", {
            _conversation_id: conversationId,
            _member_ids: selectedGroupFriendIds,
          });
        if (error) throw error;
        toast.success("Amis ajoutes au groupe");
        setShowGroupWizard(false);
        await fetchConversationMeta();
      }
    } catch (err: any) {
      toast.error(err?.message || "Action groupe impossible");
    } finally {
      setCreatingGroup(false);
    }
  };

  const removeGroupMember = async (memberId: string) => {
    if (!conversationId || !user || memberId === user.id) return;
    const countAfter = conversationParticipants.length - 1;
    if (countAfter < 3) {
      toast.error("Un groupe doit garder au moins 3 membres");
      return;
    }
    const { error } = await (supabase as any)
      .rpc("remove_group_member", {
        _conversation_id: conversationId,
        _member_id: memberId,
      });
    if (error) { toast.error("Suppression impossible"); return; }
    toast.success("Membre retire");
    await fetchConversationMeta();
  };

  const startGroupCall = async (type: "audio" | "video") => {
    if (!conversationId || !user || !isGroupConversation) return;
    const members = conversationParticipants.filter((p) => p.id !== user.id).slice(0, 4);
    if (members.length < 2) {
      toast.error("Il faut au moins 3 personnes dans le groupe");
      return;
    }
    const callId = crypto.randomUUID();
    setGroupCallState({ id: callId, type, startedAt: Date.now(), micMuted: false, camOff: false, screenSharing: false, screenSharers: [] });
    setGroupCallParticipants([{ id: user.id, username: "toi", displayName: "Toi", avatarUrl: "" }, ...members].slice(0, 5));
    try {
      if (type === "video") {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: true });
        callStreamRef.current = stream;
        setTimeout(() => {
          if (groupLocalVideoRef.current) {
            groupLocalVideoRef.current.srcObject = stream;
            groupLocalVideoRef.current.play().catch(() => {});
          }
        }, 80);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        callStreamRef.current = stream;
      }
      await (supabase as any).from("group_call_sessions").insert({
        id: callId,
        conversation_id: conversationId,
        host_id: user.id,
        call_type: type,
        status: "active",
      });
      await (supabase as any).from("group_call_participants").upsert({
        session_id: callId,
        user_id: user.id,
        joined_at: new Date().toISOString(),
      }, { onConflict: "session_id,user_id" });
      await sendStructuredMessage(`Appel de groupe ${type === "video" ? "video" : "audio"} lance: 5 participants max`);
    } catch {
      setGroupCallState(null);
      toast.error(type === "video" ? "Autorise camera et micro" : "Autorise le micro");
    }
  };

  const endGroupCall = async () => {
    callStreamRef.current?.getTracks().forEach((track) => track.stop());
    callStreamRef.current = null;
    if (groupScreenStreamRef.current) {
      groupScreenStreamRef.current.getTracks().forEach((t) => t.stop());
      groupScreenStreamRef.current = null;
    }
    setGroupCallState(null);
    setGroupCallParticipants([]);
    setGroupCallSeconds(0);
  };

  const toggleGroupMic = () => {
    const stream = callStreamRef.current;
    if (!stream) return;
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setGroupCallState((prev) => prev ? { ...prev, micMuted: !track.enabled } : prev);
  };

  const toggleGroupCam = () => {
    const stream = callStreamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setGroupCallState((prev) => prev ? { ...prev, camOff: !track.enabled } : prev);
  };

  const toggleGroupScreenShare = async () => {
    if (!groupCallState) return;
    if (groupCallState.screenSharing) {
      groupScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      groupScreenStreamRef.current = null;
      setGroupCallState((prev) => prev ? { ...prev, screenSharing: false, screenSharers: prev.screenSharers.filter((id) => id !== user?.id) } : prev);
      if (groupLocalVideoRef.current && callStreamRef.current) {
        groupLocalVideoRef.current.srcObject = callStreamRef.current;
        groupLocalVideoRef.current.play().catch(() => {});
      }
      return;
    }
    try {
      const screen = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      groupScreenStreamRef.current = screen;
      screen.getVideoTracks()[0].addEventListener("ended", () => {
        groupScreenStreamRef.current = null;
        setGroupCallState((prev) => prev ? { ...prev, screenSharing: false, screenSharers: prev.screenSharers.filter((id) => id !== user?.id) } : prev);
        if (groupLocalVideoRef.current && callStreamRef.current) {
          groupLocalVideoRef.current.srcObject = callStreamRef.current;
          groupLocalVideoRef.current.play().catch(() => {});
        }
      });
      if (groupLocalVideoRef.current) {
        groupLocalVideoRef.current.srcObject = screen;
        groupLocalVideoRef.current.play().catch(() => {});
      }
      setGroupCallState((prev) => prev ? { ...prev, screenSharing: true, screenSharers: [...prev.screenSharers.filter((id) => id !== user?.id), user?.id || ""] } : prev);
      toast.success("Partage d'écran actif");
    } catch {
      toast.error("Partage d'écran refusé");
    }
  };

  const deleteGroupConversation = async () => {
    if (!conversationId || !isGroupConversation) return;
    if (!window.confirm("Supprimer ce groupe pour tous les membres ?")) return;
    const { error } = await (supabase as any).rpc("delete_friend_group_conversation", {
      _conversation_id: conversationId,
    });
    if (error) {
      toast.error("Suppression du groupe impossible");
      return;
    }
    toast.success("Groupe supprime");
    navigate("/inbox");
  };

  const sendGroupChallenge = () => {
    if (!isGroupConversation) return;
    void sendStructuredMessage("Defi groupe: chacun partage une video ou photo en moins de 10 minutes. Les reponses gardent la flamme du groupe active.");
  };

  const sendGroupCapsule = () => {
    if (!isGroupConversation) return;
    void sendStructuredMessage("Capsule souvenir: envoyez chacun une piece jointe aujourd'hui, puis epinglez la meilleure dans le groupe.");
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

  const reactToMessage = async (message: Message, reaction: string) => {
    if (!user || !conversationId || message.id.startsWith("optim")) return;
    setReactionTarget(null);
    setMessageReactions((current) => {
      const list = current[message.id] || [];
      return { ...current, [message.id]: list.includes(reaction) ? list : [...list, reaction] };
    });
    try {
      const { error } = await (supabase as any)
        .from("message_reactions")
        .upsert({
          conversation_id: conversationId,
          message_id: message.id,
          user_id: user.id,
          reaction,
          created_at: new Date().toISOString(),
        }, { onConflict: "message_id,user_id,reaction" });
      if (error) throw error;
    } catch {
      toast.info("Reaction locale en attendant la migration");
    }
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

  const closePeer = () => {
    if (callQualityTimerRef.current) window.clearInterval(callQualityTimerRef.current);
    if (callReconnectTimerRef.current) window.clearTimeout(callReconnectTimerRef.current);
    callQualityTimerRef.current = null;
    callReconnectTimerRef.current = null;
    if (signalChannelRef.current) {
      supabase.removeChannel(signalChannelRef.current);
      signalChannelRef.current = null;
    }
    peerRef.current?.getSenders().forEach(sender => {
      try { sender.track?.stop(); } catch { /* noop */ }
    });
    peerRef.current?.close();
    peerRef.current = null;
    remoteStreamRef.current?.getTracks().forEach(track => track.stop());
    remoteStreamRef.current = null;
    setRemoteConnected(false);
  };

  const resetScreenShareRefs = (stopCameraBackup = false) => {
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;
    if (stopCameraBackup) {
      cameraTrackBeforeScreenRef.current?.stop();
    }
    cameraTrackBeforeScreenRef.current = null;
  };

  const clearCallAutoEnd = () => {
    if (callAutoEndTimerRef.current) window.clearTimeout(callAutoEndTimerRef.current);
    callAutoEndTimerRef.current = null;
  };

  const cleanupCallUi = (message?: string) => {
    stopRingtone();
    clearCallAutoEnd();
    void releaseCallWakeLock();
    closePeer();
    resetScreenShareRefs(true);
    if (callMeterFrameRef.current) cancelAnimationFrame(callMeterFrameRef.current);
    callMeterFrameRef.current = null;
    setCallAudioLevel(0);
    callStreamRef.current?.getTracks().forEach(t => t.stop());
    callStreamRef.current = null;
    callSessionRef.current = null;
    setIncomingCall(null);
    setCallState(null);
    if (message) toast.info(message);
  };

  const handleCallSignal = (call: any) => {
    if (!call || !user || call.conversation_id !== conversationId) return;
    const isMine = call.caller_id === user.id;
    const isForMe = call.recipient_id === user.id;

    if (call.status === "ringing" && isForMe && call.caller_id !== user.id) {
      callSessionRef.current = call.id;
      setIncomingCall({ id: call.id, type: call.call_type, callerId: call.caller_id });
      startRingtone();
      navigator.vibrate?.([180, 80, 180]);
      return;
    }

    if (call.id !== callSessionRef.current) return;

    if (call.status === "connected") {
      stopRingtone();
      clearCallAutoEnd();
      setIncomingCall(null);
      setCallState((current) => current ? { ...current, status: "connected" } : current);
      return;
    }

    if (["declined", "missed", "ended"].includes(call.status)) {
      const label = call.status === "declined" ? "Appel refuse" : call.status === "missed" ? "Appel manque" : isMine ? "Appel termine" : "Appel termine par l'autre utilisateur";
      cleanupCallUi(label);
    }
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
    ctx.resume?.().catch(() => {});
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

  const sendCallSignal = async (callId: string, recipientId: string, signalType: "offer" | "answer" | "candidate", payload: any) => {
    if (!user) return;
    await (supabase as any).from("direct_call_signals").insert({
      call_id: callId,
      sender_id: user.id,
      recipient_id: recipientId,
      signal_type: signalType,
      payload,
    });
  };

  const broadcastCallEnded = async (callId: string) => {
    try {
      await signalChannelRef.current?.send({
        type: "broadcast",
        event: "call-ended",
        payload: { callId, senderId: user?.id },
      });
    } catch {
      // The database status update below remains the durable source of truth.
    }
  };

  const applyCallSignal = async (signal: any, pc: RTCPeerConnection, remoteUserId: string) => {
    if (!signal || signal.sender_id === user?.id) return;
    try {
      if (signal.signal_type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendCallSignal(signal.call_id, remoteUserId, "answer", answer);
      } else if (signal.signal_type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      } else if (signal.signal_type === "candidate" && signal.payload) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
      }
    } catch {
      toast.error("Signal d'appel instable, relance l'appel");
    }
  };

  const applyAdaptiveVideoQuality = async (pc: RTCPeerConnection) => {
    const profile = getCallProfile();
    const videoSender = pc.getSenders().find((sender) => sender.track?.kind === "video");
    if (!videoSender) return;
    try {
      const params = videoSender.getParameters();
      (params as any).encodings = [{ ...(params.encodings?.[0] || {}), maxBitrate: profile.bitrate, maxFramerate: profile.frameRate }];
      await videoSender.setParameters(params);
      const track = videoSender.track;
      await track?.applyConstraints({ width: { ideal: profile.width }, height: { ideal: profile.height }, frameRate: { ideal: profile.frameRate, max: profile.frameRate } });
      setCallState((current) => current ? { ...current, quality: profile.label } : current);
    } catch {
      setCallState((current) => current ? { ...current, quality: "Auto" } : current);
    }
  };

  const setupPeerCall = async (callId: string, type: "audio" | "video", media: MediaStream, remoteUserId: string, isCaller: boolean) => {
    closePeer();
    const pc = new RTCPeerConnection({
      bundlePolicy: "max-bundle",
      iceCandidatePoolSize: 4,
      iceServers: [
        ...getTurnIceServers(),
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" },
      ],
    });
    peerRef.current = pc;
    remoteStreamRef.current = new MediaStream();
    setRemoteConnected(false);

    media.getTracks().forEach(track => pc.addTrack(track, media));
    pc.ontrack = (event) => {
      const incoming = event.streams?.[0] || remoteStreamRef.current || new MediaStream();
      if (!event.streams?.[0] && !incoming.getTracks().some(track => track.id === event.track.id)) {
        incoming.addTrack(event.track);
      }
      remoteStreamRef.current = incoming;
      event.track.onunmute = () => setRemoteConnected(true);
      setRemoteConnected(true);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendCallSignal(callId, remoteUserId, "candidate", event.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") setRemoteConnected(true);
      if (state === "failed" || state === "disconnected") {
        setRemoteConnected(false);
        toast.info("Connexion appel instable, tentative de reprise");
        if (callReconnectTimerRef.current) window.clearTimeout(callReconnectTimerRef.current);
        callReconnectTimerRef.current = window.setTimeout(async () => {
          try {
            pc.restartIce?.();
            if (isCaller && pc.signalingState === "stable") {
              const offer = await pc.createOffer({ iceRestart: true, offerToReceiveAudio: true, offerToReceiveVideo: type === "video" });
              await pc.setLocalDescription(offer);
              await sendCallSignal(callId, remoteUserId, "offer", offer);
            }
          } catch {
            toast.error("Reconnexion appel impossible");
          }
        }, 1200);
      }
    };
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") setRemoteConnected(true);
      if (pc.iceConnectionState === "failed") pc.restartIce?.();
    };

    if (type === "video") {
      await applyAdaptiveVideoQuality(pc);
      if (callQualityTimerRef.current) window.clearInterval(callQualityTimerRef.current);
      callQualityTimerRef.current = window.setInterval(() => void applyAdaptiveVideoQuality(pc), 8000);
    }

    const channel = supabase
      .channel(`direct-call-signals-${callId}-${user?.id}`)
      .on("broadcast", { event: "call-ended" }, ({ payload }: any) => {
        if (payload?.callId === callId && payload?.senderId !== user?.id) {
          cleanupCallUi("Appel termine par l'autre utilisateur");
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_call_signals", filter: `call_id=eq.${callId}` }, (payload) => {
        void applyCallSignal(payload.new as any, pc, remoteUserId);
      })
      .subscribe();
    signalChannelRef.current = channel;

    const { data: existingSignals } = await (supabase as any)
      .from("direct_call_signals")
      .select("*")
      .eq("call_id", callId)
      .order("created_at", { ascending: true });
    for (const signal of existingSignals || []) {
      await applyCallSignal(signal, pc, remoteUserId);
    }

    if (isCaller) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });
      await pc.setLocalDescription(offer);
      await sendCallSignal(callId, remoteUserId, "offer", offer);
    }
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
      await saveChatBackground(`linear-gradient(180deg, rgba(0,0,0,.46), rgba(0,0,0,.76)), url("${data.publicUrl}") center / cover`);
    } catch {
      toast.error("Upload du fond impossible");
    } finally {
      if (backgroundInputRef.current) backgroundInputRef.current.value = "";
    }
  };

  const startCall = async (type: "audio" | "video") => {
    if (!user || !conversationId || !otherUserId || isBlocked || blockedByThem) return;
    try {
      setCallSeconds(0);
      setCallAudioLevel(0);
      callFacingModeRef.current = "user";
      setCallFacingMode("user");
      const profile = getCallProfile();
      setCallState({ type, status: "requesting", direction: "outgoing", muted: false, cameraOff: false, screenSharing: false, screenShareMode: null, speakerOn: true, quality: type === "video" ? profile.label : "Auto" });
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
        video: type === "video" ? { facingMode: "user", width: { ideal: profile.width }, height: { ideal: profile.height }, frameRate: { ideal: profile.frameRate, max: profile.frameRate } } : false,
      });
      callStreamRef.current = media;
      startAudioMeter(media);
      const { data, error } = await (supabase as any)
        .from("direct_call_sessions")
        .insert({ conversation_id: conversationId, caller_id: user.id, recipient_id: otherUserId, call_type: type, status: "ringing" })
        .select("id")
        .single();
      if (error || !data?.id) throw error || new Error("call signaling unavailable");
      callSessionRef.current = data?.id || null;
      await setupPeerCall(data.id, type, media, otherUserId, true);
      await supabase.from("notifications").insert({
        user_id: otherUserId,
        from_user_id: user.id,
        type: "message",
        content: type === "video" ? "Appel video entrant" : "Appel audio entrant",
        reference_id: conversationId,
      });
      startRingtone();
      setCallState({ type, status: "ringing", direction: "outgoing", muted: false, cameraOff: false, screenSharing: false, screenShareMode: null, speakerOn: true, quality: type === "video" ? profile.label : "Auto" });
      clearCallAutoEnd();
    } catch {
      stopRingtone();
      clearCallAutoEnd();
      callStreamRef.current?.getTracks().forEach(t => t.stop());
      callStreamRef.current = null;
      setCallState(null);
      toast.error(type === "video" ? "Autorise la camera/micro ou applique la migration appels" : "Autorise le micro ou applique la migration appels");
    }
  };

  const acceptIncomingCall = async (callOverride?: IncomingCall) => {
    const callToAccept = callOverride || incomingCall;
    if (!callToAccept || !user) return;
    try {
      const type = callToAccept.type;
      callSessionRef.current = callToAccept.id;
      setCallSeconds(0);
      setCallAudioLevel(0);
      callFacingModeRef.current = "user";
      setCallFacingMode("user");
      const profile = getCallProfile();
      setCallState({ type, status: "requesting", direction: "incoming", muted: false, cameraOff: false, screenSharing: false, screenShareMode: null, speakerOn: true, quality: type === "video" ? profile.label : "Auto" });
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
        video: type === "video" ? { facingMode: "user", width: { ideal: profile.width }, height: { ideal: profile.height }, frameRate: { ideal: profile.frameRate, max: profile.frameRate } } : false,
      });
      callStreamRef.current = media;
      startAudioMeter(media);
      await setupPeerCall(callToAccept.id, type, media, callToAccept.callerId, false);
      stopRingtone();
      setIncomingCall(null);
      await (supabase as any).from("direct_call_sessions").update({ status: "connected", started_at: new Date().toISOString() }).eq("id", callToAccept.id);
      setCallState({ type, status: "connected", direction: "incoming", muted: false, cameraOff: false, screenSharing: false, screenShareMode: null, speakerOn: true, quality: type === "video" ? profile.label : "Auto" });
    } catch {
      await (supabase as any).from("direct_call_sessions").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", callToAccept.id);
      cleanupCallUi("Appel refuse: permission micro/camera manquante");
    }
  };

  const declineIncomingCall = async () => {
    if (!incomingCall) return;
    await (supabase as any).from("direct_call_sessions").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", incomingCall.id);
    cleanupCallUi("Appel refuse");
  };

  const endCall = async () => {
    const sessionId = callSessionRef.current;
    stopRingtone();
    clearCallAutoEnd();
    if (sessionId) {
      await broadcastCallEnded(sessionId);
      try {
        await (supabase as any).from("direct_call_sessions").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", sessionId);
      } catch {
        // The call may already be gone; stopping local tracks is the important part.
      }
    }
    cleanupCallUi();
  };

  const replaceOutgoingVideoTrack = async (track: MediaStreamTrack | null) => {
    const sender = peerRef.current?.getSenders().find((item) => item.track?.kind === "video");
    if (!sender) return;
    await sender.replaceTrack(track);
  };

  const refreshLocalVideoPreview = () => {
    if (!localVideoRef.current) return;
    localVideoRef.current.srcObject = callStreamRef.current;
    localVideoRef.current.play().catch(() => {});
  };

  const stopScreenShare = async () => {
    const stream = callStreamRef.current;
    const cameraTrack = cameraTrackBeforeScreenRef.current;
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;
    if (!stream) {
      cameraTrackBeforeScreenRef.current = null;
      setCallState((current) => current ? { ...current, screenSharing: false, screenShareMode: null } : current);
      return;
    }

    stream.getVideoTracks().forEach(track => {
      if (track !== cameraTrack) {
        track.stop();
        stream.removeTrack(track);
      }
    });

    let restoredTrack = cameraTrack && cameraTrack.readyState === "live" ? cameraTrack : null;
    if (!restoredTrack && callStateRef.current?.type === "video") {
      try {
        const profile = getCallProfile();
        const replacement = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: callFacingModeRef.current, width: { ideal: profile.width }, height: { ideal: profile.height }, frameRate: { ideal: profile.frameRate, max: profile.frameRate } },
          audio: false,
        });
        restoredTrack = replacement.getVideoTracks()[0] || null;
      } catch {
        restoredTrack = null;
      }
    }

    if (restoredTrack) {
      restoredTrack.enabled = true;
      if (!stream.getVideoTracks().includes(restoredTrack)) stream.addTrack(restoredTrack);
    }
    cameraTrackBeforeScreenRef.current = null;
    await replaceOutgoingVideoTrack(restoredTrack);
    refreshLocalVideoPreview();
    setCallState((current) => current ? { ...current, screenSharing: false, screenShareMode: null, cameraOff: !restoredTrack, quality: restoredTrack ? current.quality : "Auto" } : current);
    if (restoredTrack) toast.success("Camera restauree");
  };

  const requestScreenCaptureStream = async () => {
    const mediaDevices = navigator.mediaDevices as MediaDevices & {
      getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
    };
    if (!window.isSecureContext) throw new Error("secure-context-required");
    if (!mediaDevices?.getDisplayMedia) throw new Error("screen-capture-unsupported");
    return mediaDevices.getDisplayMedia({
      video: {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
  };

  const toggleScreenShare = async () => {
    const current = callStateRef.current;
    if (!current || current.type !== "video" || !callStreamRef.current) return;
    if (current.screenSharing) {
      await stopScreenShare();
      return;
    }
    try {
      const displayStream = await requestScreenCaptureStream();
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error("screen track unavailable");
      const stream = callStreamRef.current;
      cameraTrackBeforeScreenRef.current = stream.getVideoTracks()[0] || cameraTrackBeforeScreenRef.current;
      stream.getVideoTracks().forEach(track => stream.removeTrack(track));
      stream.addTrack(screenTrack);
      screenStreamRef.current = displayStream;
      await replaceOutgoingVideoTrack(screenTrack);
      screenTrack.onended = () => { void stopScreenShare(); };
      refreshLocalVideoPreview();
      setCallState((state) => state ? { ...state, screenSharing: true, screenShareMode: "screen", cameraOff: false, quality: "HD" } : state);
      toast.success("Capture d'ecran en temps reel activee");
    } catch (err: any) {
      if (err?.name === "NotAllowedError") toast.info("Partage d'ecran annule");
      else if (err?.message === "secure-context-required") toast.error("Partage d'ecran disponible uniquement en HTTPS/PWA securisee");
      else if (err?.message === "screen-capture-unsupported") toast.error("Ce navigateur ne donne pas l'acces a la capture d'ecran");
      else toast.error("Partage d'ecran impossible sur cet appareil");
    }
  };

  const toggleCallMute = () => {
    setCallState((current) => {
      if (!current) return current;
      const nextMuted = !current.muted;
      callStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !nextMuted; });
      return { ...current, muted: nextMuted };
    });
  };

  const toggleCallCamera = () => {
    if (callStateRef.current?.screenSharing) {
      void stopScreenShare();
      return;
    }
    setCallState((current) => {
      if (!current) return current;
      const nextCameraOff = !current.cameraOff;
      callStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !nextCameraOff; });
      return { ...current, cameraOff: nextCameraOff };
    });
  };

  const flipCallCamera = async () => {
    if (!callStreamRef.current || callState?.type !== "video") return;
    if (callState.screenSharing) await stopScreenShare();
    const next = callFacingModeRef.current === "user" ? "environment" : "user";
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: next, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      });
      const nextTrack = replacement.getVideoTracks()[0];
      if (!nextTrack) throw new Error("camera track unavailable");
      callStreamRef.current.getVideoTracks().forEach(track => {
        track.stop();
        callStreamRef.current?.removeTrack(track);
      });
      callStreamRef.current?.addTrack(nextTrack);
      await replaceOutgoingVideoTrack(nextTrack);
      callFacingModeRef.current = next;
      setCallFacingMode(next);
      refreshLocalVideoPreview();
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
    backgroundPosition: "center",
    backgroundSize: "cover",
  };

  return (
    <div className="app-shell-height relative flex flex-col overflow-hidden bg-background md:pl-[var(--sidebar-width,260px)]">
      <div className="glass mobile-chat-header-safe z-10 flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/inbox")} className="tap-target grid place-items-center rounded-full">
          <ArrowLeft className="h-5 w-5 text-foreground" />
        </motion.button>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground sm:h-10 sm:w-10">
          {otherUserName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs font-semibold text-foreground sm:text-sm">{otherUserName}</span>
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
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => isGroupConversation ? startGroupCall("audio") : startCall("audio")} disabled={isBlocked || blockedByThem} aria-label="Appel audio" className="tap-target grid place-items-center rounded-full disabled:opacity-40">
            <Phone className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => isGroupConversation ? startGroupCall("video") : startCall("video")} disabled={isBlocked || blockedByThem} aria-label="Appel video" className="tap-target grid place-items-center rounded-full disabled:opacity-40">
            <Video className="h-5 w-5 text-muted-foreground" />
          </motion.button>
          {isGroupConversation && (
            <motion.button type="button" whileTap={{ scale: 0.9 }} onClick={() => openGroupWizard("add")} aria-label="Ajouter des amis au groupe" className="tap-target grid place-items-center rounded-full">
              <UserPlus className="h-5 w-5 text-muted-foreground" />
            </motion.button>
          )}
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowSafetyMenu(p => !p)} aria-label="Options sécurité" className="tap-target grid place-items-center rounded-full">
            <MoreVertical className="h-5 w-5 text-muted-foreground" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {showSafetyMenu && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="z-10 overflow-hidden border-b border-border bg-card/95 px-4 py-3">
            {isGroupConversation && (
              <div className="mx-auto mb-3 max-w-lg space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => openGroupWizard("add")} className="flex items-center justify-center gap-2 rounded-xl bg-primary/15 px-3 py-2 text-xs font-semibold text-primary">
                    <UserPlus className="h-4 w-4" /> Ajouter
                  </button>
                  <button onClick={() => addMentionToComposer("@tous")} className="flex items-center justify-center gap-2 rounded-xl bg-accent/15 px-3 py-2 text-xs font-semibold text-accent">
                    <BellRing className="h-4 w-4" /> @tous
                  </button>
                  <button onClick={deleteGroupConversation} className="flex items-center justify-center gap-2 rounded-xl bg-destructive px-3 py-2 text-xs font-semibold text-destructive-foreground">
                    <Trash2 className="h-4 w-4" /> Suppr.
                  </button>
                </div>
                <div className="rounded-2xl bg-background/55 p-3">
                  <p className="mb-2 text-xs font-black text-foreground">Membres du groupe</p>
                  <div className="space-y-2">
                    {conversationParticipants.map((participant) => (
                      <div key={participant.id} className="flex items-center gap-2 rounded-xl bg-card/70 px-2 py-2">
                        <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-[10px] font-black text-foreground">
                          {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" /> : participant.displayName[0]?.toUpperCase()}
                        </div>
                        <button type="button" onClick={() => addMentionToComposer(`@${participant.username}`)} className="min-w-0 flex-1 text-left">
                          <p className="truncate text-xs font-bold text-foreground">{participant.displayName}</p>
                          <p className="truncate text-[10px] text-muted-foreground">@{participant.username}</p>
                        </button>
                        {participant.id === user?.id ? (
                          <Crown className="h-4 w-4 text-primary" />
                        ) : (
                          <button type="button" onClick={() => removeGroupMember(participant.id)} className="grid h-8 w-8 place-items-center rounded-full bg-destructive/12 text-destructive" aria-label="Retirer du groupe">
                            <UserMinus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div className={`mx-auto grid max-w-lg grid-cols-2 gap-2 min-[390px]:grid-cols-3 ${isGroupConversation ? "hidden" : ""}`}>
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
              <button type="button" onClick={() => backgroundInputRef.current?.click()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-3 py-2.5 text-xs font-bold text-primary-foreground">
                <Upload className="h-3.5 w-3.5 text-primary-foreground" /> Uploader une image
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {incomingCall && !callState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[85] flex items-center justify-center bg-background/88 px-4 backdrop-blur-xl">
            <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }} className="w-full max-w-xs rounded-3xl border border-border bg-card p-5 text-center shadow-2xl">
              <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full gradient-primary text-2xl font-black text-primary-foreground">
                {otherUserName[0]}
              </div>
              <p className="text-lg font-bold text-foreground">{otherUserName}</p>
              <p className="mt-1 text-xs font-semibold text-primary">{incomingCall.type === "video" ? "Appel video entrant" : "Appel audio entrant"}</p>
              <div className="mt-5 flex items-center justify-center gap-5">
                <button type="button" onClick={declineIncomingCall} className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground" aria-label="Refuser l'appel">
                  <PhoneOff className="h-6 w-6" />
                </button>
                <button type="button" onClick={() => acceptIncomingCall()} className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Decrocher">
                  <Phone className="h-6 w-6" />
                </button>
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">La sonnerie se coupe si l'appel est annule ou manque.</p>
            </motion.div>
          </motion.div>
        )}
        {callState && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-background/88 px-3 py-[max(0.75rem,var(--app-safe-top))] backdrop-blur-xl">
            <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }} className="w-full max-w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
              <div className="relative h-[min(68svh,34rem)] bg-black sm:aspect-[3/4] sm:h-auto">
                {callState.type === "video" && !callState.cameraOff ? (
                  <>
                    <video ref={remoteVideoRef} className="h-full w-full object-cover" playsInline autoPlay />
                    {!remoteConnected && (
                      <div className="absolute inset-0 grid place-items-center bg-background/72 text-center backdrop-blur-sm">
                        <div className="px-5">
                          <SignalHigh className="mx-auto mb-2 h-6 w-6 text-primary" />
                          <p className="text-sm font-bold text-foreground">Connexion video...</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">Le flux de l'autre utilisateur arrive automatiquement.</p>
                        </div>
                      </div>
                    )}
                    <video
                      ref={localVideoRef}
                      className={`absolute bottom-3 right-3 rounded-2xl border border-border bg-black object-cover shadow-2xl ${callState.screenSharing ? "h-20 w-32" : "h-28 w-20"}`}
                      style={{ transform: callFacingMode === "user" && !callState.screenSharing ? "scaleX(-1)" : undefined }}
                      muted
                      playsInline
                      autoPlay
                    />
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-background via-card to-background">
                    <div className="grid h-24 w-24 place-items-center rounded-full gradient-primary text-3xl font-bold text-primary-foreground">{otherUserName[0]}</div>
                    <p className="text-sm font-semibold text-foreground">{callState.type === "video" ? "Camera coupée" : "Appel audio"}</p>
                  </div>
                )}
                <audio ref={remoteAudioRef} autoPlay playsInline />
                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-background/70 px-3 py-1 text-xs font-bold text-foreground backdrop-blur">
                  {callState.status === "ringing" ? <BellRing className="h-3.5 w-3.5 text-primary" /> : <SignalHigh className="h-3.5 w-3.5 text-accent" />}
                  {callState.status === "requesting" ? "Permissions" : callState.status === "ringing" ? callState.direction === "outgoing" ? "En attente" : "Sonnerie" : fmtTime(callSeconds)}
                </div>
                {callState.muted && (
                  <div className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-destructive/90 px-3 py-1 text-xs font-black text-destructive-foreground shadow-lg">
                    <MicOff className="h-3.5 w-3.5" /> Micro coupe
                  </div>
                )}
                {callState.screenSharing && (
                  <div className="absolute right-3 top-4 flex items-center gap-1.5 rounded-full bg-primary/90 px-3 py-1 text-xs font-black text-primary-foreground shadow-lg">
                    <ScreenShare className="h-3.5 w-3.5" /> {callState.screenShareMode === "camera" ? "Partage mobile" : "Ecran partage"}
                  </div>
                )}
              </div>
              <div className="space-y-2 border-b border-border px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-muted-foreground">
                  <span className="flex items-center gap-1"><SignalHigh className="h-3.5 w-3.5 text-primary" /> {callState.type === "video" ? "Video 1080p/30" : "Audio 48 kHz"}</span>
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-accent" /> Chiffre WebRTC</span>
                  <span>{remoteConnected ? "Pair a pair" : callState.quality}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Activity className="h-3.5 w-3.5 text-accent" />
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${callAudioLevel}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums">{callAudioLevel}%</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 p-3 sm:gap-3 sm:p-4">
                <button type="button" onClick={toggleCallMute} className={`grid h-12 w-12 place-items-center rounded-full ${callState.muted ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground"}`} aria-label={callState.muted ? "Réactiver le micro" : "Couper le micro"}>
                  {callState.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
                {callState.type === "video" && (
                  <button type="button" onClick={toggleCallCamera} className={`grid h-12 w-12 place-items-center rounded-full ${callState.cameraOff ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground"}`} aria-label={callState.cameraOff ? "Réactiver la camera" : "Couper la camera"}>
                    {callState.cameraOff ? <CameraOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                  </button>
                )}
                {callState.type === "video" && (
                  <button type="button" onClick={toggleScreenShare} className={`grid h-12 w-12 place-items-center rounded-full ${callState.screenSharing ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`} aria-label={callState.screenSharing ? "Arreter le partage" : "Partager l'ecran ou la camera mobile"}>
                    {callState.screenSharing ? <ScreenShareOff className="h-5 w-5" /> : <ScreenShare className="h-5 w-5" />}
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

      <AnimatePresence>
        {newMessagesCount > 0 && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.96 }}
            onClick={() => {
              pendingAutoScrollRef.current = true;
              setNewMessagesCount(0);
              scrollChatToBottom("smooth");
              void markAsRead();
            }}
            className="absolute left-1/2 top-[calc(max(4.25rem,var(--app-safe-top))+0.35rem)] z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/92 px-3 py-2 text-xs font-black text-foreground shadow-2xl backdrop-blur-xl"
          >
            <BellRing className="h-4 w-4 text-primary" />
            {newMessagesCount > 1 ? `${newMessagesCount} nouveaux messages` : "Nouveau message"}
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </motion.button>
        )}
      </AnimatePresence>

      <div ref={messagesPaneRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4 no-scrollbar" style={chatBackgroundStyle}>
        {loading ? (
          <div className="text-center py-8">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">Dis bonjour ! 👋</p>
        ) : (
          messages.map(msg => {
            const isOfficial = !msg.fromMe && msg.text?.startsWith("[BARDEUR · Équipe officielle]");
            const officialBody = isOfficial ? msg.text.replace("[BARDEUR · Équipe officielle]", "").trim() : msg.text;
            return (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`flex ${msg.fromMe ? "justify-end" : "justify-start"} group`}>
              <div className="relative max-w-[min(82vw,22rem)] sm:max-w-[min(75vw,28rem)]">
                {isOfficial && (
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    <span className="grid h-5 w-5 place-items-center rounded-full gradient-primary text-[10px] font-black text-primary-foreground">B</span>
                    BARDEUR · Officiel
                    <ShieldCheck className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div className={`px-4 py-2.5 text-sm ${msg.fromMe ? "gradient-primary text-primary-foreground rounded-2xl rounded-br-sm" : isOfficial ? "border border-primary/40 bg-primary/10 text-foreground rounded-2xl rounded-bl-sm" : "glass text-foreground rounded-2xl rounded-bl-sm"}`}>
                  {msg.replyPreview && (
                    <div className={`mb-2 rounded-xl border-l-2 px-2 py-1 text-[11px] ${msg.fromMe ? "border-primary-foreground/70 bg-primary-foreground/15 text-primary-foreground/85" : "border-primary bg-background/45 text-muted-foreground"}`}>
                      <span className="mb-0.5 flex items-center gap-1 font-bold"><Reply className="h-3 w-3" /> Reponse</span>
                      <span className="line-clamp-2">{msg.replyPreview}</span>
                    </div>
                  )}
                  {parsePollMessage(msg.text) && (
                    <PollBubble
                      poll={parsePollMessage(msg.text)!}
                      votes={pollVotes[msg.id] || {}}
                      currentUserId={user?.id || ""}
                      fromMe={msg.fromMe}
                      onVote={(option) => votePoll(msg, option)}
                    />
                  )}
                  {msg.mediaUrl && msg.mediaType?.startsWith("image") && (
                    <img src={msg.mediaUrl} alt="" className="mb-2 aspect-[4/5] max-h-[min(55svh,22rem)] w-full max-w-[min(76vw,20rem)] rounded-xl object-cover shadow-lg" loading="lazy" />
                  )}
                  {msg.mediaUrl && msg.mediaType?.startsWith("video") && (
                    <video src={msg.mediaUrl} className="mb-2 aspect-[4/5] max-h-[min(58svh,24rem)] w-full max-w-[min(76vw,20rem)] rounded-xl bg-black object-contain shadow-lg" controls playsInline preload="metadata" />
                  )}
                  {msg.mediaUrl && msg.mediaType?.startsWith("audio") && (
                    <div className="mb-1"><AudioBubble src={msg.mediaUrl} /></div>
                  )}
                  {msg.mediaUrl && msg.mediaType && !msg.mediaType.startsWith("image") && !msg.mediaType.startsWith("video") && !msg.mediaType.startsWith("audio") && (
                    <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 rounded-xl bg-background/45 px-3 py-2 text-xs font-bold underline-offset-4 hover:underline">
                      <FileUp className="h-4 w-4" /> Ouvrir le fichier
                    </a>
                  )}
                  {!parsePollMessage(msg.text) && officialBody && officialBody !== "Message supprimé" ? officialBody : !parsePollMessage(msg.text) && officialBody === "Message supprimé" ? <span className="italic opacity-60">{officialBody}</span> : null}
                </div>

                <div className={`flex items-center gap-1 mt-0.5 ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                  <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                  {msg.fromMe && <StatusIcon status={msg.status} />}
                  <button type="button" onClick={() => { setReplyTarget(msg); setShowPlusDrawer(false); }} className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Repondre</button>
                  <button type="button" onClick={() => setReactionTarget(msg)} className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">React</button>
                </div>
                {!!messageReactions[msg.id]?.length && (
                  <div className={`mt-1 flex flex-wrap gap-1 ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                    {messageReactions[msg.id].slice(0, 6).map((reaction, idx) => (
                      <span key={`${reaction}-${idx}`} className="rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-bold text-foreground shadow-sm">
                        {reaction}
                      </span>
                    ))}
                  </div>
                )}
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
            );
          })
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

      <AnimatePresence>
        {showPlusDrawer && !isRecordingAudio && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 12 }}
            animate={{ height: "auto", opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 12 }}
            className="border-t border-border bg-card/95 px-3 py-3 backdrop-blur-xl"
          >
            <div className="mx-auto grid max-w-lg grid-cols-4 gap-2">
              <ChatToolButton icon={<ImagePlus className="h-5 w-5" />} label="Media" onClick={() => imageInputRef.current?.click()} />
              <ChatToolButton icon={<FileUp className="h-5 w-5" />} label="Fichier" onClick={() => imageInputRef.current?.click()} />
              <ChatToolButton icon={<MapPin className="h-5 w-5" />} label="Lieu" onClick={shareLocation} />
              <ChatToolButton icon={<Contact className="h-5 w-5" />} label="Contact" onClick={sendContactCard} />
              <ChatToolButton icon={<BarChart3 className="h-5 w-5" />} label="Sondage" onClick={sendPoll} />
              <ChatToolButton icon={<Sticker className="h-5 w-5" />} label="Sticker" onClick={() => void sendStructuredMessage("Sticker/GIF partage: pack 3D fun")} />
              <ChatToolButton icon={<Music2 className="h-5 w-5" />} label="Playlist" onClick={() => void sendStructuredMessage("Playlist partagee: ajoute tes sons preferes pour le groupe")} />
              <ChatToolButton icon={<Gamepad2 className="h-5 w-5" />} label="Jeu" onClick={() => void sendStructuredMessage("Mini-jeu lance: devinez la prochaine video en 3 tours")} />
              <ChatToolButton icon={<Smile className="h-5 w-5" />} label="Emoji" onClick={() => setShowEmojis(p => !p)} />
              <ChatToolButton icon={<Users className="h-5 w-5" />} label="Groupe" onClick={createFriendGroupDraft} />
              {isGroupConversation && (
                <>
                  <ChatToolButton icon={<BellRing className="h-5 w-5" />} label="@Tous" onClick={() => addMentionToComposer("@tous")} />
                  <ChatToolButton icon={<UserPlus className="h-5 w-5" />} label="@Ami" onClick={openMentionPicker} />
                  <ChatToolButton icon={<Crown className="h-5 w-5" />} label="Defi" onClick={sendGroupChallenge} />
                  <ChatToolButton icon={<DoorOpen className="h-5 w-5" />} label="Capsule" onClick={sendGroupCapsule} />
                </>
              )}
              <ChatToolButton icon={<Flame className="h-5 w-5" />} label="Flamme" onClick={() => void sendStructuredMessage("Flamme relancee: reponds aujourd'hui pour garder la serie")} />
              <ChatToolButton icon={<Video className="h-5 w-5" />} label="Video" onClick={() => imageInputRef.current?.click()} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mobile-chat-composer-safe shrink-0 border-t border-border px-2 py-2 sm:px-4 sm:py-3">
        <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/*,application/pdf,text/*,.zip,.doc,.docx" className="hidden" onChange={e => sendAttachment(e.target.files?.[0])} />

        {(isBlocked || blockedByThem) && (
          <div className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">
            {isBlocked ? "Tu as bloqué cette conversation. Débloque pour réécrire." : "Cette conversation ne peut plus recevoir de messages."}
          </div>
        )}

        {replyTarget && !isRecordingAudio && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-foreground">
            <Reply className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-primary">Reponse a un message</p>
              <p className="truncate text-muted-foreground">{getMessagePreview(replyTarget)}</p>
            </div>
            <button type="button" onClick={() => setReplyTarget(null)} className="rounded-full bg-card p-1" aria-label="Annuler la reponse">
              <X className="h-3.5 w-3.5" />
            </button>
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
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setShowPlusDrawer(p => !p); setShowEmojis(false); }} className="tap-target grid shrink-0 place-items-center rounded-full bg-secondary" aria-label="Ouvrir les options de message">
              <Plus className="h-5 w-5 text-foreground" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => imageInputRef.current?.click()} disabled={uploadingImage || isBlocked || blockedByThem} className="tap-target grid shrink-0 place-items-center rounded-full disabled:opacity-40 max-[360px]:hidden" aria-label="Joindre un media">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </motion.button>
            <div className="glass flex min-h-11 min-w-0 flex-1 items-center rounded-full px-4 py-2.5">
              <input ref={messageInputRef} type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} onFocus={() => { setTimeout(() => scrollChatToBottom("smooth"), 280); }} placeholder={isBlocked || blockedByThem ? "Conversation bloquee" : "Message..."} disabled={isBlocked || blockedByThem} maxLength={500} enterKeyHint="send" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-base leading-5 text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50" />
            </div>

            {newMsg.trim() ? (
              <motion.button whileTap={{ scale: 0.85 }} onClick={sendMessage} disabled={isBlocked || blockedByThem} className="tap-target grid shrink-0 place-items-center rounded-full gradient-primary disabled:opacity-40">
                <Send className="h-4 w-4 text-primary-foreground" />
              </motion.button>
            ) : (
              <motion.button whileTap={{ scale: 0.85 }} onClick={startAudioRecording} disabled={isBlocked || blockedByThem} className="tap-target grid shrink-0 place-items-center rounded-full bg-secondary disabled:opacity-40">
                <Mic className="h-4 w-4 text-muted-foreground" />
              </motion.button>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {reactionTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setReactionTarget(null)}
            className="fixed inset-0 z-[88] flex items-end justify-center bg-background/50 px-4 pb-[max(1rem,var(--app-safe-bottom))] backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="chat-reaction-orb w-full max-w-sm rounded-3xl border border-border bg-card p-4 shadow-2xl"
            >
              <p className="mb-3 text-center text-xs font-bold uppercase text-muted-foreground">Reagir au message</p>
              <div className="grid grid-cols-3 gap-2">
                {quickReactions.map((reaction) => (
                  <button
                    key={reaction}
                    type="button"
                    onClick={() => reactToMessage(reactionTarget, reaction)}
                    className="rounded-2xl bg-secondary px-3 py-3 text-sm font-black text-foreground"
                  >
                    {reaction}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMentionPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMentionPicker(false)}
            className="fixed inset-0 z-[89] flex items-end justify-center bg-background/60 px-3 pb-[max(1rem,var(--app-safe-bottom))] backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 40, opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="group-wizard-3d w-full max-w-md rounded-3xl border border-border bg-card p-4 shadow-2xl"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-foreground">Taguer le groupe</p>
                  <p className="text-xs text-muted-foreground">@tous notifie chaque membre</p>
                </div>
                <button type="button" onClick={() => setShowMentionPicker(false)} className="grid h-9 w-9 place-items-center rounded-full bg-secondary" aria-label="Fermer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button type="button" onClick={() => addMentionToComposer("@tous")} className="mb-2 flex w-full items-center gap-3 rounded-2xl bg-accent/15 px-3 py-3 text-left">
                <BellRing className="h-5 w-5 text-accent" />
                <span>
                  <span className="block text-sm font-black text-foreground">@tous</span>
                  <span className="block text-xs text-muted-foreground">Notification pour tout le groupe</span>
                </span>
              </button>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1 no-scrollbar">
                {conversationParticipants.filter((participant) => participant.id !== user?.id).map((participant) => (
                  <button key={participant.id} type="button" onClick={() => addMentionToComposer(`@${participant.username}`)} className="flex w-full items-center gap-3 rounded-2xl bg-background/65 px-3 py-3 text-left">
                    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-black text-foreground">
                      {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" /> : participant.displayName[0]?.toUpperCase()}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-foreground">{participant.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{participant.username}</span>
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPollComposer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPollComposer(false)}
            className="fixed inset-0 z-[89] flex items-end justify-center bg-background/60 px-3 pb-[max(1rem,var(--app-safe-bottom))] backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 44, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 44, opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="poll-3d w-full max-w-md rounded-3xl border border-border bg-card p-4 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-black text-foreground">Sondage 3D</p>
                  <p className="text-xs text-muted-foreground">Votes visibles en direct dans le chat</p>
                </div>
                <button type="button" onClick={() => setShowPollComposer(false)} className="grid h-9 w-9 place-items-center rounded-full bg-secondary" aria-label="Fermer">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <label className="mb-3 block">
                <span className="mb-1 block text-xs font-bold text-muted-foreground">Question</span>
                <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} maxLength={140} className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-base text-foreground outline-none focus:border-primary" placeholder="Tu preferes quoi ?" />
              </label>
              <div className="space-y-2">
                {pollOptions.map((option, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input value={option} onChange={(e) => setPollOptions((current) => current.map((value, optionIdx) => optionIdx === idx ? e.target.value : value))} maxLength={40} className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-3 py-2.5 text-base text-foreground outline-none focus:border-primary" placeholder={`Option ${idx + 1}`} />
                    {pollOptions.length > 2 && (
                      <button type="button" onClick={() => setPollOptions((current) => current.filter((_, optionIdx) => optionIdx !== idx))} className="grid h-10 w-10 place-items-center rounded-full bg-destructive/12 text-destructive" aria-label="Retirer option">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" onClick={() => setPollOptions((current) => current.length >= 6 ? current : [...current, ""])} className="flex-1 rounded-2xl bg-secondary px-3 py-3 text-sm font-bold text-foreground">
                  Ajouter choix
                </button>
                <button type="button" onClick={createPollMessage} className="flex-1 rounded-2xl gradient-primary px-3 py-3 text-sm font-black text-primary-foreground">
                  Publier
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGroupWizard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowGroupWizard(false)}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-background/65 px-3 pb-[max(1rem,var(--app-safe-bottom))] backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 48, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 48, opacity: 0, scale: 0.96 }}
              onClick={(e) => e.stopPropagation()}
              className="group-wizard-3d w-full max-w-lg rounded-3xl border border-border bg-card p-4 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-foreground">{groupWizardMode === "create" ? "Creer un groupe" : "Ajouter des amis"}</p>
                  <p className="text-xs text-muted-foreground">{groupStep === "select" ? "Amis mutuels uniquement" : "Nom, options et appels 5 max"}</p>
                </div>
                <button type="button" onClick={() => setShowGroupWizard(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-secondary" aria-label="Fermer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {groupStep === "select" ? (
                <>
                  <div className="mb-3 rounded-2xl bg-background/65 px-3 py-2 text-xs font-bold text-muted-foreground">
                    {selectedGroupFriendIds.length} selectionne{selectedGroupFriendIds.length > 1 ? "s" : ""} {groupWizardMode === "create" ? "/ minimum 3" : ""}
                  </div>
                  <div className="max-h-[45svh] space-y-2 overflow-y-auto pr-1 no-scrollbar">
                    {friendOptions.length === 0 ? (
                      <div className="rounded-2xl bg-background/65 p-4 text-center text-xs text-muted-foreground">Aucun ami mutuel disponible pour le moment.</div>
                    ) : friendOptions.map((friend) => {
                      const selected = selectedGroupFriendIds.includes(friend.id);
                      return (
                        <button key={friend.id} type="button" onClick={() => toggleGroupFriend(friend.id)} className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${selected ? "bg-primary/18 ring-1 ring-primary/50" : "bg-background/65"}`}>
                          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-black text-foreground">
                            {friend.avatarUrl ? <img src={friend.avatarUrl} alt="" className="h-full w-full object-cover" /> : friend.displayName[0]?.toUpperCase()}
                          </div>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold text-foreground">{friend.displayName}</span>
                            <span className="block truncate text-xs text-muted-foreground">@{friend.username}</span>
                          </span>
                          {selected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={continueGroupWizard} className="mt-4 w-full rounded-2xl gradient-primary px-3 py-3 text-sm font-black text-primary-foreground">
                    Continuer
                  </button>
                </>
              ) : (
                <>
                  {groupWizardMode === "create" && (
                    <label className="mb-3 block">
                      <span className="mb-1 block text-xs font-bold text-muted-foreground">Nom du groupe</span>
                      <input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} className="w-full rounded-2xl border border-border bg-background px-3 py-3 text-base text-foreground outline-none focus:border-primary" placeholder="Nom du groupe" />
                    </label>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {["Flammes", "Videos", "Appels 5 max"].map((label) => (
                      <div key={label} className="rounded-2xl bg-background/65 p-3 text-center text-xs font-black text-foreground">
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => setGroupStep("select")} className="flex-1 rounded-2xl bg-secondary px-3 py-3 text-sm font-bold text-foreground">
                      Retour
                    </button>
                    <button type="button" onClick={submitGroupWizard} disabled={creatingGroup} className="flex-1 rounded-2xl gradient-primary px-3 py-3 text-sm font-black text-primary-foreground disabled:opacity-50">
                      {creatingGroup ? "..." : groupWizardMode === "create" ? "Creer" : "Ajouter"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {groupCallState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[86] flex items-center justify-center bg-background/88 px-4 backdrop-blur-xl"
          >
            <motion.div initial={{ scale: 0.94, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 20 }} className="w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
              <div className="relative aspect-[3/4] bg-black">
                {groupCallState.type === "video" ? (
                  <video ref={groupLocalVideoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
                ) : (
                  <div className="grid h-full place-items-center bg-gradient-to-br from-background via-card to-background text-center">
                    <div>
                      <Users className="mx-auto mb-3 h-10 w-10 text-primary" />
                      <p className="text-lg font-black text-foreground">Appel audio groupe</p>
                    </div>
                  </div>
                )}
                <div className="absolute left-4 top-4 rounded-full bg-background/70 px-3 py-1 text-xs font-bold text-foreground backdrop-blur">
                  {groupCallParticipants.length}/5 connectes
                </div>
              </div>
              <div className="space-y-2 p-4">
                <div className="grid grid-cols-5 gap-2">
                  {groupCallParticipants.map((participant) => (
                    <div key={participant.id} className="text-center">
                      <div className="mx-auto grid h-10 w-10 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-black text-foreground">
                        {participant.avatarUrl ? <img src={participant.avatarUrl} alt="" className="h-full w-full object-cover" /> : participant.displayName[0]?.toUpperCase()}
                      </div>
                      <p className="mt-1 truncate text-[10px] text-muted-foreground">{participant.displayName}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button type="button" onClick={() => toast.info("Micro local gere par la permission appareil")} className="grid h-12 w-12 place-items-center rounded-full bg-secondary text-foreground" aria-label="Micro groupe">
                    <Mic className="h-5 w-5" />
                  </button>
                  <button type="button" onClick={endGroupCall} className="grid h-12 w-12 place-items-center rounded-full bg-destructive text-destructive-foreground" aria-label="Quitter l'appel groupe">
                    <PhoneOff className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDeleteTarget(null)}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-card border border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              <p className="text-sm font-bold text-foreground text-center">Supprimer ce message ?</p>
              <p className="mt-1 text-xs text-muted-foreground text-center line-clamp-2">{deleteTarget.text || "Média"}</p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => deleteForMe(deleteTarget.id)}
                  className="w-full rounded-2xl bg-secondary px-4 py-3 text-sm font-semibold text-foreground"
                >
                  Supprimer pour moi
                </button>
                <button
                  type="button"
                  onClick={() => deleteForBoth(deleteTarget.id)}
                  className="w-full rounded-2xl bg-destructive px-4 py-3 text-sm font-bold text-destructive-foreground"
                >
                  Supprimer pour nous deux
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="w-full rounded-2xl bg-transparent px-4 py-3 text-sm text-muted-foreground"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PollBubble({
  poll,
  votes,
  currentUserId,
  fromMe,
  onVote,
}: {
  poll: PollPayload;
  votes: Record<string, string[]>;
  currentUserId: string;
  fromMe: boolean;
  onVote: (option: string) => void;
}) {
  const total = Object.values(votes).reduce((sum, ids) => sum + ids.length, 0);

  return (
    <div className={`poll-3d mb-1 min-w-[13rem] rounded-2xl p-3 ${fromMe ? "bg-primary-foreground/15" : "bg-background/55"}`}>
      <p className="mb-3 text-sm font-black leading-snug">{poll.question}</p>
      <div className="space-y-2">
        {poll.options.map((option) => {
          const count = votes[option]?.length || 0;
          const percent = total ? Math.round((count / total) * 100) : 0;
          const selected = votes[option]?.includes(currentUserId);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onVote(option)}
              className={`relative min-h-11 w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${selected ? "border-primary bg-primary/18" : "border-white/10 bg-background/45"}`}
            >
              <motion.span
                className="absolute inset-y-0 left-0 rounded-xl bg-primary/28"
                initial={false}
                animate={{ width: `${percent}%` }}
                transition={{ duration: 0.28 }}
              />
              <span className="relative z-10 flex items-center justify-between gap-3 text-xs font-black">
                <span className="truncate">{option}</span>
                <span className="shrink-0 tabular-nums">{count} vote{count > 1 ? "s" : ""} · {percent}%</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] font-bold opacity-70">{total} vote{total > 1 ? "s" : ""} au total</p>
    </div>
  );
}

function ChatToolButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92, rotateX: 8 }}
      onClick={onClick}
      className="chat-tool-3d flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-background/75 px-2 py-2 text-[10px] font-bold text-foreground shadow-sm"
    >
      <span className="text-primary">{icon}</span>
      <span className="leading-tight">{label}</span>
    </motion.button>
  );
}
