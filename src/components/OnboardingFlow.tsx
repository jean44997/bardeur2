import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, UserPlus, Check, ArrowRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Suggestion {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  xp: number;
}

/**
 * 3-step onboarding shown after first signup.
 * Step 1: 3D welcome with rotating gradient orbs.
 * Step 2: Suggested top XP users to follow (skippable, never required).
 * Step 3: Done — sets profile.onboarding_completed.
 */
export default function OnboardingFlow() {
  const { user, profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (profile.onboarding_completed) { setVisible(false); return; }
    setVisible(true);
  }, [user, profile]);

  useEffect(() => {
    if (visible && step === 1 && suggestions.length === 0) loadSuggestions();
  }, [visible, step]);

  const loadSuggestions = async () => {
    if (!user) return;
    setLoading(true);
    // 1) Always include admin / super_admin profiles first (verified team).
    const { data: adminRoles } = await (supabase as any)
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["super_admin", "admin"]);
    const adminIds: string[] = Array.from(
      new Set(((adminRoles || []) as any[]).map((r) => r.user_id).filter((id: string) => id && id !== user.id))
    );

    const merged: Suggestion[] = [];
    if (adminIds.length > 0) {
      const { data: admins } = await (supabase as any)
        .from("profiles")
        .select("id, username, display_name, avatar_url, xp_total")
        .in("id", adminIds);
      (admins || []).forEach((p: any) => merged.push({ ...p, xp: p.xp_total || 0 }));
    }

    // 2) Then top XP creators (excluding self + already included admins).
    const exclude = [user.id, ...adminIds];
    let q: any = (supabase as any).from("profiles").select("id, username, display_name, avatar_url, xp_total");
    if (exclude.length) q = q.not("id", "in", `(${exclude.map((id) => `"${id}"`).join(",")})`);
    const { data: top } = await q.order("xp_total", { ascending: false }).limit(8);
    (top || []).forEach((p: any) => merged.push({ ...p, xp: p.xp_total || 0 }));

    setSuggestions(merged.slice(0, 10));
    setLoading(false);
  };

  const toggleFollow = async (s: Suggestion) => {
    if (!user) return;
    const next = new Set(followed);
    if (next.has(s.id)) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", s.id);
      next.delete(s.id);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: s.id });
      next.add(s.id);
    }
    setFollowed(next);
  };

  const complete = async () => {
    if (!user) return;
    await (supabase as any).from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    await refreshProfile();
    setVisible(false);
    toast.success("Bienvenue sur BARDEUR YK 🎉");
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-background/95 backdrop-blur-xl overflow-y-auto"
      >
        {/* Skip everything */}
        <button
          onClick={complete}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex items-center gap-1 rounded-full bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Passer <X className="h-3.5 w-3.5" />
        </button>

        <div className="mx-auto flex min-h-[100svh] max-w-md flex-col items-center justify-center px-6 py-12">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center text-center"
              >
                {/* 3D rotating orbs */}
                <div className="relative mb-8 h-48 w-48" style={{ perspective: 800 }}>
                  <motion.div
                    animate={{ rotateY: 360, rotateX: 360 }}
                    transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
                    style={{ transformStyle: "preserve-3d" }}
                    className="relative h-full w-full"
                  >
                    {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                      <motion.div
                        key={deg}
                        animate={{ scale: [1, 1.15, 1] }}
                        transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
                        style={{
                          transform: `rotateY(${deg}deg) translateZ(70px)`,
                          transformStyle: "preserve-3d",
                        }}
                        className="absolute inset-0 m-auto h-16 w-16 rounded-full"
                      >
                        <div className="h-full w-full rounded-full gradient-primary opacity-80 blur-[2px] shadow-[0_0_40px_hsl(var(--primary)/0.6)]" />
                      </motion.div>
                    ))}
                  </motion.div>
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <Sparkles className="h-10 w-10 text-primary drop-shadow-[0_0_20px_hsl(var(--primary))]" />
                  </div>
                </div>

                <h1 className="mb-2 text-3xl font-extrabold text-foreground">Bienvenue 👋</h1>
                <p className="mb-8 text-sm text-muted-foreground">
                  Crée, partage, monte de niveau. Tu décides ce qui s'affiche dans ton feed.
                </p>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setStep(1)}
                  className="flex items-center gap-2 rounded-full gradient-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg"
                >
                  Commencer <ArrowRight className="h-4 w-4" />
                </motion.button>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="suggest"
                initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
                className="w-full"
              >
                <h2 className="mb-1 text-center text-2xl font-extrabold text-foreground">Suggestions</h2>
                <p className="mb-6 text-center text-xs text-muted-foreground">
                  Suis quelques créateurs pour démarrer ton feed. C'est optionnel.
                </p>

                {loading ? (
                  <div className="grid gap-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />
                    ))}
                  </div>
                ) : suggestions.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Aucune suggestion disponible.</p>
                ) : (
                  <div className="grid gap-2">
                    {suggestions.map(s => {
                      const isFollowed = followed.has(s.id);
                      return (
                        <motion.div
                          key={s.id}
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          className="flex items-center gap-3 rounded-2xl bg-card p-3"
                        >
                          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full bg-secondary">
                            {s.avatar_url ? (
                              <img src={s.avatar_url} className="h-full w-full object-cover" alt="" />
                            ) : (
                              <div className="grid h-full w-full place-items-center text-sm font-bold text-secondary-foreground">
                                {(s.display_name || s.username)[0]?.toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">@{s.username}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{s.display_name} · {s.xp || 0} XP</p>
                          </div>
                          <motion.button
                            whileTap={{ scale: 0.92 }}
                            onClick={() => toggleFollow(s)}
                            className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${isFollowed ? "bg-secondary text-foreground" : "gradient-primary text-primary-foreground"}`}
                          >
                            {isFollowed ? <><Check className="h-3 w-3" /> Suivi</> : <><UserPlus className="h-3 w-3" /> Suivre</>}
                          </motion.button>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between gap-3">
                  <button
                    onClick={complete}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Passer cette étape
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.96 }}
                    onClick={complete}
                    className="flex items-center gap-2 rounded-full gradient-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg"
                  >
                    {followed.size > 0 ? `Terminer (${followed.size})` : "Terminer"} <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
