import { useEffect, useState } from "react";
import { ArrowLeft, Eye, Globe2, Lock, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface StoryRow {
  id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  audience: string;
  created_at: string;
  expires_at: string;
  views_count: number;
  viewers: Array<{ id: string; username: string; display_name: string; avatar_url: string; viewed_at: string }>;
}

/**
 * Dedicated page — shows EVERY active story published by the current user
 * with the full list of viewers (avatar + @username + time).
 */
export default function StoryViewsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stories, setStories] = useState<StoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase
      .channel("story-views-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "story_views" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: rows } = await (supabase as any)
      .from("stories")
      .select("id, media_url, media_type, caption, audience, created_at, expires_at, views_count")
      .eq("user_id", user.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    const list = (rows || []) as any[];
    const ids = list.map((s) => s.id);
    let viewersByStory = new Map<string, any[]>();
    if (ids.length) {
      const { data: views } = await (supabase as any)
        .from("story_views")
        .select("story_id, viewed_at, profiles:viewer_id(id, username, display_name, avatar_url)")
        .in("story_id", ids)
        .order("viewed_at", { ascending: false });
      (views || []).forEach((v: any) => {
        const arr = viewersByStory.get(v.story_id) || [];
        if (v.profiles && v.profiles.id !== user.id) {
          arr.push({ ...v.profiles, viewed_at: v.viewed_at });
        }
        viewersByStory.set(v.story_id, arr);
      });
    }

    setStories(list.map((s) => ({ ...s, viewers: viewersByStory.get(s.id) || [] })));
    setLoading(false);
  };

  const AudienceIcon = ({ a }: { a: string }) =>
    a === "public" ? <Globe2 className="h-3.5 w-3.5" /> : a === "private" ? <Lock className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />;

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pl-[var(--sidebar-width,260px)]">
      <div className="mobile-page-top-safe mx-auto max-w-2xl px-4">
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="grid h-10 w-10 place-items-center rounded-full bg-secondary" aria-label="Retour">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">Vues de mes stories</h1>
            <p className="text-xs text-muted-foreground">Stories actives et personnes qui les ont regardées</p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center">
            <Eye className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-foreground">Aucune story active.</p>
            <p className="mt-1 text-xs text-muted-foreground">Publie une story depuis ton profil pour voir qui la regarde.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {stories.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl bg-card"
              >
                <div className="flex gap-3 p-3">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary">
                    {s.media_type?.startsWith("video") ? (
                      <video src={s.media_url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      <img src={s.media_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase text-foreground">
                        <AudienceIcon a={s.audience} /> {s.audience}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Expire {new Date(s.expires_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    {s.caption && <p className="mb-1 line-clamp-2 text-xs text-foreground">{s.caption}</p>}
                    <div className="flex items-center gap-1 text-xs font-bold text-primary">
                      <Eye className="h-3.5 w-3.5" /> {s.viewers.length} vue{s.viewers.length > 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {s.viewers.length > 0 && (
                  <div className="divide-y divide-border/40 border-t border-border/40">
                    {s.viewers.map((v) => (
                      <button
                        key={`${s.id}-${v.id}`}
                        onClick={() => navigate(`/profile/${v.username}`)}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/40"
                      >
                        <div className="h-9 w-9 overflow-hidden rounded-full bg-secondary">
                          {v.avatar_url ? <img src={v.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full w-full place-items-center text-xs font-bold text-secondary-foreground">{v.display_name?.[0] || "?"}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">@{v.username}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{v.display_name}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(v.viewed_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
