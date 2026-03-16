import { Settings, Grid3X3, Heart, Bookmark, BadgeCheck, Share2 } from "lucide-react";
import { motion } from "framer-motion";

const stats = [
  { label: "Abonnements", value: "234" },
  { label: "Abonnés", value: "12.4K" },
  { label: "J'aime", value: "89.2K" },
];

export default function ProfilePage() {
  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[280px]">
      <div className="mx-auto max-w-lg px-4 pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground">@monprofil</h1>
          <motion.button whileTap={{ scale: 0.9 }}>
            <Settings className="h-5 w-5 text-muted-foreground" />
          </motion.button>
        </div>

        {/* Avatar & Stats */}
        <div className="flex flex-col items-center mb-6">
          <div className="h-24 w-24 rounded-full gradient-primary flex items-center justify-center text-3xl font-bold text-primary-foreground mb-3 ring-4 ring-background">
            V
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-lg font-bold text-foreground">Vanish User</span>
            <BadgeCheck className="h-5 w-5 text-accent" />
          </div>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-xs">
            Créateur de contenu 🎬 | Passionné de vidéo | France 🇫🇷
          </p>

          <div className="flex gap-8 mb-4">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center">
                <span className="text-lg font-bold text-foreground tabular-nums">{s.value}</span>
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="rounded-lg gradient-primary px-6 py-2 text-sm font-semibold text-primary-foreground"
            >
              Modifier le profil
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="glass rounded-lg px-4 py-2"
            >
              <Share2 className="h-4 w-4 text-foreground" />
            </motion.button>
          </div>
        </div>

        {/* Level Bar */}
        <div className="glass rounded-xl p-3 mb-6">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-foreground">Niveau 7 — Créateur Étoile ⭐</span>
            <span className="text-xs text-muted-foreground tabular-nums">2,450 / 3,000 XP</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div className="h-full w-[82%] rounded-full gradient-primary" style={{ boxShadow: "0 0 12px hsl(330, 100%, 60% / 0.4)" }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border mb-4">
          {[
            { icon: Grid3X3, label: "Vidéos" },
            { icon: Heart, label: "Aimées" },
            { icon: Bookmark, label: "Sauvegardées" },
          ].map((tab, i) => (
            <button
              key={tab.label}
              className={`flex-1 flex items-center justify-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
                i === 0 ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Video Grid */}
        <div className="grid grid-cols-3 gap-1">
          {Array.from({ length: 9 }).map((_, i) => (
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
