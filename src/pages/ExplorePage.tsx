import { Search, TrendingUp, Music, Sparkles, Gamepad2, Utensils, Dumbbell } from "lucide-react";
import { motion } from "framer-motion";

const categories = [
  { icon: TrendingUp, label: "Tendances", color: "from-primary to-pink-400" },
  { icon: Music, label: "Musique", color: "from-purple-500 to-indigo-500" },
  { icon: Sparkles, label: "Beauté", color: "from-amber-400 to-orange-500" },
  { icon: Gamepad2, label: "Gaming", color: "from-accent to-teal-500" },
  { icon: Utensils, label: "Cuisine", color: "from-red-400 to-rose-500" },
  { icon: Dumbbell, label: "Sport", color: "from-green-400 to-emerald-500" },
];

const trendingTags = [
  { tag: "#ViralDance", views: "12.4M" },
  { tag: "#CookingHack", views: "8.2M" },
  { tag: "#TravelVlog", views: "6.1M" },
  { tag: "#PetLovers", views: "5.7M" },
  { tag: "#DIYProject", views: "4.9M" },
  { tag: "#FitnessGoals", views: "3.8M" },
];

export default function ExplorePage() {
  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[280px]">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* Search Bar */}
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 mb-6">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Rechercher utilisateurs, sons, hashtags..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {/* Categories */}
        <h2 className="text-lg font-bold text-foreground mb-3">Catégories</h2>
        <div className="grid grid-cols-3 gap-3 mb-8">
          {categories.map((cat) => (
            <motion.button
              key={cat.label}
              whileTap={{ scale: 0.95 }}
              className={`flex flex-col items-center gap-2 rounded-2xl bg-gradient-to-br ${cat.color} p-4 shadow-lg`}
            >
              <cat.icon className="h-7 w-7 text-foreground" />
              <span className="text-xs font-semibold text-foreground">{cat.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Trending */}
        <h2 className="text-lg font-bold text-foreground mb-3">🔥 Hashtags Tendances</h2>
        <div className="flex flex-col gap-2">
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
      </div>
    </div>
  );
}
