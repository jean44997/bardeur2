import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VideoCard from "./VideoCard";
import CommentsDrawer from "./CommentsDrawer";
import GamificationPanel from "./GamificationPanel";
import { VideoData } from "@/data/mockVideos";
import { motion } from "framer-motion";
import { RefreshCw, Film, Radio, Clock, Flame } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface LiveStream {
  id: string;
  title: string;
  username: string;
  displayName: string;
  avatar: string;
  viewers: number;
}

export default function VideoFeed() {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [activeLives, setActiveLives] = useState<LiveStream[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentVideoId, setCommentVideoId] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [gamificationOpen, setGamificationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [livesLoading, setLivesLoading] = useState(true);
  const [liveSort, setLiveSort] = useState<"now" | "recent">("now");
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<number | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchVideos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("videos")
      .select("*, profiles:user_id(username, display_name, avatar_url)")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data && !error) {
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
          likes: v.likes_count || 0,
          comments: v.comments_count || 0,
          shares: v.shares_count || 0,
          saves: v.saves_count || 0,
        },
        isFollowing: false,
        commentsEnabled: v.comments_enabled !== false,
      }));
      setVideos(mapped);
    }
    setLoading(false);
  }, []);

  const fetchLives = useCallback(async () => {
    setLivesLoading(true);
    const { data } = await supabase
      .from("lives")
      .select("*, profiles:user_id(username, display_name, avatar_url)")
      .eq("is_active", true)
      .order(liveSort === "now" ? "viewers_count" : "created_at", { ascending: false })
      .limit(10);

    if (data) {
      setActiveLives(data.map((l: any) => ({
        id: l.id,
        title: l.title || "Live",
        username: l.profiles?.username || "",
        displayName: l.profiles?.display_name || "Utilisateur",
        avatar: l.profiles?.avatar_url || "",
        viewers: l.viewers_count || 0,
      })));
    }
    setLivesLoading(false);
  }, [liveSort]);

  useEffect(() => {
    fetchVideos();
    fetchLives();
  }, [fetchVideos, fetchLives]);

  const preloadVideos = videos.filter((_, i) => Math.abs(i - activeIndex) <= 2 && i !== activeIndex);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => {
      const idx = Math.max(0, Math.min(videos.length - 1, Math.round(el.scrollTop / el.clientHeight)));
      setActiveIndex(idx);
      el.scrollTo({ top: idx * el.clientHeight, behavior: "smooth" });
    }, 90);
  }, [videos.length]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  if (loading) {
    return (
      <div className="h-[100svh] w-full flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (videos.length === 0 && activeLives.length === 0) {
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
    <>
      <motion.button whileTap={{ scale: 0.9 }} onClick={() => { fetchVideos(); fetchLives(); }} className="fixed top-4 right-4 z-40 glass rounded-full p-2 md:right-8">
        <RefreshCw className="h-4 w-4 text-foreground" />
      </motion.button>

      {/* Active Lives Section */}
      {(activeLives.length > 0 || livesLoading) && (
        <div className="fixed top-4 left-4 right-16 z-40 md:left-[calc(var(--sidebar-width,260px)+1rem)] md:right-24">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground"><Radio className="h-3.5 w-3.5 text-destructive" /> Lives</div>
            <div className="flex rounded-full glass p-0.5">
              <button onClick={() => setLiveSort("now")} className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${liveSort === "now" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Flame className="h-3 w-3" /> En direct</button>
              <button onClick={() => setLiveSort("recent")} className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${liveSort === "recent" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}><Clock className="h-3 w-3" /> Récents</button>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {livesLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44 w-36 flex-shrink-0 rounded-2xl" />) : activeLives.map(live => (
              <motion.button
                key={live.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/live/${live.id}`)}
                className="flex w-36 flex-shrink-0 flex-col overflow-hidden rounded-2xl glass text-left"
              >
                <div className="relative aspect-[4/5] bg-card">
                  <div className="absolute inset-0 grid place-items-center bg-primary/10">
                    <div className="h-14 w-14 rounded-full gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground overflow-hidden ring-2 ring-destructive">
                      {live.avatar ? <img src={live.avatar} alt="" className="h-full w-full object-cover" /> : live.displayName[0]}
                    </div>
                  </div>
                  <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[9px] font-bold text-destructive-foreground">LIVE</span>
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-bold text-foreground">{live.displayName}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{live.viewers} spectateurs</p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <div aria-hidden className="fixed -left-[9999px] top-0 h-1 w-1 overflow-hidden">
        {preloadVideos.map((video) => <video key={video.id} src={video.url} poster={video.poster} preload="auto" muted playsInline />)}
      </div>

      <div ref={containerRef} className="h-[100svh] w-full snap-y snap-mandatory overflow-y-scroll no-scrollbar overscroll-contain">
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
              setCommentCount(count);
              setCommentsOpen(true);
            }}
            onOpenGamification={() => setGamificationOpen(true)}
          />
        ))}
      </div>
      <CommentsDrawer isOpen={commentsOpen} onClose={() => setCommentsOpen(false)} commentCount={commentCount} videoId={commentVideoId} />
      <GamificationPanel isOpen={gamificationOpen} onClose={() => setGamificationOpen(false)} />
    </>
  );
}
