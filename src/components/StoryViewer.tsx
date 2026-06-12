import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pause, Play, Volume2, VolumeX, Trash2, Eye, Clock, ShieldCheck, Send, Paperclip, LockKeyhole, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { validateUploadFile, validateUserText } from "@/lib/contentSafety";

export interface StoryItem {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption?: string | null;
  created_at: string;
  audience?: string | null;
  expires_at?: string | null;
  views_count?: number | null;
  author?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null;
}

interface Props {
  stories: StoryItem[];
  initialIndex?: number;
  onClose: () => void;
}

const IMAGE_DURATION_MS = 5000;

export const storyHiddenStorageKey = (userId: string) => `hidden-stories:${userId}`;

export function getHiddenStoryIds(userId?: string | null) {
  if (!userId || typeof window === "undefined") return new Set<string>();
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(storyHiddenStorageKey(userId)) || "[]"));
  } catch {
    return new Set<string>();
  }
}

function hideStoryForUser(userId: string, storyId: string) {
  const hidden = getHiddenStoryIds(userId);
  hidden.add(storyId);
  localStorage.setItem(storyHiddenStorageKey(userId), JSON.stringify(Array.from(hidden)));
}

/**
 * Full-screen TikTok-style story viewer:
 * - progress bars at top
 * - tap left/right zones to navigate, tap middle to pause/play
 * - swipe down / X to close
 * - records views via story_views
 */
export default function StoryViewer({ stories, initialIndex = 0, onClose }: Props) {
  const { user } = useAuth();
  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [viewCount, setViewCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const replyFileRef = useRef<HTMLInputElement>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const elapsedAtPauseRef = useRef<number>(0);

  const current = stories[index];
  const isVideo = !!current?.media_type?.startsWith("video");
  const isOwner = user?.id === current?.user_id;

  useEffect(() => {
    setViewCount(Math.max(0, current?.views_count || 0));
  }, [current?.id, current?.views_count]);

  // Record a view (best effort)
  useEffect(() => {
    if (!current || !user) return;
    let cancelled = false;
    const record = async () => {
      try {
        const { data, error } = await (supabase as any).rpc("record_story_view", { _story_id: current.id });
        if (!cancelled && !error && typeof data === "number") {
          setViewCount(Math.max(0, data));
          return;
        }
      } catch {
        // Fallback below keeps older databases usable before the migration is applied.
      }
      try {
        if (user.id !== current.user_id) {
          await (supabase as any)
            .from("story_views")
            .upsert(
              { story_id: current.id, viewer_id: user.id, viewed_at: new Date().toISOString() },
              { onConflict: "story_id,viewer_id", ignoreDuplicates: true },
            );
        }
        const { data: story } = await (supabase as any).from("stories").select("views_count").eq("id", current.id).maybeSingle();
        if (!cancelled && typeof story?.views_count === "number") setViewCount(Math.max(0, story.views_count));
      } catch {
        // Best effort only.
      }
    };
    void record();
    return () => { cancelled = true; };
  }, [current?.id, user?.id]);

  // Progress loop
  useEffect(() => {
    setProgress(0);
    startedAtRef.current = Date.now();
    elapsedAtPauseRef.current = 0;
  }, [index]);

  useEffect(() => {
    if (!current) return;
    const tick = () => {
      if (paused) { rafRef.current = requestAnimationFrame(tick); return; }
      let pct = 0;
      if (isVideo && videoRef.current && videoRef.current.duration) {
        pct = Math.min(1, videoRef.current.currentTime / videoRef.current.duration);
      } else {
        pct = Math.min(1, (Date.now() - startedAtRef.current + elapsedAtPauseRef.current) / IMAGE_DURATION_MS);
      }
      setProgress(pct);
      if (pct >= 1) {
        next();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [index, paused, isVideo, current?.id]);

  const next = () => {
    if (index >= stories.length - 1) { onClose(); return; }
    setIndex(i => i + 1);
  };
  const prev = () => setIndex(i => Math.max(0, i - 1));

  const deleteCurrent = async () => {
    if (!current || !user) return;
    if (!window.confirm("Supprimer cette story ?")) return;
    const { error } = await (supabase as any).from("stories").delete().eq("id", current.id).eq("user_id", user.id);
    if (error) { toast.error("Suppression impossible"); return; }
    toast.success("Story supprimée");
    if (stories.length <= 1) { onClose(); return; }
    stories.splice(index, 1);
    setIndex(i => Math.min(i, stories.length - 1));
  };

  const hideCurrentForMe = () => {
    if (!current || !user || isOwner) return;
    hideStoryForUser(user.id, current.id);
    toast.success("Story masquee pour toi");
    if (stories.length <= 1) { onClose(); return; }
    stories.splice(index, 1);
    setIndex(i => Math.min(i, stories.length - 1));
  };

  const togglePause = () => {
    setPaused(p => {
      const np = !p;
      if (np) {
        elapsedAtPauseRef.current += Date.now() - startedAtRef.current;
        if (isVideo) videoRef.current?.pause();
      } else {
        startedAtRef.current = Date.now();
        if (isVideo) videoRef.current?.play().catch(() => {});
      }
      return np;
    });
  };

  const sendStoryReply = async () => {
    if (!current || !user || isOwner) return;
    if (!replyText.trim() && !replyFile) {
      toast.error("Ajoute une reponse ou une piece jointe");
      return;
    }
    const validation = validateUserText(replyText, { maxLength: 500, minLength: 0, allowLinks: false });
    if (!validation.ok) {
      toast.error(validation.reason || "Reponse refusee");
      return;
    }
    setSendingReply(true);
    try {
      let mediaUrl = "";
      let mediaType = "";
      if (replyFile) {
        const fileCheck = validateUploadFile(replyFile, { maxBytes: 25 * 1024 * 1024, acceptedPrefixes: ["image/", "video/", "audio/"] });
        if (!fileCheck.ok) throw new Error(fileCheck.reason);
        const ext = replyFile.name.split(".").pop() || "bin";
        const path = `${user.id}/story-replies/${current.id}-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("media").upload(path, replyFile, { contentType: replyFile.type || "application/octet-stream" });
        if (error) throw error;
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        mediaUrl = data.publicUrl;
        mediaType = replyFile.type || "application/octet-stream";
      }
      const { data: conversationId, error: convError } = await supabase.rpc("find_or_create_direct_conversation", { _other_user_id: current.user_id } as any);
      if (convError || !conversationId) throw convError || new Error("Conversation indisponible");
      const storyLabel = current.audience === "private" ? "story privee" : current.audience === "friends" ? "story amis" : "story publique";
      const content = `Reponse a ta ${storyLabel}: ${validation.value || "Piece jointe"}`;
      await (supabase as any).from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        media_url: mediaUrl,
        media_type: mediaType,
        content_version: "plain",
      });
      try {
        await (supabase as any).from("story_replies").insert({
          story_id: current.id,
          sender_id: user.id,
          recipient_id: current.user_id,
          conversation_id: conversationId,
          content: validation.value,
          media_url: mediaUrl,
          media_type: mediaType,
        });
      } catch {
        // The DM is the source of truth if the optional story_replies table is not live yet.
      }
      await supabase.from("notifications").insert({
        user_id: current.user_id,
        from_user_id: user.id,
        type: "message",
        content: `Nouvelle reponse a ta ${storyLabel}`,
        reference_id: conversationId,
      });
      setReplyText("");
      setReplyFile(null);
      if (replyFileRef.current) replyFileRef.current.value = "";
      toast.success("Reponse envoyee en message");
    } catch (err: any) {
      toast.error(err?.message || "Reponse impossible");
    } finally {
      setSendingReply(false);
    }
  };

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === " ") { e.preventDefault(); togglePause(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index]);

  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[120] bg-black"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => { if (info.offset.y > 120) onClose(); }}
      >
        {/* Media */}
        <div className="absolute inset-0 grid place-items-center">
          {isVideo ? (
            <video
              ref={videoRef}
              key={current.id}
              src={current.media_url}
              autoPlay
              muted={muted}
              playsInline
              className="h-full w-full object-contain"
              onEnded={next}
              onLoadedMetadata={() => { startedAtRef.current = Date.now(); }}
            />
          ) : (
            <img src={current.media_url} alt="" className="h-full w-full object-contain" />
          )}
        </div>

        {/* Progress bars */}
        <div className="absolute left-0 right-0 top-0 z-30 flex gap-1 px-3 pt-[calc(max(0.6rem,var(--app-safe-top))+0.2rem)]">
          {stories.map((_, i) => (
            <div
              key={i}
              className="h-2 flex-1 cursor-pointer py-[3px]"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (i !== index) setIndex(i);
              }}
            >
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full bg-white transition-[width] ease-linear"
                  style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%`, transitionDuration: i === index ? "60ms" : "0ms" }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute left-0 right-0 top-0 z-20 flex items-center gap-3 px-4 pt-[calc(max(1.2rem,var(--app-safe-top))+0.8rem)]">
          <div className="h-9 w-9 overflow-hidden rounded-full bg-white/10 ring-2 ring-white/40">
            {current.author?.avatar_url ? (
              <img src={current.author.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm font-bold text-white">
                {(current.author?.display_name || current.author?.username || "?")[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white drop-shadow">
              {current.author?.display_name || current.author?.username || "Story"}
            </p>
            <p className="text-[11px] text-white/70">{timeAgo(current.created_at)}</p>
          </div>
          {isVideo && (
            <button type="button" onClick={() => setMuted(m => !m)} className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white">
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          )}
          <button type="button" onClick={togglePause} className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white">
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          {isOwner && (
            <button type="button" onClick={deleteCurrent} aria-label="Supprimer la story" className="grid h-9 w-9 place-items-center rounded-full bg-destructive/80 text-destructive-foreground">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {!isOwner && (
            <button type="button" onClick={hideCurrentForMe} aria-label="Masquer cette story pour moi" className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white">
              <EyeOff className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Caption */}
        {current.caption && (
          <div className="pointer-events-none absolute bottom-40 left-4 right-4 z-10 text-center text-sm font-medium text-white drop-shadow">
            {current.caption}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/55 to-transparent px-4 pb-[calc(max(1rem,var(--app-safe-bottom))+4.6rem)] pt-16">
          <div className="grid grid-cols-3 gap-2 text-white">
            <div className="rounded-xl bg-white/10 p-2 backdrop-blur">
              {current.audience === "private" ? <LockKeyhole className="mb-1 h-4 w-4 text-primary" /> : <ShieldCheck className="mb-1 h-4 w-4 text-primary" />}
              <p className="text-[10px] uppercase text-white/55">Audience</p>
              <p className="truncate text-xs font-bold">{audienceLabel(current.audience)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2 backdrop-blur">
              <Clock className="mb-1 h-4 w-4 text-accent" />
              <p className="text-[10px] uppercase text-white/55">Expire</p>
              <p className="truncate text-xs font-bold">{timeLeft(current.expires_at)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2 backdrop-blur">
              <Eye className="mb-1 h-4 w-4 text-white" />
              <p className="text-[10px] uppercase text-white/55">Vues</p>
              <p className="truncate text-xs font-bold">{isOwner ? viewCount : "Prive"}</p>
            </div>
          </div>
        </div>

        {!isOwner && (
          <div className="absolute bottom-0 left-0 right-0 z-30 px-3 pb-[max(0.65rem,var(--app-safe-bottom))]">
            <input
              ref={replyFileRef}
              type="file"
              accept="image/*,video/*,audio/*"
              className="hidden"
              onChange={(e) => setReplyFile(e.target.files?.[0] || null)}
            />
            {replyFile && (
              <div className="mx-auto mb-2 flex max-w-lg items-center justify-between rounded-2xl bg-white/12 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
                <span className="truncate">{replyFile.name}</span>
                <button type="button" onClick={() => setReplyFile(null)} className="rounded-full bg-black/30 p-1" aria-label="Retirer la piece jointe">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="mx-auto flex max-w-lg items-center gap-2 rounded-full bg-black/48 p-1.5 text-white backdrop-blur-xl ring-1 ring-white/15">
              <button type="button" onClick={() => replyFileRef.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/12" aria-label="Joindre a la reponse">
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onFocus={() => setPaused(true)}
                placeholder={current.audience === "private" ? "Repondre a la story privee..." : "Repondre a la story..."}
                maxLength={500}
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/55"
              />
              <button type="button" onClick={sendStoryReply} disabled={sendingReply || (!replyText.trim() && !replyFile)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-45" aria-label="Envoyer la reponse story">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tap zones */}
        <button type="button" aria-label="Précédent" onClick={prev} className="absolute left-0 top-0 z-10 h-full w-1/3" />
        <button type="button" aria-label="Pause" onClick={togglePause} className="absolute left-1/3 top-0 z-10 h-full w-1/3" />
        <button type="button" aria-label="Suivant" onClick={next} className="absolute right-0 top-0 z-10 h-full w-1/3" />
      </motion.div>
    </AnimatePresence>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}

function audienceLabel(audience?: string | null) {
  if (audience === "private") return "Privee";
  if (audience === "friends") return "Amis";
  if (audience === "followers") return "Abonnes";
  return "Public";
}

function timeLeft(expiresAt?: string | null) {
  if (!expiresAt) return "24h";
  const minutesLeft = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 60000));
  if (minutesLeft <= 0) return "Expiree";
  if (minutesLeft < 60) return `${minutesLeft} min`;
  const hours = Math.floor(minutesLeft / 60);
  const minutes = minutesLeft % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
