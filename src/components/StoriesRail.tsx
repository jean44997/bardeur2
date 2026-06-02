import { useEffect, useState, useRef } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import StoryRing from "@/components/StoryRing";
import StoryViewer, { type StoryItem } from "@/components/StoryViewer";
import { validateUploadFile } from "@/lib/contentSafety";
import { toast } from "sonner";

interface UserStories {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  hasUnseen: boolean;
  items: StoryItem[];
}

/**
 * Horizontal rail of stories for the home / explore screen.
 * - Shows current user's add tile first (with + ring), then followed users with active stories.
 * - Resumes after refresh because data is server-backed (stories table).
 */
export default function StoriesRail() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<UserStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ stories: StoryItem[]; index: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStories();
    const channel = supabase
      .channel("stories-rail")
      .on("postgres_changes", { event: "*", schema: "public", table: "stories" }, () => fetchStories())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const fetchStories = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("stories")
      .select("id, user_id, media_url, media_type, caption, created_at, audience, expires_at, profiles:user_id(username, display_name, avatar_url)")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true });

    const list = (data || []) as any[];
    let seenIds = new Set<string>();
    if (user) {
      const { data: views } = await (supabase as any).from("story_views").select("story_id").eq("viewer_id", user.id);
      seenIds = new Set((views || []).map((v: any) => v.story_id));
    }

    const grouped = new Map<string, UserStories>();
    for (const row of list) {
      const author = row.profiles || {};
      const item: StoryItem = {
        id: row.id,
        user_id: row.user_id,
        media_url: row.media_url,
        media_type: row.media_type,
        caption: row.caption,
        created_at: row.created_at,
        author: { username: author.username, display_name: author.display_name, avatar_url: author.avatar_url },
      };
      const existing = grouped.get(row.user_id) || {
        user_id: row.user_id,
        username: author.username || "user",
        display_name: author.display_name || author.username || "Story",
        avatar_url: author.avatar_url || "",
        hasUnseen: false,
        items: [],
      };
      existing.items.push(item);
      if (!seenIds.has(row.id) && row.user_id !== user?.id) existing.hasUnseen = true;
      grouped.set(row.user_id, existing);
    }

    // Order: current user first, then unseen, then seen, all by latest
    const arr = Array.from(grouped.values()).sort((a, b) => {
      if (a.user_id === user?.id) return -1;
      if (b.user_id === user?.id) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return 0;
    });
    setGroups(arr);
    setLoading(false);
  };

  const myGroup = groups.find(g => g.user_id === user?.id);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const check = validateUploadFile(file, { maxBytes: 80 * 1024 * 1024, acceptedPrefixes: ["image/", "video/"] });
    if (!check.ok) { toast.error(check.reason || "Fichier refusé"); return; }
    const audience = window.confirm("Publier cette story en PUBLIC ?\n\nOK = Public (visible par tout le monde)\nAnnuler = Privé (abonnés uniquement)")
      ? "public"
      : "private";
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
      const path = `${user.id}/stories/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const { error: insErr } = await (supabase as any).from("stories").insert({
        user_id: user.id,
        media_url: data.publicUrl,
        media_type: file.type,
        audience,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      if (insErr) throw insErr;
      toast.success(`Story ${audience === "public" ? "publique" : "privée"} publiée ✨`);
      // Force-refresh twice to bypass any stale realtime lag on PWA.
      await fetchStories();
      setTimeout(() => { fetchStories(); }, 600);
    } catch (err: any) {
      toast.error(err?.message || "Upload impossible");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };


  if (loading && groups.length === 0) {
    return (
      <div className="flex gap-3 overflow-x-auto px-3 py-3 no-scrollbar">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-card" />
        ))}
      </div>
    );
  }

  if (!user && groups.length === 0) return null;

  return (
    <>
      <div className="flex items-end gap-3 overflow-x-auto px-3 py-3 no-scrollbar">
        {user && (
          <button
            type="button"
            onClick={() => {
              if (myGroup) setViewer({ stories: myGroup.items, index: 0 });
              else fileRef.current?.click();
            }}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
            aria-label={myGroup ? "Voir ma story" : "Ajouter une story"}
          >
            <StoryRing hasUnseen={!!myGroup && myGroup.hasUnseen} isOwn={!myGroup} isOwnPosted={!!myGroup} size={64}>
              <div className="grid h-full w-full place-items-center overflow-hidden rounded-full gradient-primary text-base font-bold text-primary-foreground">
                {myGroup?.avatar_url ? (
                  <img src={myGroup.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </div>
            </StoryRing>
            <span className="w-full truncate text-center text-[10px] font-semibold text-foreground">
              {uploading ? "..." : myGroup ? "Toi" : "Ajouter"}
            </span>
          </button>
        )}

        {groups.filter(g => g.user_id !== user?.id).map(g => (
          <button
            key={g.user_id}
            type="button"
            onClick={() => setViewer({ stories: g.items, index: 0 })}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
            aria-label={`Stories de ${g.display_name}`}
          >
            <StoryRing hasUnseen={g.hasUnseen} size={64}>
              <div className="grid h-full w-full place-items-center overflow-hidden rounded-full bg-card text-sm font-bold text-foreground">
                {g.avatar_url ? <img src={g.avatar_url} alt="" className="h-full w-full object-cover" /> : g.display_name[0]}
              </div>
            </StoryRing>
            <span className="w-full truncate text-center text-[10px] text-muted-foreground">{g.display_name}</span>
          </button>
        ))}

        {groups.length === 0 && user && !uploading && (
          <p className="self-center pl-2 text-xs text-muted-foreground">Sois le premier à publier une story aujourd'hui ✨</p>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleUpload} />
      {viewer && (
        <StoryViewer stories={viewer.stories} initialIndex={viewer.index} onClose={() => setViewer(null)} />
      )}
    </>
  );
}
