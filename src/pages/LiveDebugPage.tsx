import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Activity, Wifi, RotateCcw, Volume2, AlertTriangle, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getAdaptiveLiveBufferSize, getConnectionInfo, type LiveDebugEvent } from "@/lib/mediaCapabilities";

export default function LiveDebugPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<LiveDebugEvent[]>([]);
  const [network, setNetwork] = useState(getConnectionInfo());
  const [buffer, setBuffer] = useState(getAdaptiveLiveBufferSize());

  useEffect(() => {
    try {
      const stored = localStorage.getItem("bardeur-live-debug-events");
      if (stored) setEvents(JSON.parse(stored));
    } catch { /* noop */ }
    const onDebug = (event: Event) => setEvents((prev) => [...prev, (event as CustomEvent<LiveDebugEvent>).detail].slice(-80));
    const refreshNetwork = () => { setNetwork(getConnectionInfo()); setBuffer(getAdaptiveLiveBufferSize()); };
    window.addEventListener("bardeur-live-debug", onDebug as EventListener);
    const connection = (navigator as any)?.connection || (navigator as any)?.mozConnection || (navigator as any)?.webkitConnection;
    connection?.addEventListener?.("change", refreshNetwork);
    const timer = window.setInterval(refreshNetwork, 4000);
    return () => {
      window.removeEventListener("bardeur-live-debug", onDebug as EventListener);
      connection?.removeEventListener?.("change", refreshNetwork);
      window.clearInterval(timer);
    };
  }, []);

  const reconnects = events.filter((event) => event.type === "reconnect").length;
  const audio = [...events].reverse().find((event) => event.type === "buffer" || event.type === "audio");
  const errors = events.filter((event) => event.type === "error");

  const clear = () => {
    localStorage.removeItem("bardeur-live-debug-events");
    setEvents([]);
  };

  return (
    <div className="min-h-[100svh] bg-background mobile-page-bottom-safe md:pb-8 md:pl-[var(--sidebar-width,260px)]">
      <div className="mx-auto max-w-3xl px-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => navigate(-1)} className="glass rounded-full p-2" aria-label="Retour">
              <ArrowLeft className="h-5 w-5 text-foreground" />
            </motion.button>
            <div>
              <h1 className="text-xl font-bold text-foreground">Debug live</h1>
              <p className="text-xs text-muted-foreground">Réseau, reconnect, audio et erreurs mobile/iOS</p>
            </div>
          </div>
          <motion.button whileTap={{ scale: 0.95 }} onClick={clear} className="glass rounded-full p-2" aria-label="Vider les logs">
            <Trash2 className="h-4 w-4 text-destructive" />
          </motion.button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DebugCard icon={<Wifi className="h-4 w-4" />} label="Réseau" value={network.effectiveType} detail={`${network.downlink || "?"} Mbps · ${network.rtt || "?"} ms`} />
          <DebugCard icon={<RotateCcw className="h-4 w-4" />} label="Reconnects" value={String(reconnects)} detail="backoff progressif actif" />
          <DebugCard icon={<Volume2 className="h-4 w-4" />} label="Buffer audio" value={`${buffer.audio} chunks`} detail={audio?.message || "Aucune lecture récente"} />
          <DebugCard icon={<AlertTriangle className="h-4 w-4" />} label="Erreurs" value={String(errors.length)} detail={errors.at(-1)?.message || "Aucune erreur"} danger={errors.length > 0} />
        </div>

        <div className="mt-5 glass overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Événements temps réel</span>
          </div>
          <div className="max-h-[58svh] overflow-y-auto no-scrollbar px-4 py-3">
            {events.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Lance ou regarde un live pour voir les diagnostics.</p>
            ) : (
              <div className="space-y-2">
                {[...events].reverse().map((event, index) => (
                  <div key={`${event.ts}-${index}`} className="rounded-xl bg-card px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-foreground">{event.type}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(event.ts).toLocaleTimeString("fr-FR")}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{event.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DebugCard({ icon, label, value, detail, danger }: { icon: React.ReactNode; label: string; value: string; detail: string; danger?: boolean }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${danger ? "bg-destructive/20 text-destructive" : "bg-card text-primary"}`}>{icon}</div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-extrabold text-foreground">{value}</p>
      <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
