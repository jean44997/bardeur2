import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldAlert, LogOut, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface BanInfo {
  banned: boolean;
  reason: string | null;
  expires_at: string | null;
  is_permanent: boolean;
}

/**
 * Wraps the app. If the signed-in user is banned (permanent or active temporary ban),
 * renders a full-screen professional suspension notice that blocks all navigation.
 */
export default function BanGate({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [ban, setBan] = useState<BanInfo | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user) { setBan(null); setChecked(true); return; }
    let cancelled = false;
    const check = async () => {
      const { data } = await (supabase as any).rpc("is_user_banned", { _user_id: user.id });
      if (cancelled) return;
      const row = Array.isArray(data) && data.length ? data[0] : null;
      setBan(row && row.banned ? row : null);
      setChecked(true);
    };
    check();
    const interval = window.setInterval(check, 60_000); // re-check every minute (handles unban while open)
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [user?.id]);

  if (!checked || !ban?.banned) return <>{children}</>;

  const expiresLabel = ban.is_permanent
    ? "Permanent"
    : ban.expires_at
      ? new Date(ban.expires_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })
      : "Indéterminé";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-md rounded-3xl border border-destructive/30 bg-card p-7 shadow-2xl"
      >
        <div className="mb-5 grid h-16 w-16 place-items-center rounded-full bg-destructive/15">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Compte suspendu</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          L'accès à ton compte BARDEUR a été temporairement restreint par notre équipe de modération.
          Tu retrouveras tes accès à la date indiquée ci-dessous.
        </p>
        <div className="mb-5 space-y-3 rounded-2xl bg-secondary/40 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Motif</p>
            <p className="text-sm font-medium text-foreground">{ban.reason || "Non précisé"}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Fin de la suspension</p>
            <p className="text-sm font-bold text-foreground">{expiresLabel}</p>
          </div>
        </div>
        <a
          href="mailto:support@bardeur.app?subject=Demande%20de%20revue%20de%20suspension"
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground"
        >
          <Mail className="h-4 w-4" /> Contacter le support
        </a>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-foreground"
        >
          <LogOut className="h-4 w-4" /> Se déconnecter
        </button>
      </motion.div>
    </div>
  );
}
