import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { motion } from "framer-motion";
import { Shield, Check, X } from "lucide-react";

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: any }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: any }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: any }>;
};

function oauth(): OAuthNamespace {
  return (supabase.auth as unknown as { oauth: OAuthNamespace }).oauth;
}

export default function OAuthConsentPage() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Requête invalide : authorization_id manquant.");
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      try {
        const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
        if (!active) return;
        if (error) {
          setError(error.message);
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data);
      } catch (e: any) {
        setError(e?.message ?? "Impossible de charger la demande d'autorisation.");
      }
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve
        ? await oauth().approveAuthorization(authorizationId)
        : await oauth().denyAuthorization(authorizationId);
      if (error) {
        setBusy(false);
        setError(error.message);
        return;
      }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) {
        setBusy(false);
        setError("Aucune URL de redirection renvoyée par le serveur d'autorisation.");
        return;
      }
      window.location.href = target;
    } catch (e: any) {
      setBusy(false);
      setError(e?.message ?? "Erreur lors de la validation.");
    }
  }

  return (
    <main className="min-h-[100svh] bg-background flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-border/60 bg-card/80 backdrop-blur-xl p-6 shadow-2xl"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="h-12 w-12 rounded-2xl gradient-primary flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Autoriser l'accès</h1>
            <p className="text-xs text-muted-foreground">Intégration BARDEUR YK</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!details && !error && (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        )}

        {details && (
          <>
            <p className="text-sm text-foreground mb-2">
              <span className="font-semibold">{details.client?.name ?? "Une application"}</span>{" "}
              souhaite se connecter à ton compte BARDEUR YK.
            </p>
            <p className="text-xs text-muted-foreground mb-5">
              Elle pourra agir en ton nom via les outils autorisés (profil, conversations, notifications).
              Tu peux révoquer l'accès à tout moment.
            </p>

            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => decide(false)}
                className="flex-1 rounded-xl border border-border/60 bg-secondary/40 px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary transition disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-2">
                  <X className="h-4 w-4" /> Refuser
                </span>
              </button>
              <button
                disabled={busy}
                onClick={() => decide(true)}
                className="flex-1 rounded-xl gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                <span className="flex items-center justify-center gap-2">
                  <Check className="h-4 w-4" /> Autoriser
                </span>
              </button>
            </div>
          </>
        )}
      </motion.div>
    </main>
  );
}
