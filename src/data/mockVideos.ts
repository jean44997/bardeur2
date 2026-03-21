export interface VideoData {
  id: string;
  url: string;
  poster: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string;
    verified: boolean;
    followers: string;
  };
  description: string;
  hashtags: string[];
  sound: { name: string; artist: string };
  stats: { likes: number; comments: number; shares: number; saves: number };
  isFollowing: boolean;
  commentsEnabled?: boolean;
}

// Empty - all data comes from database now
export const mockVideos: VideoData[] = [];

export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}
