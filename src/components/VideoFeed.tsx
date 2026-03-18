import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import VideoCard from "./VideoCard";
import CommentsDrawer from "./CommentsDrawer";
import GamificationPanel from "./GamificationPanel";
import { VideoData } from "@/data/mockVideos";
import { motion } from "framer-motion";
import { RefreshCw, Film } from "lucide-react";

export default function VideoFeed() {
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false); // Sound ON by default
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentVideoId, setCommentVideoId] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [gamificationOpen, setGamificationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

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
      }));
      setVideos(mapped);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

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

  if (videos.length === 0) {
    return (
      <div className="h-[100svh] w-full flex items-center justify-center bg-background px-4">
        <div className="text-center">
          <div className="h-20 w-20 rounded-full bg-card flex items-center justify-center mx-auto mb-4">
            <Film className="h-8 w-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">Aucune vidéo pour le moment</h2>
          <p className="text-sm text-muted-foreground mb-4">Sois le premier à publier une vidéo !</p>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={fetchVideos}
            className="rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="h-4 w-4" /> Actualiser
          </motion.button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Refresh button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={fetchVideos}
        className="fixed top-4 right-4 z-40 glass rounded-full p-2 md:right-8"
      >
        <RefreshCw className="h-4 w-4 text-foreground" />
      </motion.button>

      <div
        ref={containerRef}
        className="h-[100svh] w-full snap-y-mandatory overflow-y-scroll no-scrollbar"
      >
        {videos.map((video, i) => (
          <VideoCard
            key={video.id}
            video={video}
            isActive={i === activeIndex}
            isMuted={isMuted}
            onToggleMute={() => setIsMuted((p) => !p)}
            onOpenComments={(count) => {
              setCommentVideoId(video.id);
              setCommentCount(count);
              setCommentsOpen(true);
            }}
            onOpenGamification={() => setGamificationOpen(true)}
          />
        ))}
      </div>
      <CommentsDrawer
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        commentCount={commentCount}
        videoId={commentVideoId}
      />
      <GamificationPanel isOpen={gamificationOpen} onClose={() => setGamificationOpen(false)} />
    </>
  );
}
