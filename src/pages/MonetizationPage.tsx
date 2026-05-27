import { useEffect, useState } from "react";
import { ArrowLeft, WalletCards } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import MonetizationPanel from "@/components/MonetizationPanel";

export default function MonetizationPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [creatorStats, setCreatorStats] = useState({ followers: 0, likes: 0, videos: 0, views: 0 });

  useEffect(() => {
    if (!user) return;
    void fetchCreatorStats();
  }, [user?.id]);

  const fetchCreatorStats = async () => {
    if (!user) return;
    const [followers, totalLikes, videoData] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("videos").select("likes_count, views_count").eq("user_id", user.id),
      supabase.from("videos").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    ]);
    setCreatorStats({
      followers: followers.count || 0,
      likes: totalLikes.data?.reduce((sum: number, v: any) => sum + (v.likes_count || 0), 0) || 0,
      videos: videoData.count || 0,
      views: totalLikes.data?.reduce((sum: number, v: any) => sum + (v.views_count || 0), 0) || 0,
    });
  };

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mobile-page-top-safe mx-auto max-w-lg px-4">
        <div className="mb-5 flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/settings")} className="tap-target-lg glass-action grid place-items-center rounded-full">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Monetisation</h1>
            <p className="text-xs text-muted-foreground">Abonnements, rewards, pubs et paiements createur</p>
          </div>
          <WalletCards className="ml-auto h-5 w-5 text-primary" />
        </div>

        <MonetizationPanel stats={creatorStats} username={profile?.username || "createur"} />
      </div>
    </div>
  );
}
