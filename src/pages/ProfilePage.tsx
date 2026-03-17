import { useState } from "react";
import { Settings, Grid3X3, Heart, Bookmark, BadgeCheck, Share2, QrCode, Link2, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import logo from "@/assets/logo.png";

const stats = [
  { label: "Abonnements", value: "234" },
  { label: "Abonnés", value: "12.4K" },
  { label: "J'aime", value: "89.2K" },
];

const badges = [
  { emoji: "🥉", label: "Débutant", unlocked: true },
  { emoji: "🥈", label: "Actif", unlocked: true },
  { emoji: "🥇", label: "Star", unlocked: false },
  { emoji: "👑", label: "Créateur d'or", unlocked: false },
  { emoji: "💎", label: "Légende", unlocked: false },
];

export default function ProfilePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(0);
  const [showQR, setShowQR] = useState(false);

  const tabs = [
    { icon: Grid3X3, label: "Vidéos" },
    { icon: Heart, label: "Aimées" },
    { icon: Bookmark, label: "Sauvegardées" },
  ];

  return (
    <div className="min-h-[100svh] bg-background pb-20 md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-lg px-4 pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-foreground">@monprofil</h1>
          <div className="flex items-center gap-2">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => setShowQR(true)}>
              <QrCode className="h-5 w-5 text-muted-foreground" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate("/settings")}>
              <Settings className="h-5 w-5 text-muted-foreground" />
            </motion.button>
          </div>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-3">
            <div className="h-24 w-24 rounded-full gradient-primary flex items-center justify-center text-3xl font-bold text-primary-foreground ring-4 ring-background">
              B
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary flex items-center justify-center ring-2 ring-background"
            >
              <Camera className="h-4 w-4 text-primary-foreground" />
            </motion.button>
          </div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-lg font-bold text-foreground">BARDEUR User</span>
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
            <motion.button whileTap={{ scale: 0.95 }} className="rounded-lg gradient-primary px-6 py-2 text-sm font-semibold text-primary-foreground">
              Modifier le profil
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} className="glass rounded-lg px-4 py-2" onClick={() => {
              navigator.clipboard.writeText("bardeur.app/profil/monprofil");
              toast.success("Lien copié ! 🔗");
            }}>
              <Link2 className="h-4 w-4 text-foreground" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.95 }} className="glass rounded-lg px-4 py-2" onClick={() => setShowQR(true)}>
              <Share2 className="h-4 w-4 text-foreground" />
            </motion.button>
          </div>
        </div>

        {/* Badges */}
        <div className="glass rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-foreground mb-2">🏆 Trophées</p>
          <div className="flex gap-2 justify-center">
            {badges.map((b) => (
              <div
                key={b.label}
                className={`flex flex-col items-center gap-0.5 ${b.unlocked ? "" : "opacity-30 grayscale"}`}
                title={b.label}
              >
                <span className="text-xl">{b.emoji}</span>
                <span className="text-[9px] text-muted-foreground">{b.label}</span>
              </div>
            ))}
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
          {tabs.map((tab, i) => (
            <button
              key={tab.label}
              onClick={() => setActiveTab(i)}
              className={`flex-1 flex items-center justify-center gap-1.5 pb-3 text-sm font-medium border-b-2 transition-colors ${
                i === activeTab ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
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

        {/* QR Modal */}
        <AnimatePresence>
          {showQR && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center px-8"
              onClick={() => setShowQR(false)}
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
                className="glass rounded-2xl p-8 text-center max-w-xs w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <img src={logo} alt="BARDEUR YK" className="h-12 w-12 mx-auto mb-3 rounded-xl" />
                <h3 className="text-lg font-bold text-foreground mb-1">@monprofil</h3>
                <p className="text-xs text-muted-foreground mb-4">Scanne pour voir le profil</p>
                <div className="h-40 w-40 mx-auto rounded-xl bg-foreground flex items-center justify-center mb-4">
                  <QrCode className="h-24 w-24 text-background" />
                </div>
                <p className="text-xs text-muted-foreground">bardeur.app/profil/monprofil</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}