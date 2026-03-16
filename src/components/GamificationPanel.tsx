import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, Star, Trophy, Target, Gift, Zap, Award, Crown, ChevronRight, X } from "lucide-react";
import confetti from "canvas-confetti";

interface Badge {
  icon: React.ReactNode;
  name: string;
  description: string;
  unlocked: boolean;
  rarity: "common" | "rare" | "epic" | "legendary";
}

interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  xp: number;
  progress: number;
  total: number;
  completed: boolean;
}

const badges: Badge[] = [
  { icon: <Flame className="h-5 w-5" />, name: "Première Flamme", description: "Première vidéo likée", unlocked: true, rarity: "common" },
  { icon: <Star className="h-5 w-5" />, name: "Étoile Montante", description: "100 abonnés", unlocked: true, rarity: "common" },
  { icon: <Trophy className="h-5 w-5" />, name: "Viral", description: "Vidéo à 10K vues", unlocked: true, rarity: "rare" },
  { icon: <Zap className="h-5 w-5" />, name: "Lightning", description: "7 jours de streak", unlocked: true, rarity: "rare" },
  { icon: <Crown className="h-5 w-5" />, name: "Roi du Contenu", description: "50 vidéos publiées", unlocked: false, rarity: "epic" },
  { icon: <Award className="h-5 w-5" />, name: "Légende", description: "1M de likes totaux", unlocked: false, rarity: "legendary" },
];

const dailyChallenges: DailyChallenge[] = [
  { id: "1", title: "Social Butterfly 🦋", description: "Like 10 vidéos", xp: 50, progress: 7, total: 10, completed: false },
  { id: "2", title: "Commentateur 💬", description: "Laisse 5 commentaires", xp: 75, progress: 5, total: 5, completed: true },
  { id: "3", title: "Partageur 📤", description: "Partage 3 vidéos", xp: 60, progress: 1, total: 3, completed: false },
  { id: "4", title: "Créateur du Jour 🎬", description: "Publie une vidéo", xp: 150, progress: 0, total: 1, completed: false },
];

const rarityColors: Record<string, string> = {
  common: "from-zinc-400 to-zinc-600",
  rare: "from-blue-400 to-indigo-600",
  epic: "from-purple-400 to-pink-600",
  legendary: "from-amber-400 to-orange-600",
};

interface GamificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GamificationPanel({ isOpen, onClose }: GamificationPanelProps) {
  const [xp, setXp] = useState(2450);
  const [level, setLevel] = useState(7);
  const [streak, setStreak] = useState(12);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const maxXp = 3000;

  const triggerConfetti = useCallback(() => {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#ff3399", "#00d4ff", "#ffcc00", "#ff6600"],
    });
  }, []);

  const claimChallenge = (id: string) => {
    const challenge = dailyChallenges.find((c) => c.id === id);
    if (!challenge || !challenge.completed) return;
    const newXp = xp + challenge.xp;
    setXp(newXp);
    if (newXp >= maxXp) {
      setLevel((l) => l + 1);
      setShowLevelUp(true);
      triggerConfetti();
      setTimeout(() => setShowLevelUp(false), 3000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-background/60"
          />

          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-[70] max-h-[85svh] rounded-t-3xl bg-card border-t border-border flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-lg font-bold text-foreground">🏆 Récompenses</span>
              <motion.button whileTap={{ scale: 0.9 }} onClick={onClose}>
                <X className="h-5 w-5 text-muted-foreground" />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-6">
              {/* Level & XP */}
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-14 w-14 rounded-2xl gradient-primary flex items-center justify-center text-xl font-bold text-primary-foreground">
                      {level}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">Niveau {level}</h3>
                      <p className="text-xs text-muted-foreground">Créateur Étoile ⭐</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-foreground tabular-nums">{xp.toLocaleString()}</span>
                    <p className="text-[10px] text-muted-foreground">/ {maxXp.toLocaleString()} XP</p>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full gradient-primary"
                    style={{ boxShadow: "0 0 12px hsl(330, 100%, 60% / 0.4)" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(xp / maxXp) * 100}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* Streak */}
              <div className="glass rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: "conic-gradient(hsl(330, 100%, 60%), hsl(190, 100%, 50%), hsl(330, 100%, 60%))" }}>
                    <Flame className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Streak 🔥</h3>
                    <p className="text-xs text-muted-foreground">Jours consécutifs</p>
                  </div>
                </div>
                <span className="text-3xl font-extrabold text-foreground tabular-nums">{streak}</span>
              </div>

              {/* Daily Challenges */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Défis du Jour
                </h3>
                <div className="space-y-2">
                  {dailyChallenges.map((c) => (
                    <motion.div
                      key={c.id}
                      whileTap={{ scale: 0.98 }}
                      className={`glass rounded-xl p-3 flex items-center gap-3 ${c.completed ? "ring-1 ring-accent/30" : ""}`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-foreground">{c.title}</span>
                          <span className="text-[10px] font-bold text-accent tabular-nums">+{c.xp} XP</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-1.5">{c.description}</p>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full transition-all ${c.completed ? "bg-accent" : "gradient-primary"}`}
                            style={{ width: `${(c.progress / c.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {c.progress}/{c.total}
                        </span>
                      </div>
                      {c.completed && (
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => claimChallenge(c.id)}
                          className="rounded-lg gradient-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground"
                        >
                          Réclamer
                        </motion.button>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Badges */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <Award className="h-4 w-4 text-primary" />
                  Badges
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {badges.map((b) => (
                    <motion.div
                      key={b.name}
                      whileTap={{ scale: 0.95 }}
                      className={`glass rounded-xl p-3 flex flex-col items-center text-center ${!b.unlocked ? "opacity-40" : ""}`}
                    >
                      <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${rarityColors[b.rarity]} flex items-center justify-center mb-1.5 text-primary-foreground`}>
                        {b.icon}
                      </div>
                      <span className="text-[10px] font-semibold text-foreground">{b.name}</span>
                      <span className="text-[8px] text-muted-foreground">{b.description}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Level Up Overlay */}
          <AnimatePresence>
            {showLevelUp && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="fixed inset-0 z-[80] flex items-center justify-center"
              >
                <div className="text-center">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.2, 1] }}
                    transition={{ duration: 0.5 }}
                    className="text-6xl mb-4"
                  >
                    🎉
                  </motion.div>
                  <h2 className="text-3xl font-extrabold text-foreground mb-2">Niveau {level} !</h2>
                  <p className="text-sm text-muted-foreground">Tu es maintenant un Créateur Étoile ⭐</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}
