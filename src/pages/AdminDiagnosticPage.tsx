import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Stethoscope, PlayCircle, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DiagEntry {
  at: string;
  targetUsername: string;
  ok: boolean;
  reason: string;
  rawCode?: string;
}

function classifyError(err: any): { reason: string; code: string } {
  const msg = (err?.message || "").toLowerCase();
  if (!err) return { reason: "Inconnu", code: "unknown" };
  if (msg.includes("rate limit")) return { reason: "Rate-limit serveur (anti-spam)", code: "rate_limit" };
  if (msg.includes("duplicate")) return { reason: "Message dupliqué récemment bloqué", code: "duplicate" };
  if (msg.includes("blocked")) return { reason: "Conversation bloquée (block mutuel)", code: "blocked" };
  if (msg.includes("mutual follow")) return { reason: "Mutual follow requis (non-admin)", code: "mutual_follow" };
  if (msg.includes("row-level security") || msg.includes("rls") || msg.includes("violates")) return { reason: "Refus RLS (policy)", code: "rls" };
  if (msg.includes("not authenticated")) return { reason: "Session expirée", code: "auth" };
  if (msg.includes("too long")) return { reason: "Message trop long", code: "length" };
  return { reason: err?.message || "Erreur inconnue", code: "other" };
}

export default function AdminDiagnosticPage() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [running, setRunning] = useState(false);
  const [entries, setEntries] = useState<DiagEntry[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const runDiagnostic = async () => {
    if (!user) return;
    setRunning(true);
    setEntries([]);
    const sample = await supabase
      .from("profiles")
      .select("id, username, is_private")
      .neq("id", user.id)
      .limit(6);
    const targets = sample.data || [];
    setProgress({ done: 0, total: targets.length });
    const results: DiagEntry[] = [];
    for (const t of targets as any[]) {
      const at = new Date().toLocaleTimeString();
      try {
        const { data: convId, error: rpcErr } = await supabase.rpc(
          "find_or_create_direct_conversation",
          { _other_user_id: t.id } as any,
        );
        if (rpcErr || !convId) throw rpcErr || new Error("RPC failed");
        const { error: insErr } = await (supabase as any).from("messages").insert({
          conversation_id: convId,
          sender_id: user.id,
          content: `[DIAG ${Date.now()}] Test diagnostic (à ignorer)`,
          content_version: "plain",
        });
        if (insErr) throw insErr;
        results.push({ at, targetUsername: t.username, ok: true, reason: "Envoi réussi" });
      } catch (err: any) {
        const c = classifyError(err);
        results.push({ at, targetUsername: t.username, ok: false, reason: c.reason, rawCode: c.code });
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
      setEntries([...results]);
    }
    setRunning(false);
  };

  if (role !== "super_admin" && role !== "admin") {
    return (
      <div className="min-h-[100svh] grid place-items-center bg-background text-center">
        <p className="text-sm text-muted-foreground">Accès réservé aux admins.</p>
      </div>
    );
  }

  const failed = entries.filter(e => !e.ok);
  const succeeded = entries.filter(e => e.ok);

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mobile-page-top-safe mx-auto max-w-2xl px-4">
        <div className="flex items-center gap-3 mb-6">
          <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="tap-target-lg glass-action grid place-items-center rounded-full" aria-label="Retour">
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </motion.button>
          <Stethoscope className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Diagnostic envoi admin</h1>
        </div>

        <div className="glass rounded-2xl p-4 mb-4">
          <p className="text-sm font-bold text-foreground">Tester l'envoi vers 6 profils variés</p>
          <p className="mt-1 text-xs text-muted-foreground">Identifie pour chaque cible la raison exacte d'un échec : RLS, rate-limit, mutual follow, block, longueur.</p>
          <button
            type="button"
            disabled={running}
            onClick={runDiagnostic}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-45"
          >
            <PlayCircle className="h-4 w-4" />
            {running ? `En cours… ${progress.done}/${progress.total}` : "Lancer le diagnostic"}
          </button>
        </div>

        {entries.length > 0 && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="glass rounded-xl p-3">
              <CheckCircle2 className="h-4 w-4 text-primary mb-1" />
              <p className="text-lg font-bold text-foreground tabular-nums">{succeeded.length}</p>
              <p className="text-[11px] text-muted-foreground">Envois OK</p>
            </div>
            <div className="glass rounded-xl p-3">
              <AlertCircle className="h-4 w-4 text-destructive mb-1" />
              <p className="text-lg font-bold text-foreground tabular-nums">{failed.length}</p>
              <p className="text-[11px] text-muted-foreground">Échecs détaillés</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {entries.map((e, i) => (
            <div key={i} className={`rounded-xl border p-3 ${e.ok ? "border-primary/30 bg-primary/5" : "border-destructive/40 bg-destructive/10"}`}>
              <div className="flex items-center gap-2">
                {e.ok ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <AlertCircle className="h-4 w-4 text-destructive" />}
                <span className="text-sm font-semibold text-foreground">@{e.targetUsername}</span>
                <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {e.at}
                </span>
              </div>
              <p className={`mt-1 text-xs ${e.ok ? "text-muted-foreground" : "text-destructive"}`}>{e.reason}</p>
              {e.rawCode && <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">code: {e.rawCode}</p>}
            </div>
          ))}
          {entries.length === 0 && !running && (
            <p className="text-center text-xs text-muted-foreground py-4">Aucun test exécuté pour le moment.</p>
          )}
        </div>
      </div>
    </div>
  );
}
