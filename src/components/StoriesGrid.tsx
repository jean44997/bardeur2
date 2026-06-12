import { useEffect, useState } from "react";
import { Eye, Globe2, Users, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StoryRing from "@/components/StoryRing";
import StoryViewer, { getHiddenStoryIds, type StoryItem } from "@/components/StoryViewer";

interface UserStories {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  audience: string;
  views_total: number;
  hasUnseen: boolean;
  items: StoryItem[];
}

/**
 * Grid of all visible stories (public + friends mutuels) for the Explore page.
 * - One bubble per user, username below, total views badge.
 * - Tap = open viewer with continuous playback across all users.
 * - Auto-refresh via realtime channel.
 */
export default function StoriesGrid() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<UserStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ stories: StoryItem[]; index: number } | null>(null);

  useEffect(() => {
    fetchStories();
    const channel = supabase
      .channel("stories-grid")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => fetchStories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const fetchStories = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("stories")
      .select("id, user_id, media_url, media_type, caption, created_at, audience, expires_at, views_count")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[stories-grid] fetch failed", error);
      setGroups([]);
      setLoading(false);
      return;
    }

    const hiddenStoryIds = getHiddenStoryIds(user?.id);
    const list = ((data || []) as any[]).filter((row) => !hiddenStoryIds.has(row.id));
    const authorIds = Array.from(new Set(list.map((row) => row.user_id).filter(Boolean)));
    const { data: profiles } = authorIds.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", authorIds)
      : { data: [] as any[] };
    const profilesById = new Map((profiles || []).map((p: any) => [p.id, p]));

    let seenIds = new Set<string>();
    if (user) {
      const { data: views } = await (supabase as any).from("story_views").select("story_id").eq("viewer_id", user.id);
      seenIds = new Set((views || []).map((v: any) => v.story_id));
    }

    const grouped = new Map<string, UserStories>();
    for (const row of list) {
      const author = profilesById.get(row.user_id) || {};
      const item: StoryItem = {
        id: row.id,
        user_id: row.user_id,
        media_url: row.media_url,
        media_type: row.media_type,
        caption: row.caption,
        created_at: row.created_at,
        audience: row.audience,
        expires_at: row.expires_at,
        views_count: row.user_id === user?.id ? row.views_count : 0,
        author: { username: author.username, display_name: author.display_name, avatar_url: author.avatar_url },
      };
      const existing = grouped.get(row.user_id) || {
        user_id: row.user_id,
        username: author.username || "user",
        display_name: author.display_name || author.username || "Story",
        avatar_url: author.avatar_url || "",
        audience: row.audience,
        views_total: 0,
        hasUnseen: false,
        items: [],
      };
      existing.items.push(item);
      existing.views_total += row.user_id === user?.id ? row.views_count || 0 : 0;
      if (!seenIds.has(row.id) && row.user_id !== user?.id) existing.hasUnseen = true;
      grouped.set(row.user_id, existing);
    }

    const arr = Array.from(grouped.values()).sort((a, b) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return b.views_total - a.views_total;
    });
    setGroups(arr);
    setLoading(false);
  };

  const openAt = (startUserId: string) => {
    const ordered = [
      ...groups.filter(g => g.user_id === startUserId),
      ...groups.filter(g => g.user_id !== startUserId),
    ];
    const flat: StoryItem[] = ordered.flatMap(g => g.items);
    const idx = flat.findIndex(s => s.user_id === startUserId);
    setViewer({ stories: flat, index: Math.max(0, idx) });
  };

  if (loading && groups.length === 0) {
    return (
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-full bg-card" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">Aucune story active. Sois le premier à en publier ✨</p>;
  }

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(4.8rem,1fr))] gap-x-3 gap-y-5 sm:grid-cols-[repeat(auto-fit,minmax(5.4rem,1fr))]">
        {groups.map((g) => (
          <motion.button
            key={g.user_id}
            whileTap={{ scale: 0.93 }}
            onClick={() => openAt(g.user_id)}
            className="group flex min-w-0 flex-col items-center gap-1.5"
            aria-label={`Stories de ${g.display_name}`}
          >
            <motion.div
              className="story-bubble-3d relative"
              initial={false}
              animate={{ rotateX: [0, 4, 0], rotateY: [0, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <StoryRing hasUnseen={g.hasUnseen} isOwnPosted={g.user_id === user?.id} size={76}>
                <div className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-card text-sm font-bold text-foreground">
                  {g.avatar_url ? (
                    <img src={g.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    g.display_name[0]?.toUpperCase()
                  )}
                </div>
              </StoryRing>
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border-[2px] border-background bg-card text-foreground shadow-lg">
                {g.audience === "public" ? <Globe2 className="h-2.5 w-2.5" /> : g.audience === "private" ? <Lock className="h-2.5 w-2.5 text-primary" /> : <Users className="h-2.5 w-2.5" />}
              </span>
            </motion.div>
            <span className="w-full truncate text-center text-[11px] font-semibold text-foreground">
              @{g.username}
            </span>
            <span className="flex max-w-full items-center gap-1 rounded-full bg-card/70 px-2 py-0.5 text-[10px] text-muted-foreground">
              <Eye className="h-2.5 w-2.5" /> {g.user_id === user?.id ? g.views_total : "Story"}
            </span>
          </motion.button>
        ))}
      </div>
      {viewer && (
        <StoryViewer stories={viewer.stories} initialIndex={viewer.index} onClose={() => setViewer(null)} />
      )}
    </>
  );
}
