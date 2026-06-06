import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Ban, Infinity as InfinityIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  target: { id: string; username?: string; display_name?: string } | null;
  onBanned?: () => void;
}

const PRESETS: Array<{ label: string; hours: number }> = [
  { label: "1 heure", hours: 1 },
  { label: "24 heures", hours: 24 },
  { label: "7 jours", hours: 24 * 7 },
  { label: "30 jours", hours: 24 * 30 },
];

export default function BanUserDialog({ open, onClose, target, onBanned }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<"temp" | "perm">("temp");
  const [hours, setHours] = useState<number>(24);
  const [customHours, setCustomHours] = useState<string>("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!target) return null;

  const submit = async () => {
    if (!user) return;
    setBusy(true);
    const finalHours = customHours ? Math.max(1, parseInt(customHours, 10) || 0) : hours;
    const expires = mode === "temp" ? new Date(Date.now() + finalHours * 3_600_000).toISOString() : null;
    const { error } = await (supabase as any).from("banned_users").insert({
      user_id: target.id,
      banned_by: user.id,
      reason: reason.trim() || "Violation des règles communautaires BARDEUR",
      expires_at: expires,
      is_permanent: mode === "perm",
    });
    setBusy(false);
    if (error) { toast.error(error.message || "Bannissement impossible"); return; }
    toast.success(mode === "perm" ? `@${target.username} banni définitivement` : `@${target.username} banni ${finalHours}h`);
    onBanned?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 z-[90] bg-background/70 backdrop-blur-sm" />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-[91] max-h-[90svh] overflow-y-auto rounded-t-3xl border-t border-destructive/30 bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:left-1/2 sm:bottom-auto sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-md sm:rounded-3xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-destructive/15">
                  <Ban className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Bannir @{target.username}</h3>
                  <p className="text-xs text-muted-foreground">{target.display_name || ""}</p>
                </div>
              </div>
              <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-secondary"><X className="h-4 w-4" /></button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode("temp")} className={`rounded-xl py-3 text-sm font-bold ${mode === "temp" ? "gradient-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                Temporaire
              </button>
              <button type="button" onClick={() => setMode("perm")} className={`flex items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-bold ${mode === "perm" ? "bg-destructive text-destructive-foreground" : "bg-secondary text-foreground"}`}>
                <InfinityIcon className="h-4 w-4" /> Définitif
              </button>
            </div>

            {mode === "temp" && (
              <>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Durée</label>
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {PRESETS.map(p => (
                    <button
                      key={p.hours}
                      type="button"
                      onClick={() => { setHours(p.hours); setCustomHours(""); }}
                      className={`rounded-lg py-2.5 text-xs font-bold ${!customHours && hours === p.hours ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ou durée personnalisée (heures)</label>
                <input
                  type="number" min={1} max={8760} inputMode="numeric"
                  value={customHours}
                  onChange={e => setCustomHours(e.target.value)}
                  onFocus={e => setTimeout(() => e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" }), 200)}
                  placeholder="ex: 48"
                  className="mb-4 w-full rounded-xl border border-border bg-secondary px-3 py-3 text-sm text-foreground outline-none focus:border-primary"
                />
              </>
            )}

            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Motif (visible par l'utilisateur)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              onFocus={e => setTimeout(() => e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" }), 200)}
              rows={3}
              maxLength={400}
              placeholder="ex: spam répété, contenu inapproprié..."
              className="mb-4 w-full resize-none rounded-xl border border-border bg-secondary px-3 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />

            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="w-full rounded-xl bg-destructive py-3 text-sm font-bold text-destructive-foreground disabled:opacity-50"
            >
              {busy ? "..." : mode === "perm" ? "Bannir définitivement" : `Bannir pour ${customHours || hours}h`}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
