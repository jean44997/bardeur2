import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import VideoCard from "./VideoCard";
import CommentsDrawer from "./CommentsDrawer";
import GamificationPanel from "./GamificationPanel";
import { VideoData } from "@/data/mockVideos";
import { motion } from "framer-motion";
import { RefreshCw, Film, Radio } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function VideoFeed() {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [activeLivesCount, setActiveLivesCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentVideoId, setCommentVideoId] = useState<string | null>(null);
  const [commentVideoOwnerId, setCommentVideoOwnerId] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [gamificationOpen, setGamificationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("videos")
      .select("*, profiles:user_id(username, display_name, avatar_url)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data && !error) {
      const targetVideoId = searchParams.get("video");
      const mapped: VideoData[] = data.map((v: any) => ({
        id: v.id,
        url: v.video_url,
        poster: v.thumbnail_url || "",
        user: {
          id: v.user_id,
          username: v.profiles?.username || "unknown",
          displayName: v.profiles?.display_name || "Utilisateur",
          avatar: v.profiles?.avatar_url || "",
          verified: false,
          followers: "0",
        },
        description: v.description || "",
        hashtags: v.hashtags || [],
        sound: { name: v.sound_name || "Son original", artist: v.sound_artist || "" },
        stats: {
          likes: Math.max(0, v.likes_count || 0),
          comments: Math.max(0, v.comments_count || 0),
          shares: Math.max(0, v.shares_count || 0),
          saves: Math.max(0, v.saves_count || 0),
        },
        isFollowing: false,
        commentsEnabled: v.comments_enabled !== false,
      }));
      setVideos(targetVideoId ? [...mapped].sort((a, b) => Number(b.id === targetVideoId) - Number(a.id === targetVideoId)) : mapped);
    }
    setLoading(false);
  }, [searchParams]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const fetchLivesCount = useCallback(async () => {
    const { count } = await supabase
      .from("lives")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);
    setActiveLivesCount(count || 0);
  }, []);

  useEffect(() => {
    fetchLivesCount();
    const channel = supabase
      .channel("home-mini-live-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "lives" }, fetchLivesCount)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLivesCount]);

  const preloadVideos = videos.filter((_, i) => Math.abs(i - activeIndex) <= 2 && i !== activeIndex);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollRafRef.current) return;
    scrollRafRef.current = window.requestAnimationFrame(() => {
      const idx = Math.max(0, Math.min(videos.length - 1, Math.round(el.scrollTop / el.clientHeight)));
      setActiveIndex((current) => current === idx ? current : idx);
      scrollRafRef.current = null;
    });
  }, [videos.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (scrollRafRef.current) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, [handleScroll]);

  if (loading) {
    return (
      <div className="h-[100svh] w-full flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-[100svh] w-full flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="h-20 w-20 rounded-full bg-card flex items-center justify-center mx-auto mb-4">
            <Film className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Aucune vidéo pour le moment</h2>
          <p className="text-sm text-muted-foreground mb-4">Sois le premier à publier !</p>
          <motion.button whileTap={{ scale: 0.95 }} onClick={fetchVideos} className="rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground flex items-center gap-2 mx-auto">
            <RefreshCw className="h-4 w-4" /> Actualiser
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100svh] bg-background md:min-h-[100dvh] md:pl-[var(--sidebar-width,260px)] md:pr-6">
      <div className="fixed left-4 top-[max(1rem,env(safe-area-inset-top))] z-40 md:left-[calc(var(--sidebar-width,260px)+1.5rem)]">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate("/lives")}
          className="glass relative flex h-10 items-center gap-2 rounded-full px-3"
          aria-label="Ouvrir les lives"
        >
          <Radio className="h-4 w-4 text-foreground" />
          <span className="text-xs font-black text-foreground">Live</span>
          {activeLivesCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
              {activeLivesCount > 9 ? "9+" : activeLivesCount}
            </span>
          )}
        </motion.button>
      </div>
      <div className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 z-40 flex items-center gap-2 md:right-8">
        <motion.button whileTap={{ scale: 0.9 }} onClick={() => { fetchVideos(); fetchLivesCount(); }} className="glass rounded-full p-2" aria-label="Actualiser">
          <RefreshCw className="h-4 w-4 text-foreground" />
        </motion.button>
      </div>

      <div aria-hidden className="fixed -left-[9999px] top-0 h-1 w-1 overflow-hidden">
        {preloadVideos.map((video) => <video key={video.id} src={video.url} poster={video.poster} preload="auto" muted playsInline />)}
      </div>

      <div
        ref={containerRef}
        className="pwa-feed-scroll h-[100svh] w-full snap-y snap-mandatory overflow-y-scroll no-scrollbar md:mx-auto md:my-4 md:h-[calc(100dvh-2rem)] md:w-full md:max-w-[460px] md:rounded-[24px] md:bg-black"
      >
        {videos.map((video, i) => (
          <VideoCard
            key={video.id}
            video={video}
            isActive={i === activeIndex}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted((p) => !p)}
            onOpenComments={(count) => {
              const v = videos[i] as any;
              if (v.commentsEnabled === false) { return; }
              setCommentVideoId(video.id);
              setCommentVideoOwnerId(video.user.id);
              setCommentCount(count);
              setCommentsOpen(true);
            }}
            onOpenGamification={() => setGamificationOpen(true)}
          />
        ))}
      </div>
      <CommentsDrawer isOpen={commentsOpen} onClose={() => setCommentsOpen(false)} commentCount={commentCount} videoId={commentVideoId} videoOwnerId={commentVideoOwnerId} />
      <GamificationPanel isOpen={gamificationOpen} onClose={() => setGamificationOpen(false)} />
    </div>
  );
}
