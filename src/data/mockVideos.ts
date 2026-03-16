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
}

// Using free sample videos
export const mockVideos: VideoData[] = [
  {
    id: "1",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    poster: "",
    user: {
      id: "u1",
      username: "blazerunner",
      displayName: "Blaze Runner",
      avatar: "",
      verified: true,
      followers: "2.1M",
    },
    description: "Quand le sunset est juste parfait 🔥✨",
    hashtags: ["sunset", "vibes", "fyp"],
    sound: { name: "Blinding Lights", artist: "The Weeknd" },
    stats: { likes: 184200, comments: 3420, shares: 12800, saves: 8900 },
    isFollowing: false,
  },
  {
    id: "2",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
    poster: "",
    user: {
      id: "u2",
      username: "escapist.co",
      displayName: "Escapist",
      avatar: "",
      verified: false,
      followers: "540K",
    },
    description: "L'aventure commence ici 🌍🚀 #travel",
    hashtags: ["travel", "adventure", "explore"],
    sound: { name: "Levitating", artist: "Dua Lipa" },
    stats: { likes: 92100, comments: 1840, shares: 6700, saves: 4200 },
    isFollowing: true,
  },
  {
    id: "3",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
    poster: "",
    user: {
      id: "u3",
      username: "funfactory",
      displayName: "Fun Factory 🎪",
      avatar: "",
      verified: true,
      followers: "8.7M",
    },
    description: "POV: Tu découvres le meilleur trick de la semaine 🤯",
    hashtags: ["pov", "trick", "viral", "fyp"],
    sound: { name: "Original Sound", artist: "funfactory" },
    stats: { likes: 521000, comments: 8900, shares: 34200, saves: 21000 },
    isFollowing: false,
  },
  {
    id: "4",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
    poster: "",
    user: {
      id: "u4",
      username: "joyride.tv",
      displayName: "JoyRide",
      avatar: "",
      verified: false,
      followers: "320K",
    },
    description: "Road trip au coucher de soleil 🌅🚗",
    hashtags: ["roadtrip", "sunset", "chill"],
    sound: { name: "As It Was", artist: "Harry Styles" },
    stats: { likes: 67800, comments: 920, shares: 3100, saves: 2800 },
    isFollowing: false,
  },
  {
    id: "5",
    url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
    poster: "",
    user: {
      id: "u5",
      username: "meltdown.xo",
      displayName: "Meltdown XO",
      avatar: "",
      verified: true,
      followers: "1.4M",
    },
    description: "Ce moment où tout s'enchaîne parfaitement 💫",
    hashtags: ["satisfying", "perfect", "oddlysatisfying"],
    sound: { name: "Starboy", artist: "The Weeknd" },
    stats: { likes: 298000, comments: 5600, shares: 18900, saves: 15200 },
    isFollowing: true,
  },
];

export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}
