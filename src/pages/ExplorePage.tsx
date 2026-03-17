import { useState } from "react";
import { Search, TrendingUp, Music, Sparkles, Gamepad2, Utensils, Dumbbell, Laugh, Palette, Plane, Hash, Flame } from "lucide-react";
import { motion } from "framer-motion";

const categories = [
  { icon: Flame, label: "#pourtoi", color: "from-primary to-pink-400" },
  { icon: TrendingUp, label: "#tendance", color: "from-orange-500 to-amber-400" },
  { icon: Gamepad2, label: "#gaming", color: "from-accent to-teal-500" },
  { icon: Music, label: "#musique", color: "from-purple-500 to-indigo-500" },
  { icon: Dumbbell, label: "#sport", color: "from-green-400 to-emerald-500" },
  { icon: Laugh, label: "#humour", color: "from-yellow-400 to-orange-400" },
  { icon: Sparkles, label: "#danse", color: "from-pink-400 to-rose-500" },
  { icon: Palette, label: "#beauté", color: "from-amber-400 to-orange-500" },
  { icon: Utensils, label: "#cuisine", color: "from-red-400 to-rose-500" },
  { icon: Plane, label: "#voyage", color: "from-sky-400 to-blue-500" },
];

const trendingTags = [
  { tag: "#pourtoi", views: "45.2M" },
  { tag: "#tendance", views: "28.1M" },
  { tag: "#dancechallenge", views: "12.4M" },
  { tag: "#gaming", views: "8.2M" },
  { tag: "#recette", views: "6.1M" },
  { tag: "#humour", views: "5.7M" },
  { tag: "#sport", views: "4.9M" },
  { tag: "#beauté", views: "3.8M" },
];

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* Search */}
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 mb-6">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher utilisateurs, sons, hashtags..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {/* Categories */}
        <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
          <Hash className="h-5 w-5 text-primary" /> Catégories
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-8">
          {categories.map((cat) => (
            <motion.button
              key={cat.label}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
              className={`flex items-center gap-2 rounded-xl bg-gradient-to-br ${cat.color} p-3 shadow-lg transition-all ${
                activeCategory === cat.label ? "ring-2 ring-foreground scale-105" : ""
              }`}
            >
              <cat.icon className="h-5 w-5 text-foreground" />
              <span className="text-xs font-semibold text-foreground truncate">{cat.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Trending */}
        <h2 className="text-lg font-bold text-foreground mb-3">🔥 Hashtags Tendances</h2>
        <div className="flex flex-col gap-2 mb-8">
          {trendingTags.map((item, i) => (
            <motion.button
              key={item.tag}
              whileTap={{ scale: 0.98 }}
              className="glass flex items-center justify-between rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-muted-foreground tabular-nums w-5">{i + 1}</span>
                <span className="text-sm font-semibold text-foreground">{item.tag}</span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{item.views} vues</span>
            </motion.button>
          ))}
        </div>

        {/* Video grid placeholder */}
        <h2 className="text-lg font-bold text-foreground mb-3">📹 Vidéos populaires</h2>
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.div
              key={i}
              whileTap={{ scale: 0.97 }}
              className="aspect-[9/16] rounded-lg bg-card flex items-center justify-center cursor-pointer"
            >
              <span className="text-2xl opacity-20">▶</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}