import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VideoCard from "./VideoCard";
import CommentsDrawer from "./CommentsDrawer";
import GamificationPanel from "./GamificationPanel";
import { VideoData } from "@/data/mockVideos";
import { motion } from "framer-motion";
import { RefreshCw, Film, Radio } from "lucide-react";
import { useNavigate } from "react-router-dom";

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
  const containerRef = useRef<HTMLDivElement>(null);
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
    const { data } = await supabase
      .from("lives")
      .select("*, profiles:user_id(username, display_name, avatar_url)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
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
  }, []);

  useEffect(() => {
    fetchVideos();
    fetchLives();
  }, [fetchVideos, fetchLives]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollTop / el.clientHeight);
    setActiveIndex(idx);
  }, []);

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

      {/* Active Lives Banner */}
      {activeLives.length > 0 && (
        <div className="fixed top-4 left-4 right-16 z-40 md:left-[calc(var(--sidebar-width,260px)+1rem)]">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            {activeLives.map(live => (
              <motion.button
                key={live.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/live/${live.id}`)}
                className="flex-shrink-0 glass rounded-full px-3 py-1.5 flex items-center gap-2"
              >
                <div className="relative">
                  <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground overflow-hidden ring-2 ring-destructive">
                    {live.avatar ? <img src={live.avatar} alt="" className="h-full w-full object-cover" /> : live.displayName[0]}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-destructive border-2 border-background animate-pulse" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-bold text-foreground leading-tight">{live.displayName}</p>
                  <p className="text-[8px] text-muted-foreground leading-tight flex items-center gap-0.5">
                    <Radio className="h-2 w-2 text-destructive" /> En direct
                  </p>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef} className="h-[100svh] w-full snap-y-mandatory overflow-y-scroll no-scrollbar">
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
