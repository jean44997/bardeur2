import { useState, useEffect } from "react";
import { Search, TrendingUp, Music, Sparkles, Gamepad2, Utensils, Dumbbell, Laugh, Palette, Plane, Hash, Flame, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import StoriesRail from "@/components/StoriesRail";

const categories = [
  { icon: Flame, label: "pourtoi", color: "from-primary to-pink-400" },
  { icon: TrendingUp, label: "tendance", color: "from-orange-500 to-amber-400" },
  { icon: Gamepad2, label: "gaming", color: "from-accent to-teal-500" },
  { icon: Music, label: "musique", color: "from-purple-500 to-indigo-500" },
  { icon: Dumbbell, label: "sport", color: "from-green-400 to-emerald-500" },
  { icon: Laugh, label: "humour", color: "from-yellow-400 to-orange-400" },
  { icon: Sparkles, label: "danse", color: "from-pink-400 to-rose-500" },
  { icon: Palette, label: "beauté", color: "from-amber-400 to-orange-500" },
  { icon: Utensils, label: "cuisine", color: "from-red-400 to-rose-500" },
  { icon: Plane, label: "voyage", color: "from-sky-400 to-blue-500" },
];

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [videos, setVideos] = useState<any[]>([]);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchType, setSearchType] = useState<"users" | "hashtags">("users");
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    fetchVideos();
  }, [activeCategory]);

  useEffect(() => {
    if (query.trim()) searchContent();
    else setSearchResults([]);
  }, [query, searchType]);

  const fetchVideos = async () => {
    let q = supabase.from("videos").select("*, profiles:user_id(username, display_name)").eq("is_published", true).order("likes_count", { ascending: false }).limit(12);
    if (activeCategory) {
      q = q.contains("hashtags", [activeCategory]);
    }
    const { data } = await q;
    if (data) setVideos(data);
  };

  const searchContent = async () => {
    if (!query.trim()) return;
    if (searchType === "users") {
      const { data } = await supabase.from("profiles").select("*").ilike("username", `%${query}%`).limit(10);
      setSearchResults(data || []);
    } else {
      const { data } = await supabase.from("videos").select("hashtags").eq("is_published", true);
      const allTags = new Map<string, number>();
      data?.forEach((v: any) => v.hashtags?.forEach((t: string) => {
        if (t.toLowerCase().includes(query.toLowerCase())) {
          allTags.set(t, (allTags.get(t) || 0) + 1);
        }
      }));
      setSearchResults(Array.from(allTags.entries()).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count));
    }
  };

  const handleFollow = async (userId: string) => {
    if (!user) { toast.error("Connecte-toi pour suivre"); return; }
    await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
    toast.success("Abonné !");
  };

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mobile-page-top-safe mx-auto max-w-3xl px-4">
        <StoriesRail />
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 mb-4 mt-1">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input type="text" placeholder="Rechercher utilisateurs, hashtags..." value={query} onChange={e => setQuery(e.target.value)} className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
        </div>

        {query.trim() && (
          <>
            <div className="flex gap-2 mb-4">
              {(["users", "hashtags"] as const).map(t => (
                <motion.button key={t} whileTap={{ scale: 0.95 }} onClick={() => setSearchType(t)} className={`px-4 py-1.5 rounded-full text-xs font-semibold ${searchType === t ? "gradient-primary text-primary-foreground" : "glass text-foreground"}`}>
                  {t === "users" ? "Utilisateurs" : "Hashtags"}
                </motion.button>
              ))}
            </div>
            <div className="space-y-2 mb-6">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun résultat</p>
              ) : searchType === "users" ? (
                searchResults.map((u: any) => (
                  <motion.button key={u.id} whileTap={{ scale: 0.98 }} onClick={() => navigate(`/profile/${u.username}`)} className="flex items-center gap-3 w-full glass rounded-xl px-4 py-3">
                    <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-secondary-foreground overflow-hidden">
                      {u.avatar_url ? <img src={u.avatar_url} className="h-full w-full object-cover" /> : u.display_name?.[0]}
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-semibold text-foreground">@{u.username}</span>
                      <p className="text-xs text-muted-foreground">{u.display_name}</p>
                    </div>
                    {user && u.id !== user.id && (
                      <motion.button whileTap={{ scale: 0.9 }} onClick={e => { e.stopPropagation(); handleFollow(u.id); }} className="rounded-lg gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
                        <UserPlus className="h-3 w-3" />
                      </motion.button>
                    )}
                  </motion.button>
                ))
              ) : (
                searchResults.map((r: any) => (
                  <motion.button key={r.tag} whileTap={{ scale: 0.98 }} onClick={() => { setQuery(""); setActiveCategory(r.tag); }} className="flex items-center gap-3 w-full glass rounded-xl px-4 py-3">
                    <Hash className="h-5 w-5 text-primary" />
                    <span className="text-sm font-semibold text-foreground">#{r.tag}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{r.count} vidéos</span>
                  </motion.button>
                ))
              )}
            </div>
          </>
        )}

        {!query.trim() && (
          <>
            <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
              <Hash className="h-5 w-5 text-primary" /> Catégories
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-8">
              {categories.map(cat => (
                <motion.button
                  key={cat.label}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
                  className={`flex items-center gap-2 rounded-xl bg-gradient-to-br ${cat.color} p-3 shadow-lg transition-all ${activeCategory === cat.label ? "ring-2 ring-foreground scale-105" : ""}`}
                >
                  <cat.icon className="h-5 w-5 text-foreground" />
                  <span className="text-xs font-semibold text-foreground truncate">#{cat.label}</span>
                </motion.button>
              ))}
            </div>

            <h2 className="text-lg font-bold text-foreground mb-3">📹 {activeCategory ? `#${activeCategory}` : "Vidéos populaires"}</h2>
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {videos.length === 0 ? (
                <div className="col-span-3 text-center py-8">
                  <p className="text-sm text-muted-foreground">Aucune vidéo {activeCategory ? `avec #${activeCategory}` : ""}</p>
                </div>
              ) : (
                videos.map(v => (
                  <motion.button key={v.id} whileTap={{ scale: 0.97 }} onClick={() => navigate(`/?video=${v.id}`)} className="group relative aspect-[9/16] cursor-pointer overflow-hidden rounded-lg bg-card text-left">
                    {v.thumbnail_url ? (
                      <img src={v.thumbnail_url} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" alt="" />
                    ) : v.video_url ? (
                      <video src={v.video_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      <span className="grid h-full place-items-center text-2xl opacity-20">▶</span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/80 to-transparent p-1.5">
                      <p className="truncate text-[10px] font-bold text-foreground">@{v.profiles?.username || "createur"}</p>
                    </div>
                  </motion.button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
