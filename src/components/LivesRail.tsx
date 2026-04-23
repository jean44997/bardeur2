import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Clock, Flame, Radio, Search, Tags, UserRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export interface LiveRailItem {
  id: string;
  title: string;
  username: string;
  displayName: string;
  avatar: string;
  viewers: number;
  startedAt?: string;
  tags: string[];
  isActive: boolean;
}

interface LivesRailProps {
  lives: LiveRailItem[];
  loading: boolean;
  sort: "now" | "recent";
  onSortChange: (value: "now" | "recent") => void;
  onOpenLive: (liveId: string) => void;
}

export default function LivesRail({ lives, loading, sort, onSortChange, onOpenLive }: LivesRailProps) {
  const [query, setQuery] = useState("");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");

  const creators = useMemo(
    () => Array.from(new Set(lives.map((live) => live.username).filter(Boolean))).slice(0, 12),
    [lives],
  );

  const tags = useMemo(
    () => Array.from(new Set(lives.flatMap((live) => live.tags).filter(Boolean))).slice(0, 16),
    [lives],
  );

  const filteredLives = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return lives.filter((live) => {
      const matchesQuery =
        !normalized ||
        live.title.toLowerCase().includes(normalized) ||
        live.displayName.toLowerCase().includes(normalized) ||
        live.username.toLowerCase().includes(normalized) ||
        live.tags.some((tag) => tag.toLowerCase().includes(normalized));

      const matchesCreator = creatorFilter === "all" || live.username === creatorFilter;
      const matchesTag = tagFilter === "all" || live.tags.includes(tagFilter);

      return matchesQuery && matchesCreator && matchesTag;
    });
  }, [creatorFilter, lives, query, tagFilter]);

  if (!loading && lives.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 right-16 z-40 md:left-[calc(var(--sidebar-width,260px)+1rem)] md:right-24">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Radio className="h-3.5 w-3.5 text-destructive" />
          Lives
        </div>
        <div className="flex rounded-full glass p-0.5">
          <button onClick={() => onSortChange("now")} className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${sort === "now" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Flame className="h-3 w-3" /> En direct
          </button>
          <button onClick={() => onSortChange("recent")} className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${sort === "recent" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <Clock className="h-3 w-3" /> Récents
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-2.5">
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un live, créateur ou jeu"
            className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        <div className="mb-2 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <span className="flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground whitespace-nowrap">
            <UserRound className="h-3 w-3" /> Créateurs
          </span>
          <button onClick={() => setCreatorFilter("all")} className={`rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${creatorFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>Tous</button>
          {creators.map((creator) => (
            <button key={creator} onClick={() => setCreatorFilter(creator)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${creatorFilter === creator ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
              @{creator}
            </button>
          ))}
        </div>

        <div className="mb-3 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <span className="flex items-center gap-1 rounded-full bg-card px-2 py-1 text-[10px] font-bold text-muted-foreground whitespace-nowrap">
            <Tags className="h-3 w-3" /> Jeux / tags
          </span>
          <button onClick={() => setTagFilter("all")} className={`rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${tagFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>Tous</button>
          {tags.map((tag) => (
            <button key={tag} onClick={() => setTagFilter(tag)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${tagFilter === tag ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}>
              #{tag}
            </button>
          ))}
        </div>

        <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
          {loading
            ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-44 w-36 flex-shrink-0 rounded-2xl" />)
            : filteredLives.map((live) => {
                const label = live.isActive ? "En direct maintenant" : "Récents";

                return (
                  <motion.button
                    key={live.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onOpenLive(live.id)}
                    className="flex w-36 flex-shrink-0 flex-col overflow-hidden rounded-2xl glass text-left"
                  >
                    <div className="relative aspect-[4/5] bg-card">
                      <div className="absolute inset-0 grid place-items-center bg-primary/10">
                        <div className="h-14 w-14 rounded-full gradient-primary flex items-center justify-center text-sm font-bold text-primary-foreground overflow-hidden ring-2 ring-destructive">
                          {live.avatar ? <img src={live.avatar} alt="" className="h-full w-full object-cover" /> : live.displayName[0]}
                        </div>
                      </div>
                      <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-bold ${live.isActive ? "bg-destructive text-destructive-foreground" : "bg-card text-foreground"}`}>
                        {label}
                      </span>
                    </div>
                    <div className="space-y-1 p-2">
                      <p className="truncate text-xs font-bold text-foreground">{live.displayName}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{live.viewers} spectateurs</p>
                      <p className="truncate text-[10px] text-muted-foreground">{live.tags.slice(0, 2).map((tag) => `#${tag}`).join(" · ") || "Sans tag"}</p>
                    </div>
                  </motion.button>
                );
              })}

          {!loading && filteredLives.length === 0 && (
            <div className="grid h-32 min-w-full place-items-center rounded-2xl bg-card/70 px-4 text-center text-xs text-muted-foreground">
              Aucun live ne correspond à tes filtres.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}