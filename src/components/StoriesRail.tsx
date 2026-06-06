import { useEffect, useState, useRef } from "react";
import { Plus, Globe2, Users, X, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const { user, profile } = useAuth();
  const [groups, setGroups] = useState<UserStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<{ stories: StoryItem[]; index: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
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

  // Build a continuous flat list starting at the chosen group, then all following groups,
  // so the viewer auto-advances to the next user without closing.
  const openGroupContinuous = (startUserId: string) => {
    const ordered = [
      ...groups.filter(g => g.user_id === startUserId),
      ...groups.filter(g => g.user_id !== startUserId),
    ];
    const flat: StoryItem[] = ordered.flatMap(g => g.items);
    const startIdx = flat.findIndex(s => s.user_id === startUserId);
    setViewer({ stories: flat, index: Math.max(0, startIdx) });
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const check = validateUploadFile(file, { maxBytes: 80 * 1024 * 1024, acceptedPrefixes: ["image/", "video/"] });
    if (!check.ok) { toast.error(check.reason || "Fichier refusé"); if (fileRef.current) fileRef.current.value = ""; return; }
    setPendingFile(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const publishStory = async (audience: "public" | "friends" | "private") => {
    if (!pendingFile || !user) return;
    const file = pendingFile;
    setPendingFile(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || (file.type.startsWith("video") ? "mp4" : "jpg");
      const path = `${user.id}/stories/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { console.error("[stories] upload error", upErr); throw upErr; }
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      // Let the DB compute expires_at via column default (now() + 24h) to avoid client clock skew.
      const { data: inserted, error: insErr } = await (supabase as any).from("stories").insert({
        user_id: user.id,
        media_url: data.publicUrl,
        media_type: file.type,
        audience,
      }).select("id, user_id, media_url, media_type, caption, created_at, audience, expires_at").single();
      if (insErr) { console.error("[stories] insert error", insErr); throw insErr; }
      if (inserted) {
        const item: StoryItem = {
          id: inserted.id,
          user_id: user.id,
          media_url: data.publicUrl,
          media_type: file.type,
          caption: inserted.caption,
          created_at: inserted.created_at,
          audience,
          expires_at: inserted.expires_at,
          author: { username: profile?.username, display_name: profile?.display_name, avatar_url: profile?.avatar_url },
        };
        setGroups((prev) => {
          const others = prev.filter((g) => g.user_id !== user.id);
          const current = prev.find((g) => g.user_id === user.id);
          return [{
            user_id: user.id,
            username: profile?.username || current?.username || "toi",
            display_name: profile?.display_name || current?.display_name || "Toi",
            avatar_url: profile?.avatar_url || current?.avatar_url || "",
            hasUnseen: false,
            items: [...(current?.items || []), item],
          }, ...others];
        });
      }
      toast.success(audience === "public" ? "Story publique 🌍 visible par tous" : audience === "friends" ? "Story amis 👥 visible par tes mutuels" : "Story privée 🔒 visible que par toi");
      await fetchStories();
      setTimeout(() => { fetchStories(); }, 700);
      setTimeout(() => { fetchStories(); }, 2200);
    } catch (err: any) {
      console.error("[stories] publish failed", err);
      const msg = err?.message || err?.error_description || "Publication impossible";
      toast.error(msg.includes("row-level security") ? "Refusé par la sécurité (vérifie ta connexion)" : msg);

    } finally {
      setUploading(false);
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
              if (myGroup) openGroupContinuous(user.id);
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
            onClick={() => openGroupContinuous(g.user_id)}
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
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFilePicked} />
      {viewer && (
        <StoryViewer stories={viewer.stories} initialIndex={viewer.index} onClose={() => setViewer(null)} />
      )}

      <AnimatePresence>
        {pendingFile && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPendingFile(null)}
              className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="fixed inset-x-0 bottom-0 z-[81] rounded-t-3xl border-t border-border bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground">Qui peut voir ta story ?</h3>
                  <p className="text-xs text-muted-foreground">Disparait automatiquement après 24h</p>
                </div>
                <button onClick={() => setPendingFile(null)} aria-label="Annuler" className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                  <X className="h-4 w-4 text-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => publishStory("public")}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 to-accent/10 p-4 text-left active:scale-[0.98] transition-transform"
                >
                  <Globe2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold text-foreground">Public</span>
                  <span className="text-[11px] text-muted-foreground">Visible par tout le monde sur BARDEUR</span>
                </button>
                <button
                  type="button"
                  onClick={() => publishStory("friends")}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-secondary/40 p-4 text-left active:scale-[0.98] transition-transform"
                >
                  <Users className="h-5 w-5 text-foreground" />
                  <span className="text-sm font-bold text-foreground">Amis</span>
                  <span className="text-[11px] text-muted-foreground">Visible uniquement par tes amis mutuels</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
