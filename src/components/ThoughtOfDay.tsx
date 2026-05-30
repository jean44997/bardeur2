import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Edit3, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface ThoughtOfDayProps {
  ownerId: string;
  ownerName: string;
  isOwn: boolean;
  initialThought?: string;
  initialUpdatedAt?: string | null;
  onSaved?: (thought: string) => void;
}

const MAX = 280;

export default function ThoughtOfDay({ ownerId, ownerName, isOwn, initialThought = "", initialUpdatedAt, onSaved }: ThoughtOfDayProps) {
  const [thought, setThought] = useState(initialThought || "");
  const [draft, setDraft] = useState(initialThought || "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt || null);

  useEffect(() => {
    setThought(initialThought || "");
    setDraft(initialThought || "");
    setUpdatedAt(initialUpdatedAt || null);
  }, [initialThought, initialUpdatedAt, ownerId]);

  const isFresh = (() => {
    if (!updatedAt) return false;
    const diff = Date.now() - new Date(updatedAt).getTime();
    return diff < 36 * 60 * 60 * 1000;
  })();

  if (!isOwn && !(thought && isFresh)) return null;

  const save = async () => {
    const trimmed = draft.trim().slice(0, MAX);
    setSaving(true);
    const { error } = await (supabase as any).rpc("set_thought_of_day", { _thought: trimmed });
    setSaving(false);
    if (error) {
      toast.error("Impossible d'enregistrer la pensée");
      return;
    }
    setThought(trimmed);
    setUpdatedAt(new Date().toISOString());
    setEditing(false);
    onSaved?.(trimmed);
    toast.success(trimmed ? "Pensée du jour publiée ✨" : "Pensée du jour effacée");
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mb-4 overflow-hidden rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,hsl(var(--primary)/0.18),hsl(var(--accent)/0.10))] p-4"
      aria-label="Pensée du jour"
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
      <header className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/20">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">Pensée du jour</p>
          {!isOwn && <p className="truncate text-[10px] text-muted-foreground">par @{ownerName}</p>}
        </div>
        {isOwn && !editing && (
          <button
            type="button"
            onClick={() => { setDraft(thought); setEditing(true); }}
            className="grid h-8 w-8 place-items-center rounded-full bg-card text-muted-foreground transition hover:text-foreground"
            aria-label="Modifier la pensée"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      <AnimatePresence mode="wait">
        {editing ? (
          <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
              maxLength={MAX}
              rows={3}
              autoFocus
              placeholder="Une phrase, une vibe, une intention pour aujourd'hui..."
              className="w-full resize-none rounded-xl bg-background/70 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-1 ring-border focus:ring-primary"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] tabular-nums text-muted-foreground">{draft.length}/{MAX}</span>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => { setEditing(false); setDraft(thought); }} className="grid h-8 w-8 place-items-center rounded-full bg-card text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="grid h-8 min-w-8 place-items-center gap-1 rounded-full gradient-primary px-3 text-[11px] font-bold text-primary-foreground disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Publier
                </button>
              </div>
            </div>
          </motion.div>
        ) : thought ? (
          <motion.p key="thought" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[15px] font-medium leading-snug text-foreground">
            « {thought} »
          </motion.p>
        ) : (
          <motion.button
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setEditing(true)}
            className="w-full rounded-xl border border-dashed border-primary/30 bg-background/40 px-3 py-3 text-left text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground"
          >
            Partage ta pensée du jour — visible sur ton profil pendant 24h.
          </motion.button>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
