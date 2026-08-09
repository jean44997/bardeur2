import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/instantCache";

export interface CommentNode {
  id: string;
  userId: string;
  parentId: string | null;
  user: { name: string; avatar: string; verified: boolean };
  text: string;
  likes: number;
  liked: boolean;
  time: string;
  replies: CommentNode[];
  mediaUrl?: string;
  mediaType?: string;
}

export const commentsCacheKey = (videoId: string) => `comments:${videoId}`;

const COMMENT_COLUMNS =
  "id, user_id, parent_id, content, likes_count, media_url, media_type, created_at, profiles:user_id(username, display_name, avatar_url)";

export function commentTimeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

export function buildCommentTree(rows: any[]): CommentNode[] {
  const toComment = (c: any): CommentNode => ({
    id: c.id,
    userId: c.user_id,
    parentId: c.parent_id || null,
    user: {
      name: c.profiles?.username || "unknown",
      avatar: (c.profiles?.display_name?.[0] || c.profiles?.username?.[0] || "?").toUpperCase(),
      verified: false,
    },
    text: c.content,
    likes: c.likes_count || 0,
    liked: false,
    time: commentTimeAgo(c.created_at),
    replies: [],
    mediaUrl: c.media_url || undefined,
    mediaType: c.media_type || undefined,
  });
  const all = rows.map(toComment);
  const byId = new Map(all.map((c) => [c.id, c]));
  const roots: CommentNode[] = [];
  for (const c of all) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.replies.unshift(c);
    else roots.push(c);
  }
  return roots;
}

export async function fetchCommentTree(videoId: string, limit: number) {
  const { data } = await supabase
    .from("comments")
    .select(COMMENT_COLUMNS)
    .eq("video_id", videoId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ? buildCommentTree(data) : null;
}

const inFlight = new Set<string>();

/**
 * Warm the comment cache while the user is watching a video, without
 * competing with scroll: runs on idle time only, once per video/session.
 */
export function prefetchComments(videoId?: string | null, limit = 120) {
  if (!videoId || inFlight.has(videoId)) return;
  const cached = readCache<CommentNode[]>(commentsCacheKey(videoId));
  if (cached && cached.length >= 12) return;
  inFlight.add(videoId);

  const run = async () => {
    try {
      const tree = await fetchCommentTree(videoId, limit);
      if (tree) writeCache(commentsCacheKey(videoId), tree);
    } catch {
      /* prefetch is best-effort */
    } finally {
      inFlight.delete(videoId);
    }
  };

  const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, o?: any) => number);
  if (idle) idle(() => void run(), { timeout: 2500 });
  else window.setTimeout(() => void run(), 900);
}
