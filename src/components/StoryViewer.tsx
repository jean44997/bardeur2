import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Pause, Play, Volume2, VolumeX, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface StoryItem {
  id: string;
  user_id: string;
  media_url: string;
  media_type: string;
  caption?: string | null;
  created_at: string;
  author?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null;
}

interface Props {
  stories: StoryItem[];
  initialIndex?: number;
  onClose: () => void;
}

const IMAGE_DURATION_MS = 5000;

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const elapsedAtPauseRef = useRef<number>(0);

  const current = stories[index];
  const isVideo = !!current?.media_type?.startsWith("video");

  // Record a view (best effort)
  useEffect(() => {
    if (!current || !user) return;
    (supabase as any).from("story_views").insert({ story_id: current.id, viewer_id: user.id }).then(() => {});
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
    const { error } = await (supabase as any).from("stories").delete().eq("id", current.id);
    if (error) { toast.error("Suppression impossible"); return; }
    toast.success("Story supprimée");
    if (stories.length <= 1) { onClose(); return; }
    stories.splice(index, 1);
    setIndex(i => Math.min(i, stories.length - 1));
  };

  const seekProgress = (clientX: number, rect: DOMRect) => {
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (isVideo && videoRef.current && videoRef.current.duration) {
      videoRef.current.currentTime = ratio * videoRef.current.duration;
    } else {
      elapsedAtPauseRef.current = ratio * IMAGE_DURATION_MS;
      startedAtRef.current = Date.now();
    }
    setProgress(ratio);
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

        {/* Progress bars (draggable to seek) */}
        <div className="absolute left-0 right-0 top-0 z-30 flex gap-1 px-3 pt-[calc(max(0.6rem,var(--app-safe-top))+0.2rem)]">
          {stories.map((_, i) => (
            <div
              key={i}
              className="h-2 flex-1 cursor-pointer touch-none py-[3px]"
              onPointerDown={(e) => {
                if (i !== index) { setIndex(i); return; }
                (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                setPaused(true);
                seekProgress(e.clientX, e.currentTarget.getBoundingClientRect());
              }}
              onPointerMove={(e) => {
                if (i !== index || e.buttons === 0) return;
                seekProgress(e.clientX, e.currentTarget.getBoundingClientRect());
              }}
              onPointerUp={() => setPaused(false)}
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
          {user?.id === current.user_id && (
            <button type="button" onClick={deleteCurrent} aria-label="Supprimer la story" className="grid h-9 w-9 place-items-center rounded-full bg-destructive/80 text-destructive-foreground">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Caption */}
        {current.caption && (
          <div className="pointer-events-none absolute bottom-24 left-4 right-4 z-10 text-center text-sm font-medium text-white drop-shadow">
            {current.caption}
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
