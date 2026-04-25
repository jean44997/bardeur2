import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, MessageCircle, Share2, Bookmark, Music, Volume2, VolumeX,
  BadgeCheck, Trophy, Download, Gauge, SkipForward, Flag, Link2,
  Copy, X
} from "lucide-react";
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
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef<number | null>(null);
  const actionCooldowns = useRef<Record<string, number>>({});
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

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

  const handleTap = useCallback(
    (e: React.PointerEvent<HTMLVideoElement>) => {
      const now = Date.now();
      const isDouble = now - lastTapRef.current < 350;
      lastTapRef.current = now;

      if (isDouble) {
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
      window.setTimeout(() => {
        if (Date.now() - lastTapRef.current < 350) return; // a second tap arrived → handled above
        const v = videoRef.current;
        if (!v || !isActive) return;
        if (v.paused) { setPausedByUser(false); v.play().catch(() => {}); }
        else { setPausedByUser(true); v.pause(); }
      }, 320);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liked, isActive]
  );

  const removeHeart = useCallback((id: string) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const toggleLike = async () => {
    if (!user) { toast.error("Connecte-toi pour aimer"); return; }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => newLiked ? c + 1 : c - 1);

    const { error } = newLiked
      ? await supabase.from("likes").insert({ user_id: user.id, video_id: video.id })
      : await supabase.from("likes").delete().eq("user_id", user.id).eq("video_id", video.id);
    if (error) { setLiked(!newLiked); setLikeCount((c) => newLiked ? c - 1 : c + 1); toast.error("Action impossible"); }
  };

  const toggleSave = async () => {
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
    const shareUrl = `${window.location.origin}/video/${video.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: video.description, url: shareUrl });
        if (user) await supabase.from("shares").insert({ user_id: user.id, video_id: video.id });
      } catch {}
    } else {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Lien copié ! 🔗");
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

  const handleLongPressStart = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      if (playedEnough || (videoRef.current?.currentTime || 0) >= 8) setShowLongPress(true);
      else toast.info("Options disponibles après 8 secondes de lecture");
    }, 8000);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
    toast.success(`Vitesse: ${rate}x`);
    setShowLongPress(false);
  };

  return (
    <div className="relative h-[100svh] w-full snap-start overflow-hidden bg-background">
      <video
        ref={videoRef}
        src={video.url}
        className="absolute inset-0 h-full w-full object-contain bg-background"
        loop
        muted={isMuted}
        playsInline
        preload="auto"
        onPointerUp={handleTap}
        onProgress={(e) => {
          const v = e.currentTarget;
          if (v.duration && v.buffered.length) setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
        }}
        onTouchEnd={handleLongPressEnd}
        onMouseDown={handleLongPressStart}
        onMouseUp={handleLongPressEnd}
        onTouchStart={handleLongPressStart}
        onTouchCancel={handleLongPressEnd}
      />

      <AnimatePresence>
        {hearts.map((h) => (
          <FloatingHeart key={h.id} {...h} onDone={removeHeart} />
        ))}
      </AnimatePresence>

      <div className="gradient-overlay absolute inset-x-0 bottom-0 h-[45%] pointer-events-none" />

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-foreground/10 z-30">
        <div className="absolute inset-y-0 left-0 bg-foreground/25" style={{ width: `${buffered}%` }} />
        <motion.div className="h-full gradient-primary" style={{ width: `${progress}%` }} transition={{ duration: 0.1 }} />
      </div>

      {pausedByUser && isActive && <div className="absolute inset-0 z-10 grid place-items-center pointer-events-none"><div className="glass rounded-full px-4 py-2 text-xs font-bold text-foreground">Pause</div></div>}

      {/* Speed indicator */}
      {playbackRate !== 1 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 glass rounded-full px-3 py-1">
          <span className="text-xs font-bold text-foreground">{playbackRate}x</span>
        </div>
      )}

      {/* Bottom Info */}
      <div className="absolute bottom-4 left-4 right-20 z-20 text-shadow-video">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground overflow-hidden">
            {video.user.avatar ? (
              <img src={video.user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              video.user.displayName[0]
            )}
          </div>
          <span className="font-semibold text-foreground text-[15px]">@{video.user.username}</span>
          {video.user.verified && <BadgeCheck className="h-4 w-4 text-accent" />}
          <motion.button
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

        <p className="text-sm text-foreground/90 mb-1.5 line-clamp-2">{video.description}</p>

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
      <div className="absolute right-3 bottom-28 z-20 flex flex-col items-center gap-5">
        <ActionButton
          icon={<Heart className={`h-7 w-7 ${liked ? "fill-primary text-primary" : "text-foreground"}`} />}
          label={formatCount(likeCount)}
          onClick={toggleLike}
        />
        <ActionButton
          icon={<MessageCircle className="h-7 w-7 text-foreground" />}
          label={formatCount(video.stats.comments)}
          onClick={() => onOpenComments(video.stats.comments)}
        />
        <ActionButton
          icon={<Share2 className="h-7 w-7 text-foreground" />}
          label={formatCount(video.stats.shares)}
          onClick={handleShare}
        />
        <ActionButton
          icon={<Bookmark className={`h-7 w-7 ${saved ? "fill-accent text-accent" : "text-foreground"}`} />}
          label={formatCount(saveCount)}
          onClick={toggleSave}
        />
        <motion.button whileTap={{ scale: 0.85 }} onClick={onToggleMute} className="glass rounded-full p-2">
          {isMuted ? <VolumeX className="h-5 w-5 text-foreground/70" /> : <Volume2 className="h-5 w-5 text-foreground/70" />}
        </motion.button>
        <motion.button whileTap={{ scale: 0.85 }} onClick={onOpenGamification} className="glass rounded-full p-2">
          <Trophy className="h-5 w-5 text-accent" />
        </motion.button>
      </div>

      {/* Long Press Menu */}
      <AnimatePresence>
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
                <LongPressOption icon={<Download className="h-5 w-5" />} label="Télécharger HD" onClick={handleDownload} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="0.5x" onClick={() => changeSpeed(0.5)} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="1x" onClick={() => changeSpeed(1)} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="1.5x" onClick={() => changeSpeed(1.5)} />
                <LongPressOption icon={<Gauge className="h-5 w-5" />} label="2x" onClick={() => changeSpeed(2)} />
                <LongPressOption icon={<SkipForward className="h-5 w-5" />} label="3x" onClick={() => changeSpeed(3)} />
                <LongPressOption icon={<Link2 className="h-5 w-5" />} label="Copier lien" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/video/${video.id}`); toast.success("Lien copié"); setShowLongPress(false); }} />
                <LongPressOption icon={<Flag className="h-5 w-5" />} label="Signaler" onClick={() => { toast.info("Signalement envoyé"); setShowLongPress(false); }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} className="flex flex-col items-center gap-1">
      {icon}
      <span className="text-[11px] font-semibold text-foreground/80 tabular-nums">{label}</span>
    </motion.button>
  );
}

function LongPressOption({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-xl bg-card p-3"
    >
      <span className="text-foreground">{icon}</span>
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
    </motion.button>
  );
}
