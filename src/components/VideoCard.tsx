import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, MessageCircle, Share2, Bookmark, Music, Volume2, VolumeX,
  BadgeCheck, Trophy, Download, Gauge, SkipForward, Flag, Link2, Flame, Send,
  Play, Pause, X, Maximize2, Minimize2, MoreHorizontal
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { VideoData, formatCount } from "@/data/mockVideos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface VideoCardProps {
  video: VideoData;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenComments: (count: number) => void;
  onOpenGamification: () => void;
}

function FloatingHeart({ id, x, y, onDone }: { id: string; x: number; y: number; onDone: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(id), 900);
    return () => clearTimeout(t);
  }, [id, onDone]);
  const rotation = Math.random() * 30 - 15;
  return (
    <motion.div
      className="pointer-events-none absolute z-50"
      style={{ left: x - 24, top: y - 24 }}
      initial={{ opacity: 1, scale: 0, rotate: rotation }}
      animate={{ opacity: 0, scale: 1.6, y: -120, rotate: rotation }}
      transition={{ duration: 0.85, ease: "easeOut" }}
    >
      <Heart className="h-12 w-12 fill-primary text-primary" />
    </motion.div>
  );
}

export default function VideoCard({ video, isActive, isMuted, onToggleMute, onOpenComments, onOpenGamification }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(video.isFollowing);
  const [likeCount, setLikeCount] = useState(video.stats.likes);
  const [hearts, setHearts] = useState<{ id: string; x: number; y: number }[]>([]);
  const [progress, setProgress] = useState(0);
  const [showLongPress, setShowLongPress] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [viewCounted, setViewCounted] = useState(false);
  const [playedEnough, setPlayedEnough] = useState(false);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [saveCount, setSaveCount] = useState(video.stats.saves);
  const [fitMode, setFitMode] = useState<"contain" | "cover">("contain");
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareTargets, setShareTargets] = useState<any[]>([]);
  const [shareSending, setShareSending] = useState<string | null>(null);
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef<number | null>(null);
  const actionCooldowns = useRef<Record<string, number>>({});
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const longPressTriggeredRef = useRef(false);

  const allowAction = (key: string, cooldown = 450) => {
    const now = Date.now();
    if (now - (actionCooldowns.current[key] || 0) < cooldown) return false;
    actionCooldowns.current[key] = now;
    return true;
  };

  // Check initial like/save status
  useEffect(() => {
    if (!user) return;
    const checkStatus = async () => {
      const [likeRes, saveRes, followRes] = await Promise.all([
        supabase.from("likes").select("id").eq("user_id", user.id).eq("video_id", video.id).maybeSingle(),
        supabase.from("saves").select("id").eq("user_id", user.id).eq("video_id", video.id).maybeSingle(),
        supabase.from("follows").select("id").eq("follower_id", user.id).eq("following_id", video.user.id).maybeSingle(),
      ]);
      if (likeRes.data) setLiked(true);
      if (saveRes.data) setSaved(true);
      if (followRes.data) setFollowing(true);
    };
    checkStatus();
  }, [user, video.id, video.user.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = 1;
    if (isActive) {
      v.playbackRate = playbackRate;
      if (!pausedByUser) v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
      setProgress(0);
      setPlayedEnough(false);
      setShowLongPress(false);
      setPausedByUser(false);
    }
  }, [isActive, playbackRate, pausedByUser]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = isMuted;
  }, [isMuted]);

  // Count view after 3 seconds
  useEffect(() => {
    if (!isActive || viewCounted) return;
    const t = setTimeout(() => {
      supabase.rpc("increment_video_views", { _video_id: video.id });
      setViewCounted(true);
    }, 3000);
    return () => clearTimeout(t);
  }, [isActive, viewCounted, video.id]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isActive) return;
    const update = () => {
      if (v.duration) setProgress((v.currentTime / v.duration) * 100);
      if (v.currentTime >= 8) setPlayedEnough(true);
    };
    v.addEventListener("timeupdate", update);
    return () => v.removeEventListener("timeupdate", update);
  }, [isActive]);

  const togglePlayback = useCallback(() => {
    const v = videoRef.current;
    if (!v || !isActive) return;

    if (v.paused) {
      setPausedByUser(false);
      v.play().catch(() => {});
    } else {
      setPausedByUser(true);
      v.pause();
    }
  }, [isActive]);

  const handleTap = useCallback(
    (e: React.PointerEvent<HTMLVideoElement>) => {
      if (pointerStartRef.current?.moved || longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }

      const now = Date.now();
      const isDouble = now - lastTapRef.current < 350;
      lastTapRef.current = now;

      if (isDouble) {
        if (singleTapTimer.current) { window.clearTimeout(singleTapTimer.current); singleTapTimer.current = null; }
        if (!allowAction("double-like", 650)) return;
        // Double tap → like + heart anim, do NOT toggle pause
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        setHearts((prev) => [...prev, { id: crypto.randomUUID(), x, y }]);
        if (!liked) toggleLike();
        // Restore play if it was paused by the previous single tap
        const v = videoRef.current;
        if (v && v.paused) { setPausedByUser(false); v.play().catch(() => {}); }
        return;
      }

      // Single tap → wait briefly to confirm it's not part of a double tap
      singleTapTimer.current = window.setTimeout(() => {
        singleTapTimer.current = null;
        if (!allowAction("pause", 500)) return;
        togglePlayback();
      }, 320);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liked, isActive, togglePlayback]
  );

  const removeHeart = useCallback((id: string) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const toggleLike = async () => {
    if (!allowAction("like", 450)) return;
    if (!user) { toast.error("Connecte-toi pour aimer"); return; }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : Math.max(0, c - 1));

    const { error } = newLiked
      ? await supabase.from("likes").insert({ user_id: user.id, video_id: video.id })
      : await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", video.id);
    if (error) { setLiked(!newLiked); setLikeCount((c) => newLiked ? Math.max(0, c - 1) : c + 1); toast.error("Action impossible"); }
  };

  const toggleSave = async () => {
    if (!allowAction("save", 550)) return;
    if (!user) { toast.error("Connecte-toi pour sauvegarder"); return; }
    const newSaved = !saved;
    setSaved(newSaved);
    setSaveCount((c) => newSaved ? c + 1 : Math.max(0, c - 1));

    const { error } = newSaved
      ? await supabase.from("saves").insert({ user_id: user.id, video_id: video.id })
      : await supabase.from("saves").delete().eq("user_id", user.id).eq("video_id", video.id);
    if (error) {
      setSaved(!newSaved);
      setSaveCount((c) => newSaved ? Math.max(0, c - 1) : c + 1);
      toast.error("Sauvegarde impossible");
    } else if (newSaved) {
      toast.success("Sauvegardé ✅");
    }
  };

  const handleFollow = async () => {
    if (!user) { toast.error("Connecte-toi pour suivre"); return; }
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", video.user.id);
      setFollowing(false);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: video.user.id });
      setFollowing(true);
    }
  };

  const handleShare = async () => {
    setShowShareSheet(true);
    if (!user) return;
    const { data } = await supabase
      .from("follows")
      .select("following_id, profiles:following_id(id, username, display_name, avatar_url)")
      .eq("follower_id", user.id)
      .limit(12);
    setShareTargets((data || []).map((row: any) => row.profiles).filter(Boolean));
  };

  const copyShareLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/?video=${video.id}`);
    if (user) await supabase.from("shares").insert({ user_id: user.id, video_id: video.id });
    toast.success("Lien video copie");
  };

  const shareToDeviceApps = async () => {
    const shareUrl = `${window.location.origin}/?video=${video.id}`;
    try {
      const nav = navigator as any;
      if (nav.share) {
        const title = `Video de @${video.user.username}`;
        const text = video.description || "Video BARDEUR";
        try {
          const response = await fetch(video.url);
          const blob = await response.blob();
          const file = new File([blob], `bardeur-${video.id}.mp4`, { type: blob.type || "video/mp4" });
          if (nav.canShare?.({ files: [file] })) {
            await nav.share({ title, text, files: [file] });
          } else {
            await nav.share({ title, text, url: shareUrl });
          }
        } catch {
          await nav.share({ title, text, url: shareUrl });
        }
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success("Lien video copie");
      }
      if (user) await supabase.from("shares").insert({ user_id: user.id, video_id: video.id });
    } catch {
      toast.error("Partage annule ou indisponible");
    }
  };

  const sendVideoToFriend = async (target: any) => {
    if (!user || !target?.id) { toast.error("Connecte-toi pour envoyer"); return; }
    setShareSending(target.id);
    try {
      const shareUrl = `${window.location.origin}/?video=${video.id}`;
      const { data: conversationId, error: rpcError } = await supabase.rpc("find_or_create_direct_conversation", { _other_user_id: target.id } as any);
      if (rpcError || !conversationId) throw rpcError;
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: `Video partagee: ${shareUrl}`,
        media_url: video.url,
        media_type: "video/share",
      } as any);
      await (supabase as any).from("direct_shares").insert({
        sender_id: user.id,
        recipient_id: target.id,
        video_id: video.id,
        media_url: video.url,
        media_type: "video/share",
        message: shareUrl,
      });
      await supabase.from("shares").insert({ user_id: user.id, video_id: video.id });
      toast.success(`Envoye a @${target.username} - flamme relancee`);
      setShowShareSheet(false);
    } catch {
      toast.error("Envoi impossible pour le moment");
    } finally {
      setShareSending(null);
    }
  };

  const handleDownload = async () => {
    try {
      toast.info("Téléchargement en cours...");
      const response = await fetch(video.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bardeur-${video.id}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Vidéo téléchargée ! 📥");
    } catch {
      toast.error("Erreur de téléchargement");
    }
    setShowLongPress(false);
  };

  const handleReportVideo = async () => {
    if (!user) { toast.error("Connecte-toi pour signaler"); return; }
    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: video.user.id,
      video_id: video.id,
      type: "video",
      reason: "Signalement depuis le feed",
      status: "pending",
    });
    if (error) toast.error("Signalement impossible");
    else toast.success("Signalement envoyé");
    setShowLongPress(false);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    pointerStartRef.current = { x: e.clientX, y: e.clientY, moved: false };
    longPressTriggeredRef.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setPausedByUser(true);
      }
      if (navigator.vibrate) navigator.vibrate(18);
      setShowLongPress(true);
    }, 650);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLVideoElement>) => {
    const start = pointerStartRef.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > 18 || Math.abs(e.clientY - start.y) > 18) {
      start.moved = true;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    }
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    handleTap(e);
    pointerStartRef.current = null;
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    toast.success(`Vitesse: ${rate}x`);
    setShowLongPress(false);
  };

  const seekBy = (seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + seconds, 0), v.duration || v.currentTime + seconds);
  };

  return (
    <div className="relative h-[100svh] w-full snap-start overflow-hidden bg-background touch-manipulation select-none md:h-[calc(100dvh-2rem)] md:max-h-[900px] md:rounded-[24px] md:border md:border-border/60 md:shadow-2xl md:shadow-black/40">
      <video
        ref={videoRef}
        src={video.url}
        className={`absolute inset-0 h-full w-full bg-black transition-[object-fit] duration-200 ${fitMode === "cover" ? "object-cover" : "object-contain"}`}
        loop
        muted={isMuted}
        playsInline
        preload="auto"
        disablePictureInPicture
        controlsList="nodownload noplaybackrate"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerCancel={() => {
          if (longPressTimer.current) clearTimeout(longPressTimer.current);
          pointerStartRef.current = null;
        }}
        onPointerUp={handlePointerEnd}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.duration && v.buffered.length) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
        }}
        onLoadedMetadata={() => {
          if (isActive && !pausedByUser) videoRef.current?.play().catch(() => {});
        }}
      />

      <AnimatePresence>
        {hearts.map((h) => (
          <FloatingHeart key={h.id} {...h} onDone={removeHeart} />
        ))}
      </AnimatePresence>

      <div className="gradient-overlay absolute inset-x-0 bottom-0 h-[45%] pointer-events-none" />

      {isActive && <div className="pointer-events-auto absolute right-3 top-[max(3.65rem,calc(var(--app-safe-top)+3.1rem))] z-30 flex items-center gap-2 md:right-4 md:top-4">
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={onToggleMute}
          className="glass grid h-10 w-10 place-items-center rounded-full"
          aria-label={isMuted ? "Activer le son" : "Couper le son"}
        >
          {isMuted ? <VolumeX className="h-4 w-4 text-foreground" /> : <Volume2 className="h-4 w-4 text-foreground" />}
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => setFitMode((mode) => mode === "contain" ? "cover" : "contain")}
          className="glass hidden h-10 items-center gap-1 rounded-full px-3 text-[11px] font-semibold text-foreground sm:flex"
          aria-label={fitMode === "contain" ? "Remplir l'ecran" : "Ajuster sans zoom"}
        >
          {fitMode === "contain" ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
          {fitMode === "contain" ? "Remplir" : "Ajuster"}
        </motion.button>
      </div>}

      {/* Progress Bar — scrubbable */}
      <div
        className="absolute bottom-[calc(4rem+var(--app-safe-bottom))] left-0 right-0 z-30 h-5 md:bottom-0 cursor-pointer touch-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const v = videoRef.current;
          if (!v?.duration) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          v.currentTime = ratio * v.duration;
          setProgress(ratio * 100);
          setPausedByUser(true);
          v.pause();
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType !== "touch") return;
          const v = videoRef.current;
          if (!v?.duration) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          v.currentTime = ratio * v.duration;
          setProgress(ratio * 100);
        }}
        onPointerUp={() => {
          const v = videoRef.current;
          if (v) { setPausedByUser(false); v.play().catch(() => {}); }
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-foreground/10">
          <div className="absolute inset-y-0 left-0 bg-foreground/25" style={{ width: `${buffered}%` }} />
          <motion.div className="h-full gradient-primary" style={{ width: `${progress}%` }} transition={{ duration: 0.1 }} />
          <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow ring-2 ring-background" style={{ left: `${progress}%` }} />
        </div>
      </div>

      {isActive && (
        <button
          type="button"
          onClick={togglePlayback}
          className={`absolute left-1/2 top-1/2 z-10 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-background/45 text-foreground backdrop-blur-sm transition-opacity ${pausedByUser ? "opacity-100" : "pointer-events-none opacity-0"}`}
          aria-label={pausedByUser ? "Reprendre la lecture" : "Mettre en pause"}
        >
          {pausedByUser ? <Play className="h-8 w-8 fill-current" /> : <Pause className="h-8 w-8" />}
        </button>
      )}

      {/* Speed indicator */}
      {playbackRate !== 1 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-3 py-1">
          <span className="text-xs font-bold text-foreground">{playbackRate}x</span>
        </div>
      )}

      {/* Bottom Info */}
      <div className="absolute bottom-[calc(5.9rem+var(--app-safe-bottom))] left-4 right-20 z-20 text-shadow-video md:bottom-5">
        <div className="flex items-center gap-2 mb-2">
          <button type="button" onClick={() => navigate(`/profile/${video.user.username}`)} className="flex min-w-0 max-w-[70vw] items-center gap-1.5 rounded-full bg-background/18 pr-2 text-left backdrop-blur-sm">
            <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground overflow-hidden">
              {video.user.avatar ? (
                <img src={video.user.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                video.user.displayName[0]
              )}
            </div>
            <span className="truncate font-semibold text-foreground text-[13px]">@{video.user.username}</span>
            {video.user.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-accent" />}
          </button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={handleFollow}
            className={`ml-1 rounded-md px-2.5 py-0.5 text-xs font-semibold ${
              following
                ? "border border-muted-foreground/30 text-muted-foreground"
                : "border border-primary bg-primary/20 text-primary"
            }`}
          >
            {following ? "Suivi" : "Suivre"}
          </motion.button>
        </div>

        <p className="mb-1.5 line-clamp-3 text-[13px] leading-snug text-foreground/90 sm:text-sm">{video.description}</p>

        <div className="flex flex-wrap gap-1 mb-2">
          {video.hashtags.map((tag) => (
            <span key={tag} className="text-xs font-medium text-accent">#{tag}</span>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-foreground/70">
          <Music className="h-3 w-3" />
          <span className="truncate max-w-[200px]">{video.sound.name} — {video.sound.artist}</span>
        </div>
      </div>

      {/* Right Action Bar */}
      <div className="absolute right-3 bottom-[calc(8.6rem+var(--app-safe-bottom))] z-20 flex flex-col items-center gap-3 md:bottom-8 md:gap-4">
        <ActionButton
          icon={<Heart className={`h-7 w-7 ${liked ? "fill-primary text-primary" : "text-foreground"}`} />}
          label={formatCount(likeCount)}
          ariaLabel="Aimer la video"
          onClick={toggleLike}
        />
        <ActionButton
          icon={<MessageCircle className="h-7 w-7 text-foreground" />}
          label={formatCount(video.stats.comments)}
          ariaLabel="Ouvrir les commentaires"
          onClick={() => onOpenComments(video.stats.comments)}
        />
        <ActionButton
          icon={<Share2 className="h-7 w-7 text-foreground" />}
          label={formatCount(video.stats.shares)}
          ariaLabel="Partager la video"
          onClick={handleShare}
        />
        <ActionButton
          icon={<Bookmark className={`h-7 w-7 ${saved ? "fill-accent text-accent" : "text-foreground"}`} />}
          label={formatCount(saveCount)}
          ariaLabel="Enregistrer la video"
          onClick={toggleSave}
        />
        <ActionButton
          icon={<Download className="h-6 w-6 text-foreground" />}
          label="HD"
          ariaLabel="Telecharger en qualite max"
          onClick={handleDownload}
        />
        <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={onOpenGamification} className="glass rounded-full p-2" aria-label="Ouvrir les trophees">
          <Trophy className="h-5 w-5 text-accent" />
        </motion.button>
        <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={() => setShowLongPress(true)} className="glass rounded-full p-2" aria-label="Options video">
          <MoreHorizontal className="h-5 w-5 text-foreground/80" />
        </motion.button>
      </div>

      {/* Long Press Menu */}
      <AnimatePresence>
        {showShareSheet && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-end justify-center bg-background/60"
            onClick={() => setShowShareSheet(false)}
          >
            <motion.div
              initial={{ y: 220 }}
              animate={{ y: 0 }}
              exit={{ y: 220 }}
              transition={{ type: "spring", damping: 25 }}
              className="w-full max-w-lg rounded-t-3xl glass p-5 pb-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-foreground">Partager la video</h3>
                  <p className="text-xs text-muted-foreground">Un envoi en message relance la flamme et garde le lien de la video.</p>
                </div>
                <button type="button" onClick={() => setShowShareSheet(false)} className="rounded-full bg-card p-2">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2">
                <button type="button" onClick={copyShareLink} className="rounded-2xl bg-card px-3 py-3 text-xs font-bold text-foreground">
                  <Link2 className="mx-auto mb-1 h-4 w-4 text-primary" /> Copier lien
                </button>
                <button type="button" onClick={shareToDeviceApps} className="rounded-2xl bg-card px-3 py-3 text-xs font-bold text-foreground">
                  <Share2 className="mx-auto mb-1 h-4 w-4 text-primary" /> Apps
                </button>
                <button type="button" onClick={() => { onOpenGamification(); setShowShareSheet(false); }} className="rounded-2xl bg-card px-3 py-3 text-xs font-bold text-foreground">
                  <Flame className="mx-auto mb-1 h-4 w-4 text-primary" /> Recompenses
                </button>
              </div>
              {user ? (
                <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto pr-1">
                  {shareTargets.length === 0 ? (
                    <div className="col-span-4 rounded-2xl bg-card px-3 py-6 text-center text-xs text-muted-foreground">Suis des amis pour envoyer la video en DM.</div>
                  ) : shareTargets.map(target => (
                    <button key={target.id} type="button" onClick={() => sendVideoToFriend(target)} disabled={shareSending === target.id} className="rounded-2xl bg-card px-2 py-3 text-center text-[11px] font-bold text-foreground disabled:opacity-60">
                      <div className="mx-auto mb-1 grid h-10 w-10 place-items-center overflow-hidden rounded-full gradient-primary text-primary-foreground">
                        {target.avatar_url ? <img src={target.avatar_url} alt="" className="h-full w-full object-cover" /> : target.display_name?.[0] || target.username?.[0] || "?"}
                      </div>
                      <span className="block truncate">@{target.username}</span>
                      <Send className="mx-auto mt-1 h-3.5 w-3.5 text-primary" />
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" onClick={() => navigate("/auth")} className="w-full rounded-2xl gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground">Se connecter pour envoyer</button>
              )}
            </motion.div>
          </motion.div>
        )}
        {showLongPress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-background/60 flex items-end justify-center"
            onClick={() => setShowLongPress(false)}
          >
            <motion.div
              initial={{ y: 200 }}
              animate={{ y: 0 }}
              exit={{ y: 200 }}
              transition={{ type: "spring", damping: 25 }}
              className="w-full max-w-lg glass rounded-t-3xl p-6 pb-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-foreground">Options</h3>
                <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowLongPress(false)}>
                  <X className="h-5 w-5 text-muted-foreground" />
                </motion.button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <LongPressOption icon={<Download className="h-5 w-5" />} label="Qualite max" onClick={handleDownload} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="0.5x" onClick={() => changeSpeed(0.5)} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="1x" onClick={() => changeSpeed(1)} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="1.5x" onClick={() => changeSpeed(1.5)} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="2x" onClick={() => changeSpeed(2)} />
                <LongPressOption icon={<SkipForward className="h-5 w-5" />} label="3x" onClick={() => changeSpeed(3)} />
                <LongPressOption icon={fitMode === "contain" ? <Maximize2 className="h-5 w-5" /> : <Minimize2 className="h-5 w-5" />} label={fitMode === "contain" ? "Remplir" : "Ajuster"} onClick={() => { setFitMode((mode) => mode === "contain" ? "cover" : "contain"); setShowLongPress(false); }} />
                <LongPressOption icon={<Link2 className="h-5 w-5" />} label="Copier lien" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?video=${video.id}`); toast.success("Lien copié"); setShowLongPress(false); }} />
                <LongPressOption icon={<Flag className="h-5 w-5" />} label="Signaler" onClick={handleReportVideo} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({ icon, label, ariaLabel, onClick }: { icon: React.ReactNode; label: string; ariaLabel: string; onClick?: () => void }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.85 }} onClick={onClick} className="flex flex-col items-center gap-1" aria-label={ariaLabel}>
      {icon}
      <span className="text-[11px] font-semibold text-foreground/80 tabular-nums">{label}</span>
    </motion.button>
  );
}

function LongPressOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3"
    >
      <span className="text-foreground">{icon}</span>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </motion.button>
  );
}
