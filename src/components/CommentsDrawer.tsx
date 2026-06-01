import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Send, Sticker, Mic, Trash2, Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { checkClientRateLimit, formatRetryAfter } from "@/lib/clientRateLimit";
import { validateUserText } from "@/lib/contentSafety";
import { getBestAudioRecorderOptions } from "@/lib/mediaCapabilities";
import AudioBubble from "@/components/AudioBubble";

interface Comment {
  id: string;
  userId: string;
  user: { name: string; avatar: string; verified: boolean };
  text: string;
  likes: number;
  liked: boolean;
  time: string;
  replies: number;
  mediaUrl?: string;
  mediaType?: string;
}

const quickReactions = ["❤️", "🔥", "😂", "😍", "🤯", "👏", "💀", "😭"];
const stickerPacks = ["🎉", "🦄", "🌈", "⚡", "💎", "🎭", "🎪", "🚀", "🌟", "🎯", "🎨", "🎵"];

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  commentCount: number;
  videoId?: string | null;
  videoOwnerId?: string | null;
}

export default function CommentsDrawer({ isOpen, onClose, commentCount, videoId, videoOwnerId }: CommentsDrawerProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showStickers, setShowStickers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mutuals, setMutuals] = useState<Array<{ id: string; username: string; display_name: string; avatar_url: string }>>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const cancelledAudioRef = useRef(false);
  const { user, profile } = useAuth();

  useEffect(() => {
    if (isOpen && videoId) {
      fetchComments();
    }
    if (isOpen && user) {
      fetchMutuals();
    }
  }, [isOpen, videoId, user?.id]);

  useEffect(() => {
    if (!isRecordingAudio) { setRecordingTime(0); return; }
    const interval = window.setInterval(() => setRecordingTime(t => t + 1), 1000);
    return () => window.clearInterval(interval);
  }, [isRecordingAudio]);

  useEffect(() => {
    if (isRecordingAudio && recordingTime >= 45) stopAudioRecording();
  }, [isRecordingAudio, recordingTime]);

  useEffect(() => {
    return () => audioStreamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // Mutual followers only (DMs/mentions require mutual follow per project rule).
  const fetchMutuals = async () => {
    if (!user) return;
    const [follows1, follows2] = await Promise.all([
      supabase.from("follows").select("following_id").eq("follower_id", user.id),
      supabase.from("follows").select("follower_id").eq("following_id", user.id),
    ]);
    const followingSet = new Set((follows1.data || []).map((r: any) => r.following_id));
    const followerSet = new Set((follows2.data || []).map((r: any) => r.follower_id));
    const mutualIds = Array.from(followingSet).filter(id => followerSet.has(id));
    if (!mutualIds.length) { setMutuals([]); return; }
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", mutualIds as string[]);
    setMutuals((profs || []).map((p: any) => ({
      id: p.id,
      username: p.username || "user",
      display_name: p.display_name || p.username || "Ami",
      avatar_url: p.avatar_url || "",
    })));
  };

  // Detect "@partial" being typed at the caret position to drive autocomplete.
  const updateMentionQuery = (value: string) => {
    const caret = inputRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)@([\p{L}0-9_.-]{0,24})$/u);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };

  const handleCommentChange = (value: string) => {
    setNewComment(value);
    updateMentionQuery(value);
  };

  const insertMention = (username: string) => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? newComment.length;
    const before = newComment.slice(0, caret).replace(/@([\p{L}0-9_.-]*)$/u, `@${username} `);
    const after = newComment.slice(caret);
    const next = `${before}${after}`.slice(0, 280);
    setNewComment(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      const pos = before.length;
      input?.setSelectionRange(pos, pos);
    });
  };

  const filteredMutuals = mentionQuery === null
    ? []
    : mutuals
        .filter(m => !mentionQuery || m.username.toLowerCase().includes(mentionQuery) || m.display_name.toLowerCase().includes(mentionQuery))
        .slice(0, 5);

  const fetchComments = async () => {
    if (!videoId) return;
    setLoading(true);
    const { data } = await supabase
      .from("comments")
      .select("*, profiles:user_id(username, display_name, avatar_url)")
      .eq("video_id", videoId)
      .is("parent_id", null)
      .order("created_at", { ascending: false });

    if (data) {
      setComments(data.map((c: any) => ({
        id: c.id,
        userId: c.user_id,
        user: {
          name: c.profiles?.username || "unknown",
          avatar: c.profiles?.display_name?.[0] || "?",
          verified: false,
        },
        text: c.content,
        likes: c.likes_count || 0,
        liked: false,
        time: getTimeAgo(c.created_at),
        replies: 0,
        mediaUrl: c.media_url || undefined,
        mediaType: c.media_type || undefined,
      })));
    }
    setLoading(false);
  };

  const getTimeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "maintenant";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}j`;
  };
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const addComment = async () => {
    if (!newComment.trim() || !user || !videoId) {
      if (!user) toast.error("Connecte-toi pour commenter");
      return;
    }
    const rate = checkClientRateLimit({ key: `comment:${videoId}:${user.id}`, limit: 8, windowMs: 60_000, cooldownMs: 1200, blockMs: 45_000 });
    if (!rate.allowed) { toast.error(`Commentaires ralentis, réessaie dans ${formatRetryAfter(rate.retryAfterMs)}`); return; }
    const validation = validateUserText(newComment, { maxLength: 280, allowLinks: false });
    if (!validation.ok) { toast.error(validation.reason || "Commentaire refusé"); return; }
    const { error } = await supabase.from("comments").insert({
      user_id: user.id,
      video_id: videoId,
      content: validation.value,
    });
    if (error) { toast.error("Erreur lors de l'envoi"); return; }
    setNewComment("");
    fetchComments();
  };

  const startAudioRecording = async () => {
    if (!user || !videoId) {
      toast.error("Connecte-toi pour commenter");
      return;
    }
    const rate = checkClientRateLimit({ key: `comment-audio:${videoId}:${user.id}`, limit: 4, windowMs: 60_000, cooldownMs: 1500, blockMs: 45_000 });
    if (!rate.allowed) { toast.error(`Vocaux ralentis, réessaie dans ${formatRetryAfter(rate.retryAfterMs)}`); return; }
    try {
      const recorderOptions = getBestAudioRecorderOptions(128000);
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
        await sendAudioComment(blob, recorderOptions.extension, recorderOptions.contentType);
      };
      mr.start(250);
      audioRecorderRef.current = mr;
      setIsRecordingAudio(true);
    } catch {
      toast.error("Autorise le micro pour commenter en vocal");
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

  const sendAudioComment = async (blob: Blob, extension = "webm", contentType = "audio/webm") => {
    if (!user || !videoId) return;
    try {
      const path = `${user.id}/comment-audio/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, blob, { contentType });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const { error } = await (supabase as any).from("comments").insert({
        user_id: user.id,
        video_id: videoId,
        content: "Commentaire vocal",
        media_url: data.publicUrl,
        media_type: contentType,
      });
      if (error) throw error;
      toast.success("Commentaire vocal envoyé");
      fetchComments();
    } catch {
      toast.error("Erreur envoi vocal");
    }
  };

  const toggleLike = (id: string) => {
    setComments(prev => prev.map(c =>
      c.id === id ? { ...c, liked: !c.liked, likes: c.liked ? Math.max(0, c.likes - 1) : c.likes + 1 } : c
    ));
  };

  const canDeleteComment = (comment: Comment) => !!user && (comment.userId === user.id || videoOwnerId === user.id);

  const deleteComment = async (comment: Comment) => {
    if (!user) return;
    if (!window.confirm("Supprimer ce commentaire ?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", comment.id);
    if (error) { toast.error("Suppression impossible"); return; }
    setComments(prev => prev.filter(c => c.id !== comment.id));
    toast.success("Commentaire supprimé");
  };

  const reportComment = async (comment: Comment) => {
    if (!user || !videoId) {
      toast.error("Connecte-toi pour signaler");
      return;
    }
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: comment.userId,
      video_id: videoId,
      comment_id: comment.id,
      type: "comment",
      reason: "Signalement depuis les commentaires",
      status: "pending",
    });
    if (error) toast.error("Signalement impossible");
    else toast.success("Signalement envoye");
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[60] bg-background/60" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[75svh] rounded-t-3xl bg-card border-t border-border flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-sm font-bold text-foreground tabular-nums">{comments.length} commentaires</span>
              <motion.button whileTap={{ scale: 0.9 }} onClick={onClose}><X className="h-5 w-5 text-muted-foreground" /></motion.button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-3 space-y-4">
              {loading ? (
                <div className="text-center py-8">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto" />
                </div>
              ) : comments.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Aucun commentaire. Sois le premier ! 💬</p>
              ) : (
                comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="h-9 w-9 shrink-0 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground">
                      {comment.user.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-semibold text-foreground">{comment.user.name}</span>
                        <span className="text-[10px] text-muted-foreground">{comment.time}</span>
                      </div>
                      <p className="text-sm text-foreground/90 mb-1">{comment.text}</p>
                      {comment.mediaUrl && comment.mediaType?.startsWith("audio") && (
                        <div className="mb-2 max-w-[260px]"><AudioBubble src={comment.mediaUrl} compact /></div>
                      )}
                      <div className="flex items-center gap-4">
                        <button onClick={() => toggleLike(comment.id)} className="flex items-center gap-1">
                          <Heart className={`h-3.5 w-3.5 ${comment.liked ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                          <span className="text-[10px] text-muted-foreground tabular-nums">{comment.likes}</span>
                        </button>
                        <button className="text-[10px] font-medium text-muted-foreground">Répondre</button>
                        {canDeleteComment(comment) ? (
                          <button
                            type="button"
                            onClick={() => deleteComment(comment)}
                            className="ml-auto flex items-center gap-1 text-[10px] font-medium text-destructive"
                            aria-label="Supprimer le commentaire"
                          >
                            <Trash2 className="h-3 w-3" /> Supprimer
                          </button>
                        ) : user ? (
                          <button
                            type="button"
                            onClick={() => reportComment(comment)}
                            className="ml-auto flex items-center gap-1 text-[10px] font-medium text-muted-foreground"
                            aria-label="Signaler le commentaire"
                          >
                            <Flag className="h-3 w-3" /> Signaler
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <AnimatePresence>
              {showStickers && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border px-4 py-3">
                  <div className="grid grid-cols-6 gap-2">
                    {stickerPacks.map(s => (
                      <motion.button key={s} whileTap={{ scale: 1.3 }} onClick={() => { setNewComment(p => p + s); setShowStickers(false); }} className="text-2xl glass rounded-lg py-2">
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {!isRecordingAudio && newComment.trim() && (
                <div className="mb-2 flex justify-end">
                  <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-primary/15 px-3 py-2 text-xs text-foreground">
                    {newComment.slice(0, 120)}
                  </div>
                </div>
              )}
              {isRecordingAudio ? (
                <div className="flex items-center gap-2">
                  <button type="button" onClick={cancelAudioRecording} className="grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div className="glass flex flex-1 items-center gap-2 rounded-full px-4 py-2.5">
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                    <span className="text-sm font-bold text-foreground">{fmtTime(recordingTime)}</span>
                    <span className="text-xs text-muted-foreground">Commentaire vocal</span>
                  </div>
                  <button type="button" onClick={stopAudioRecording} className="grid h-10 w-10 place-items-center rounded-full gradient-primary">
                    <Send className="h-4 w-4 text-primary-foreground" />
                  </button>
                </div>
              ) : (
              <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <div className="h-8 w-8 shrink-0 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {profile?.display_name?.[0] || "?"}
                </div>
                <div className="glass flex min-w-0 flex-1 items-center gap-2 rounded-full px-3 py-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addComment()}
                    maxLength={280}
                    placeholder={user ? "Ajouter un commentaire..." : "Connecte-toi pour commenter"}
                    disabled={!user}
                    className="min-w-0 flex-1 bg-transparent text-base leading-5 text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50"
                  />
                  <button onClick={() => setShowStickers(p => !p)}><Sticker className="h-4 w-4 text-muted-foreground" /></button>
                </div>
                {!newComment.trim() && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.85 }}
                    onClick={startAudioRecording}
                    className={`rounded-full p-2 transition-colors ${user ? "bg-secondary" : "bg-secondary/50"}`}
                    disabled={!user}
                    aria-label="Commentaire vocal"
                  >
                    <Mic className="h-4 w-4 text-muted-foreground" />
                  </motion.button>
                )}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.85 }}
                  onClick={addComment}
                  className={`rounded-full p-2 transition-colors ${newComment.trim() && user ? "gradient-primary" : "bg-secondary"}`}
                >
                  <Send className={`h-4 w-4 ${newComment.trim() && user ? "text-primary-foreground" : "text-muted-foreground"}`} />
                </motion.button>
              </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
