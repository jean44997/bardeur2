import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, BellRing } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface IncomingCallNotice {
  id: string;
  conversationId: string;
  callerId: string;
  callType: "audio" | "video";
  callerName: string;
}

export default function GlobalCallListener() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incoming, setIncoming] = useState<IncomingCallNotice | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<number | null>(null);
  const incomingIdRef = useRef<string | null>(null);

  const stopRing = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  };

  const startRing = () => {
    stopRing();
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    audioCtxRef.current = ctx;
    ctx.resume?.().catch(() => {});
    const beep = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 740;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    };
    beep();
    timerRef.current = window.setInterval(beep, 1100);
  };

  useEffect(() => {
    incomingIdRef.current = incoming?.id || null;
  }, [incoming?.id]);

  useEffect(() => {
    if (!user) {
      setIncoming(null);
      stopRing();
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const channel = supabase
      .channel(`global-calls-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_call_sessions", filter: `recipient_id=eq.${user.id}` }, async (payload) => {
        const call = payload.new as any;
        if (!call || call.status !== "ringing" || call.caller_id === user.id) return;
        if (window.location.pathname === `/chat/${call.conversation_id}`) return;
        const { data: caller } = await supabase.from("profiles").select("username, display_name, avatar_url").eq("id", call.caller_id).maybeSingle();
        const callerName = (caller as any)?.display_name || (caller as any)?.username || "Utilisateur";
        setIncoming({
          id: call.id,
          conversationId: call.conversation_id,
          callerId: call.caller_id,
          callType: call.call_type === "video" ? "video" : "audio",
          callerName,
        });
        startRing();
        navigator.vibrate?.([220, 90, 220, 90, 220, 90, 220]);
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          try {
            const reg = await navigator.serviceWorker?.getRegistration();
            const title = call.call_type === "video" ? "Appel vidéo entrant" : "Appel audio entrant";
            const opts: NotificationOptions = {
              body: `${callerName} t'appelle`,
              icon: (caller as any)?.avatar_url || "/icon-192.png",
              badge: "/icon-192.png",
              tag: `call-${call.id}`,
              requireInteraction: true,
              data: { url: `/chat/${call.conversation_id}?call=${call.id}&answer=1` },
            };
            if (reg && (reg as any).showNotification) await (reg as any).showNotification(title, opts);
            else new Notification(title, opts);
          } catch {}
        }
      })

      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_call_sessions", filter: `recipient_id=eq.${user.id}` }, (payload) => {
        const call = payload.new as any;
        if (incomingIdRef.current === call?.id && call.status !== "ringing") {
          setIncoming(null);
          stopRing();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      stopRing();
    };
  }, [user]);

  const accept = () => {
    if (!incoming) return;
    stopRing();
    const call = incoming;
    setIncoming(null);
    navigate(`/chat/${call.conversationId}?call=${call.id}&answer=1`);
  };

  const decline = async () => {
    if (!incoming) return;
    const callId = incoming.id;
    setIncoming(null);
    stopRing();
    await (supabase as any).from("direct_call_sessions").update({ status: "declined", ended_at: new Date().toISOString() }).eq("id", callId);
    toast.info("Appel refuse");
  };

  return (
    <AnimatePresence>
      {incoming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] flex items-center justify-center bg-background/88 px-4 backdrop-blur-xl"
        >
          <motion.div initial={{ scale: 0.94, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 18 }} className="w-full max-w-xs rounded-3xl border border-border bg-card p-5 text-center shadow-2xl">
            <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full gradient-primary text-2xl font-black text-primary-foreground">
              {incoming.callType === "video" ? <Video className="h-8 w-8" /> : <BellRing className="h-8 w-8" />}
            </div>
            <p className="text-lg font-bold text-foreground">{incoming.callerName}</p>
            <p className="mt-1 text-xs font-semibold text-primary">{incoming.callType === "video" ? "Appel video entrant" : "Appel audio entrant"}</p>
            <div className="mt-5 flex items-center justify-center gap-5">
              <button type="button" onClick={decline} className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground" aria-label="Refuser l'appel">
                <PhoneOff className="h-6 w-6" />
              </button>
              <button type="button" onClick={accept} className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground" aria-label="Decrocher">
                <Phone className="h-6 w-6" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
