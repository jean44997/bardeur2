import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Radio, Search, Flame, Clock, Users, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { extractLiveTags } from "@/lib/live";

interface LiveItem {
  id: string;
  title: string;
  username: string;
  displayName: string;
  avatar: string;
  viewers: number;
  startedAt: string;
  tags: string[];
  thumbnailUrl?: string;
}

export default function LivesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [lives, setLives] = useState<LiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"now" | "recent">("now");
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const fetchLives = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("lives")
      .select("*, profiles:user_id(username, display_name, avatar_url)")
      .eq("is_active", true)
      .order(sort === "now" ? "viewers_count" : "started_at", { ascending: false })
      .limit(50);

    if (data) {
      setLives(
        data.map((l: any) => ({
          id: l.id,
          title: l.title || "Live",
          username: l.profiles?.username || "user",
          displayName: l.profiles?.display_name || "Utilisateur",
          avatar: l.profiles?.avatar_url || "",
          viewers: l.viewers_count || 0,
          startedAt: l.started_at || l.created_at,
          tags: extractLiveTags(l.title),
          thumbnailUrl: `https://imgqkcvojnalanrlanld.supabase.co/storage/v1/object/public/media/live-stream/${l.id}/frame.jpg`,
        }))
      );
    }
    setLoading(false);
  }, [sort]);

  useEffect(() => {
    fetchLives();
    const channel = supabase
      .channel("lives-list-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "lives" }, fetchLives)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLives]);

  const allTags = Array.from(new Set(lives.flatMap((l) => l.tags))).slice(0, 12);
  const filtered = lives.filter((l) => {
    const q = query.trim().toLowerCase();
    const matchesQuery = !q || l.title.toLowerCase().includes(q) || l.username.toLowerCase().includes(q) || l.displayName.toLowerCase().includes(q) || l.tags.some((t) => t.toLowerCase().includes(q));
    const matchesTag = !tagFilter || l.tags.includes(tagFilter);
    return matchesQuery && matchesTag;
  });

  return (
    <div className="min-h-[100svh] bg-background pb-24 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-3xl px-4 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary">
              <Radio className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Lives</h1>
              <p className="text-xs text-muted-foreground">{lives.length} en direct maintenant</p>
            </div>
          </div>
          {user && (
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate("/live")} className="flex items-center gap-1.5 rounded-full gradient-primary px-3 py-2 text-xs font-bold text-primary-foreground pulse-glow">
              <Plus className="h-4 w-4" /> Démarrer
            </motion.button>
          )}
        </div>

        <div className="glass mb-3 flex items-center gap-2 rounded-2xl px-4 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un live, un créateur, un jeu…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        <div className="mb-3 flex items-center gap-2">
          <button onClick={() => setSort("now")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${sort === "now" ? "gradient-primary text-primary-foreground" : "glass text-muted-foreground"}`}>
            <Flame className="h-3.5 w-3.5" /> En direct
          </button>
          <button onClick={() => setSort("recent")} className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${sort === "recent" ? "gradient-primary text-primary-foreground" : "glass text-muted-foreground"}`}>
            <Clock className="h-3.5 w-3.5" /> Récents
          </button>
        </div>

        {allTags.length > 0 && (
          <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <button onClick={() => setTagFilter(null)} className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${!tagFilter ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
              Tous
            </button>
            {allTags.map((tag) => (
              <button key={tag} onClick={() => setTagFilter(tag === tagFilter ? null : tag)} className={`whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-bold ${tagFilter === tag ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
                #{tag}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-2xl glass px-6 py-16 text-center">
            <Radio className="mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm font-bold text-foreground">Aucun live actif</p>
            <p className="mt-1 text-xs text-muted-foreground">Reviens plus tard ou démarre ton propre live.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((live) => (
              <motion.button
                key={live.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/live/${live.id}`)}
                className="group relative flex aspect-[3/4] flex-col overflow-hidden rounded-2xl glass text-left"
              >
                <div className="absolute inset-0 bg-card">
                  <img
                    src={live.thumbnailUrl}
                    alt={live.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                </div>

                <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive-foreground" /> LIVE
                </span>
                <span className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-bold text-foreground">
                  <Users className="h-3 w-3" /> {live.viewers}
                </span>

                <div className="relative z-10 mt-auto p-3">
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-full gradient-primary text-[11px] font-bold text-primary-foreground ring-2 ring-destructive">
                      {live.avatar ? <img src={live.avatar} alt="" className="h-full w-full object-cover" /> : live.displayName[0]}
                    </div>
                    <p className="truncate text-xs font-bold text-foreground">@{live.username}</p>
                  </div>
                  <p className="line-clamp-2 text-[11px] font-medium text-foreground/90">{live.title}</p>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
