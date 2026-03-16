import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, MessageCircle, Share2, Bookmark, Music, Plus, Check, Volume2, VolumeX, BadgeCheck, Trophy } from "lucide-react";
import { VideoData, formatCount } from "@/data/mockVideos";

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

export default function VideoCard({ video, isActive, isMuted, onToggleMute }: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(video.isFollowing);
  const [likeCount, setLikeCount] = useState(video.stats.likes);
  const [hearts, setHearts] = useState<{ id: string; x: number; y: number }[]>([]);
  const [progress, setProgress] = useState(0);
  const lastTapRef = useRef(0);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [isActive]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isActive) return;
    const update = () => {
      if (v.duration) setProgress((v.currentTime / v.duration) * 100);
    };
    v.addEventListener("timeupdate", update);
    return () => v.removeEventListener("timeupdate", update);
  }, [isActive]);

  const handleDoubleTap = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < 350) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const clientX = "touches" in e ? e.changedTouches[0].clientX : e.clientX;
        const clientY = "touches" in e ? e.changedTouches[0].clientY : e.clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        setHearts((prev) => [...prev, { id: crypto.randomUUID(), x, y }]);
        if (!liked) {
          setLiked(true);
          setLikeCount((c) => c + 1);
        }
      }
      lastTapRef.current = now;
    },
    [liked]
  );

  const removeHeart = useCallback((id: string) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const toggleLike = () => {
    setLiked((p) => !p);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  return (
    <div className="relative h-[100svh] w-full snap-start overflow-hidden bg-background">
      {/* Video */}
      <video
        ref={videoRef}
        src={video.url}
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted={isMuted}
        playsInline
        preload="auto"
        onClick={handleDoubleTap}
        onTouchEnd={handleDoubleTap}
      />

      {/* Floating Hearts */}
      <AnimatePresence>
        {hearts.map((h) => (
          <FloatingHeart key={h.id} {...h} onDone={removeHeart} />
        ))}
      </AnimatePresence>

      {/* Bottom Gradient Overlay */}
      <div className="gradient-overlay absolute inset-x-0 bottom-0 h-[45%] pointer-events-none" />

      {/* Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-foreground/10 z-30">
        <motion.div
          className="h-full gradient-primary"
          style={{ width: `${progress}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-4 left-4 right-20 z-20 text-shadow-video">
        {/* User */}
        <div className="flex items-center gap-2 mb-2">
          <div className="h-10 w-10 rounded-full gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground">
            {video.user.displayName[0]}
          </div>
          <span className="font-semibold text-foreground text-[15px]">
            @{video.user.username}
          </span>
          {video.user.verified && <BadgeCheck className="h-4 w-4 text-accent" />}
          {!following && (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setFollowing(true)}
              className="ml-1 rounded-md border border-primary bg-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary"
            >
              Suivre
            </motion.button>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-foreground/90 mb-1.5 line-clamp-2">{video.description}</p>

        {/* Hashtags */}
        <div className="flex flex-wrap gap-1 mb-2">
          {video.hashtags.map((tag) => (
            <span key={tag} className="text-xs font-medium text-accent">
              #{tag}
            </span>
          ))}
        </div>

        {/* Sound */}
        <div className="flex items-center gap-1.5 text-xs text-foreground/70">
          <Music className="h-3 w-3" />
          <span className="truncate max-w-[200px]">
            {video.sound.name} — {video.sound.artist}
          </span>
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
        />
        <ActionButton
          icon={<Share2 className="h-7 w-7 text-foreground" />}
          label={formatCount(video.stats.shares)}
        />
        <ActionButton
          icon={<Bookmark className={`h-7 w-7 ${saved ? "fill-accent text-accent" : "text-foreground"}`} />}
          label={formatCount(video.stats.saves)}
          onClick={() => setSaved((p) => !p)}
        />

        {/* Mute toggle */}
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={onToggleMute}
          className="glass rounded-full p-2"
        >
          {isMuted ? <VolumeX className="h-5 w-5 text-foreground/70" /> : <Volume2 className="h-5 w-5 text-foreground/70" />}
        </motion.button>
      </div>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={onClick}
      className="flex flex-col items-center gap-1"
    >
      {icon}
      <span className="text-[11px] font-semibold text-foreground/80 tabular-nums">{label}</span>
    </motion.button>
  );
}
